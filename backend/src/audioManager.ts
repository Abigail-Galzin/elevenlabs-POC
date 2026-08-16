/**
 * AudioManager — handles all interactions with the ElevenLabs API and local audio files.
 *
 * Responsibilities:
 *   - Text-to-Speech synthesis via `eleven_flash_v2_5` (0.5 credits/char)
 *   - Speech-to-Text transcription via `scribe_v1`
 *   - MD5-hash-based local disk caching for synthesized audio
 *   - Audio segment stitching with ffmpeg (concat + inter-segment silence)
 */

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ffmpeg from "fluent-ffmpeg";

// ffmpeg-static ships as CommonJS without an `exports` field, so we load it
// via createRequire for reliable resolution under NodeNext/ESM.
const cjsRequire = createRequire(import.meta.url);
const ffmpegStaticPath: unknown = cjsRequire("ffmpeg-static");
if (typeof ffmpegStaticPath === "string") {
  ffmpeg.setFfmpegPath(ffmpegStaticPath);
}

import type { SynthesisResult, StitchResult } from "./types/index.js";
import {
  CACHE_DIR,
  OUTPUT_DIR,
  CREDITS_PER_CHAR,
  ELEVENLABS_VOICE_ID,
  MAX_BLOCK_CHARS,
  TTS_MODEL,
  STT_MODEL,
  TTS_OUTPUT_FORMAT,
  SEGMENT_SILENCE_SECONDS,
} from "./types/index.js";

/**
 * Result of consuming a ReadableStream<Uint8Array> into a Buffer.
 * Uses the Web Streams API `getReader()` method for compatibility.
 */
async function readableStreamToBuffer(
  stream: ReadableStream<Uint8Array>
): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

/**
 * Generate a temporary file path with a given extension.
 */
function createTempPath(extension: string): string {
  const filename = `podcaster_${Date.now()}_${Math.random().toString(36).slice(2)}${extension}`;
  return join(tmpdir(), filename);
}

/**
 * AudioManager — manages TTS synthesis, STT transcription, caching, and audio stitching.
 */
export class AudioManager {
  private client: ElevenLabsClient;

