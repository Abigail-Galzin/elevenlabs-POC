import record from "node-record-lpcm16-ts";
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import readline from "node:readline";
import { log } from "./functions.js";
import { ENV } from "../config/env.js";

/**
 * Pick the right sox-compatible recorder for the current platform.
 *
 * - macOS (darwin) → "rec" (SoX's recording frontend; works with CoreAudio)
 * - Linux          → "arecord" (ALSA native, no sox dependency)
 * - Other          → "sox" (fallback)
 */
function getPlatformRecorder(): string {
  if (process.platform === "darwin") return "rec";
  if (process.platform === "linux") return "arecord";
  return "sox";
}

/**
 * Extract a human-readable error message from a stream error event.
 *
 * node-record-lpcm16-ts may emit either an Error object or a raw string
 * when the child process exits with a non-zero code, so we normalise.
 */
function normalizeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Record interactive voice input from the terminal microphone using
 * the platform-appropriate recorder (rec on macOS, arecord on Linux).
 *
 * Flow:
 *   1. Ensure the temp directory exists.
 *   2. Verify an audio input device is available (platform-specific).
 *   3. Start recording via the platform-appropriate recorder.
 *   4. Prompt the user — recording stops when they press ENTER.
 *   5. Wait for the file stream to flush completely (no truncation).
 *   6. Clean up the temp file on any error.
 *
 * @returns Absolute path to the saved WAV file.
 * @throws Error if no input device is found, the recorder fails,
 *         the stream errors, or the user aborts (Ctrl+C).
 */
export async function recordVoiceCommand(): Promise<string> {
  if (!existsSync(ENV.TEMP_DIR)) {
    mkdirSync(ENV.TEMP_DIR, { recursive: true });
  }

  const outputPath = join(ENV.TEMP_DIR, `voice_cmd_${Date.now()}.wav`);
  let fileStream: ReturnType<typeof createWriteStream> | undefined;
  let recording: ReturnType<typeof record.record> | undefined;
  let rl: readline.Interface | undefined;

  try {
    fileStream = createWriteStream(outputPath, { encoding: "binary" });
    recording = record.record({
      sampleRate: 16000,
      channels: 1,
      audioType: "wav",
      recorder: getPlatformRecorder(),
    });

    console.log("\n🎙️  Recording started... Speak your request now!");
    console.log("👉 Press ENTER when you finish speaking to stop recording.\n");

    const stream = recording.stream();
    const streamErrorPromise = new Promise<never>((_, reject) => {
      stream.on("error", (err) => {
        reject(
          new Error(
            `Recording failed: ${normalizeError(err)}.\n` +
              `  • Ensure 'sox' is installed: brew install sox`,
          ),
        );
      });
    });
    const pipelinePromise = pipeline(stream, fileStream);

    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const inputPromise = new Promise<void>((resolve) => {
      rl!.once("line", () => resolve());
    });

    // Race: if the recorder fails to start, surface the error immediately
    // instead of blocking on stdin.
    await Promise.race([inputPromise, streamErrorPromise]);

    // Stop the recorder — this closes the recording stream, letting the
    // pipeline finish flushing data to disk.
    recording.stop();
    rl.close();

    log("INFO", "Recording stopped. Flushing audio buffer...");

    // Wait for all buffered WAV data to be written to disk.
    await pipelinePromise;

    console.log("✅ Recording saved.");
    return outputPath;
  } catch (error) {
    // Clean up partial file on any failure.
    if (existsSync(outputPath)) {
      try {
        unlinkSync(outputPath);
      } catch {
        // Non-fatal: temp file may already be gone.
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Live recording failed: ${message}`);
  } finally {
    rl?.close();
    fileStream?.end();
  }
}