  /**
   * @param apiKey - ElevenLabs API key (from ELEVENLABS_API_KEY env var).
   */
  constructor(apiKey: string) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error("ElevenLabs API key is required. Set ELEVENLABS_API_KEY in your environment.");
    }
    this.client = new ElevenLabsClient({ apiKey });
    this.ensureDirectories();
  }

  /**
   * Ensure that the cache and output directories exist on disk.
   */
  private ensureDirectories(): void {
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }
    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  }

  /**
   * Generate an MD5 hash of the input text to use as a cache key.
   * @param text - The text to hash.
   * @returns A 32-character hex string.
   */
  generateCacheKey(text: string): string {
    return createHash("md5").update(text, "utf8").digest("hex");
  }

  /**
   * Get the file system path for a cached audio file.
   * @param cacheKey - The MD5 hash key.
   * @returns Full path to the cached MP3 file.
   */
  getCachedAudioPath(cacheKey: string): string {
    return join(CACHE_DIR, `${cacheKey}.mp3`);
  }

  /**
   * Estimate the ElevenLabs credits for synthesizing the given text.
   * @param text - Input text.
   * @returns Estimated credits (text.length × 0.5).
   */
  estimateCredits(text: string): number {
    return text.length * CREDITS_PER_CHAR;
  }

  /**
   * Synthesize speech from text using eleven_flash_v2_5, with local disk caching.
   *
   * If the text has been synthesized before, the cached MP3 is returned instantly
   * with zero credit cost. Otherwise, the API is called and the result is cached.
   *
   * @param text - Text to synthesize. Must be <= MAX_BLOCK_CHARS (249).
   * @returns SynthesisResult containing the file path and credit information.
   * @throws Error if text exceeds MAX_BLOCK_CHARS or if the API call fails.
   */
  async synthesizeSpeech(text: string): Promise<SynthesisResult> {
    if (text.length > MAX_BLOCK_CHARS) {
      throw new Error(
        `Text length ${text.length} exceeds maximum of ${MAX_BLOCK_CHARS} characters. ` +
          "Truncate the text before synthesizing."
      );
    }

    const cacheKey = this.generateCacheKey(text);
    const cachedPath = this.getCachedAudioPath(cacheKey);

    // ---- Cache Hit ----
    if (existsSync(cachedPath)) {
      return {
        filePath: cachedPath,
        charCount: text.length,
        credits: 0,
        fromCache: true,
        cacheKey,
      };
    }

    // ---- Cache Miss: call ElevenLabs TTS API ----
    const audioStream = await this.client.textToSpeech.convert(
      ELEVENLABS_VOICE_ID,
      {
        text,
        modelId: TTS_MODEL,
        outputFormat: TTS_OUTPUT_FORMAT,
      }
    );

    const audioBuffer = await readableStreamToBuffer(audioStream);

    // Persist the synthesized audio to cache.
    writeFileSync(cachedPath, audioBuffer);

    return {
      filePath: cachedPath,
      charCount: text.length,
      credits: this.estimateCredits(text),
      fromCache: false,
      cacheKey,
    };
  }

  /**
   * Transcribe an audio file using ElevenLabs' scribe_v1 model.
   *
   * @param filePath - Path to the audio file (WAV, MP3, M4A, etc.).
   * @returns The transcribed text string.
   * @throws Error if the file cannot be read or the API call fails.
   */
  async transcribeAudio(filePath: string): Promise<string> {
    if (!existsSync(filePath)) {
      throw new Error(`Audio file not found: ${filePath}`);
    }

    const fileBuffer = readFileSync(filePath);

    const response = await this.client.speechToText.convert({
      modelId: STT_MODEL,
      file: fileBuffer,
    });

    return response.text;
  }

  /**
   * Stitch multiple MP3 segment files into a single podcast file.
   * Inter-segment silence (SEGMENT_SILENCE_SECONDS) is added between each pair.
   *
   * @param segmentPaths - Ordered array of MP3 file paths to concatenate.
   * @returns StitchResult with the output file path and duration in seconds.
   * @throws Error if ffmpeg fails during processing.
   */
  async stitchSegments(segmentPaths: string[]): Promise<StitchResult> {
    if (segmentPaths.length === 0) {
      throw new Error("Cannot stitch zero segments.");
    }

    // Generate a temporary silence file for inter-segment padding.
    const silencePath = createTempPath(".mp3");
    await this.generateSilence(SEGMENT_SILENCE_SECONDS, silencePath);

    // Build the concat list: segment, silence, segment, silence, ..., segment.
    // No trailing silence after the last segment.
    const listLines: string[] = [];
    for (let i = 0; i < segmentPaths.length; i++) {
      listLines.push(`file '${segmentPaths[i]}'`);
      if (i < segmentPaths.length - 1) {
        listLines.push(`file '${silencePath}'`);
      }
    }

    const listPath = createTempPath(".txt");
    writeFileSync(listPath, listLines.join("\n"));

    // Output path for the final podcast file.
    const outputPath = join(
      OUTPUT_DIR,
      `podcast_${Date.now().toString(36)}.mp3`
    );

    // Run ffmpeg concat demuxer.
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .outputOptions([
          "-c:a", "libmp3lame",  // Fodec MP3
          "-b:a", "128k"          // Constant bitrate
        ])
        .save(outputPath)
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(new Error(`ffmpeg concat failed: ${err.message}`)));
    });

    // Probe the output file for its duration.
    const duration = await this.probeDuration(outputPath);

    // Clean up temporary files.
    try {
      unlinkSync(listPath);
      unlinkSync(silencePath);
    } catch {
      // Non-fatal: temp files in os.tmpdir() are cleaned up by the OS.
    }

    return { outputPath, duration };
  }

  /**
   * Generate a silent audio file using ffmpeg's anullsrc lavfi filter.
   * @param durationSeconds - Duration of the silence.
   * @param outputPath - Where to save the generated silence file.
   */
  private async generateSilence(
    durationSeconds: number,
    outputPath: string
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input("anullsrc=channel_layout=stereo:sample_rate=44100")
        .inputFormat("lavfi")
        .duration(durationSeconds)
        .save(outputPath)
        .on("end", () => resolve())
        .on("error", (err: Error) =>
          reject(new Error(`ffmpeg silence generation failed: ${err.message}`))
        );
    });
  }

  /**
   * Probe an audio file and return its duration in seconds.
   * @param filePath - Path to the audio file.
   * @returns Duration in seconds (0 if unavailable).
   */
  private async probeDuration(filePath: string): Promise<number> {
    return new Promise<number>((resolve) => {
      ffmpeg.ffprobe(filePath, (_err, metadata) => {
        const rawDuration = metadata?.format?.duration;
        if (rawDuration !== undefined && rawDuration !== null) {
          const parsed = parseFloat(String(rawDuration));
          resolve(Number.isNaN(parsed) ? 0 : parsed);
        } else {
          resolve(0);
        }
      });
    });
  }

  /**
   * Clear all files from the audio cache directory.
   * Useful for forcing fresh synthesis of all blocks.
   */
  clearCache(): void {
    if (!existsSync(CACHE_DIR)) {
      return;
    }

    const files = readDirectorySync(CACHE_DIR);
    for (const file of files) {
      if (file.endsWith(".mp3")) {
        try {
          unlinkSync(join(CACHE_DIR, file));
        } catch {
          // Non-fatal: continue cleaning other files.
        }
      }
    }
  }
}

/**
 * Read a directory and return its file names.
 * @param dir - Directory path to read.
 * @returns Array of file names in the directory.
 */
function readDirectorySync(dir: string): string[] {
  return readdirSync(dir);
}
