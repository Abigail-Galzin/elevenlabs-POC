import { writeFileSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { WebSocket } from "ws";

import { AudioManager } from "../audioManager.js";
import { ScriptBuilder } from "../core/scriptBuilder.js";
import { MockNewsProvider } from "../mocks/MockNewsProvider.js";
import { VoiceCommandParser } from "../utils/voiceCommandParser.js";
import { log } from "../utils/functions.js";
import {
  type NewsProvider,
  type NewsItem,
  type PodcastScript,
  type ScriptBlock,
  type SynthesisResult,
  type PodcastOutput,
  type VoiceCommand,
  MAX_NEWS_ITEMS,
  CREDITS_PER_CHAR,
} from "../types/index.js";

export interface AugmentedPodcastOutput extends PodcastOutput {
  audioUrl: string;
  estimatedCredits: number;
  totalChars: number;
}

export interface GenerateMessage {
  type: "generate";
  topic?: string;
  source?: "voice" | "text";
}

export interface TranscribeMessage {
  type: "transcribe";
  audio: string;
  mimeType: string;
}

type OutboundMessage =
  | { type: "status"; status: string }
  | { type: "log"; level: "INFO" | "WARNING" | "ERROR"; message: string }
  | { type: "news"; articles: NewsItem[] }
  | { type: "script"; script: PodcastScript }
  | { type: "synthesizing"; block_type: string; text: string; char_count: number }
  | { type: "cache_hit"; cache_key: string }
  | { type: "synthesis_complete"; result: SynthesisResult }
  | { type: "stitching" }
  | { type: "transcription"; transcript: string; voiceCommand: VoiceCommand }
  | { type: "ready"; podcast: AugmentedPodcastOutput }
  | { type: "error"; message: string };

export class PodcastWebSocketOrchestrator {
  private readonly audioManager: AudioManager;
  private readonly newsProvider: NewsProvider;
  private cancelled = false;

  constructor(audioManager: AudioManager, newsProvider?: NewsProvider) {
    this.audioManager = audioManager;
    this.newsProvider = newsProvider ?? new MockNewsProvider();
  }

  private send(ws: WebSocket, msg: OutboundMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private log(ws: WebSocket, level: "INFO" | "WARNING" | "ERROR", message: string): void {
    log(level, message);
    this.send(ws, { type: "log", level, message });
  }

  cancel(): void {
    this.cancelled = true;
  }

  private checkCancelled(ws: WebSocket): boolean {
    if (this.cancelled) {
      this.send(ws, { type: "error", message: "Generation cancelled." });
      return true;
    }
    return false;
  }

  async handleGenerate(ws: WebSocket, msg: GenerateMessage): Promise<void> {
    this.cancelled = false;
    const { topic = "", source = "text" } = msg;

    try {
      /* ------------------------------------------------------------------ */
      /* Step 1: Fetch News                                                 */
      /* ------------------------------------------------------------------ */
      this.send(ws, { type: "status", status: "fetching_news" });
      this.log(
        ws,
        "INFO",
        `Starting podcast generation${topic ? ` for topic: ${topic}` : ""}...`
      );
      this.log(ws, "INFO", "Step 1: Fetching news...");

      if (this.checkCancelled(ws)) return;

      const newsItems = await this.newsProvider.fetchNews(
        topic || undefined,
        MAX_NEWS_ITEMS
      );
      this.send(ws, { type: "news", articles: newsItems });
      this.log(ws, "INFO", `  Fetched ${newsItems.length} news items.`);

      /* ------------------------------------------------------------------ */
      /* Step 2: Build Script                                               */
      /* ------------------------------------------------------------------ */
      if (this.checkCancelled(ws)) return;

      this.send(ws, { type: "status", status: "building_script" });
      this.log(ws, "INFO", "Step 2: Building podcast script...");

      const script: PodcastScript = ScriptBuilder.buildScript(newsItems, topic);
      this.send(ws, { type: "script", script });
      this.log(
        ws,
        "INFO",
        `  Script built: ${script.newsItems.length} news items, ` +
          `${script.totalChars} total chars, ${script.estimatedCredits} estimated credits.`
      );

      /* ------------------------------------------------------------------ */
      /* Step 3: Synthesize Each Block                                      */
      /* ------------------------------------------------------------------ */
      if (this.checkCancelled(ws)) return;

      this.send(ws, { type: "status", status: "synthesizing" });
      this.log(ws, "INFO", "Step 3: Synthesizing audio blocks...");

      const allBlocks: ScriptBlock[] = [
        script.intro,
        ...script.newsItems,
        script.outro,
      ];
      const synthesisResults: SynthesisResult[] = [];

      for (const block of allBlocks) {
        if (this.checkCancelled(ws)) return;

        this.log(
          ws,
          "INFO",
          `  Synthesizing ${block.type} block (${block.text.length} chars)...`
        );
        this.send(ws, {
          type: "synthesizing",
          block_type: block.type,
          text: block.text,
          char_count: block.text.length,
        });

        const result = await this.audioManager.synthesizeSpeech(block.text);

        if (result.fromCache) {
          this.send(ws, { type: "cache_hit", cache_key: result.cacheKey });
          this.log(ws, "INFO", "    Cache hit — 0 credits consumed.");
        } else {
          this.log(
            ws,
            "INFO",
            `    Cache miss — ${result.credits} credits consumed.`
          );
        }

        this.send(ws, { type: "synthesis_complete", result });
        synthesisResults.push(result);
      }

      /* ------------------------------------------------------------------ */
      /* Step 4: Stitch Segments                                            */
      /* ------------------------------------------------------------------ */
      if (this.checkCancelled(ws)) return;

      this.send(ws, { type: "stitching" });
      this.send(ws, { type: "status", status: "stitching" });
      this.log(ws, "INFO", "Step 4: Stitching audio segments...");

      const segmentPaths: string[] = synthesisResults.map((r) => r.filePath);
      const stitchResult = await this.audioManager.stitchSegments(segmentPaths);

      /* ------------------------------------------------------------------ */
      /* Step 5: Assemble Output & Send Ready                               */
      /* ------------------------------------------------------------------ */
      if (this.checkCancelled(ws)) return;

      const creditsConsumed = synthesisResults
        .filter((r) => !r.fromCache)
        .reduce((sum: number, r: SynthesisResult) => sum + r.credits, 0);

      const creditsSaved = synthesisResults
        .filter((r) => r.fromCache)
        .reduce(
          (sum: number, r: SynthesisResult) =>
            sum + r.charCount * CREDITS_PER_CHAR,
          0
        );

      const cacheHits = synthesisResults.filter((r) => r.fromCache).length;
      const cacheMisses = synthesisResults.filter((r) => !r.fromCache).length;

      const output: PodcastOutput = {
        outputPath: stitchResult.outputPath,
        durationSeconds: stitchResult.duration,
        segmentPaths,
        creditsConsumed,
        creditsSaved,
        cacheHits,
        cacheMisses,
        source,
        topic,
        newsArticles: newsItems,
      };

      const filename = basename(output.outputPath);
      const audioUrl = `/api/output/${filename}`;

      const estimatedCredits = output.creditsConsumed + output.creditsSaved;
      const totalChars = Math.round(estimatedCredits / CREDITS_PER_CHAR);

      const augmentedOutput: AugmentedPodcastOutput = {
        ...output,
        audioUrl,
        estimatedCredits,
        totalChars,
      };

      this.send(ws, { type: "ready", podcast: augmentedOutput });
      this.log(ws, "INFO", "Podcast generation complete!");
      this.log(ws, "INFO", `  Output file: ${output.outputPath}`);
      this.log(
        ws,
        "INFO",
        `  Duration: ${output.durationSeconds.toFixed(1)} seconds`
      );
      this.log(ws, "INFO", `  Credits consumed: ${output.creditsConsumed}`);
      this.log(
        ws,
        "INFO",
        `  Credits saved (cache): ${output.creditsSaved}`
      );
      this.send(ws, { type: "status", status: "ready" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(ws, "ERROR", `Pipeline failed: ${message}`);
      this.send(ws, { type: "error", message: "Podcast generation failed." });
    }
  }

  async handleTranscribe(
    ws: WebSocket,
    msg: TranscribeMessage
  ): Promise<void> {
    this.log(ws, "INFO", "Transcribing audio via WebSocket...");

    try {
      const audioBuffer = Buffer.from(msg.audio, "base64");
      const extension = msg.mimeType.replace("audio/", ".");
      const tempPath = join(
        tmpdir(),
        `podcast_ws_transcribe_${Date.now()}_${Math.random().toString(36).slice(2)}${extension}`
      );

      writeFileSync(tempPath, audioBuffer);

      let transcript: string;
      try {
        transcript = await this.audioManager.transcribeAudio(tempPath);
      } finally {
        try {
          unlinkSync(tempPath);
        } catch {
          // Non-fatal: temp file may already be gone.
        }
      }

      this.log(ws, "INFO", `  Transcription: "${transcript}"`);

      const voiceCommand: VoiceCommand = VoiceCommandParser.parse(transcript);
      this.log(
        ws,
        "INFO",
        `  Voice command parsed. Topic: ${voiceCommand.topic || "(general)"}`
      );

      this.send(ws, { type: "transcription", transcript, voiceCommand });

      /* ------------------------------------------------------------------ */
      /* Auto-trigger generation with extracted topic                       */
      /* ------------------------------------------------------------------ */
      await this.handleGenerate(ws, {
        type: "generate",
        topic: voiceCommand.topic,
        source: "voice",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(ws, "ERROR", `Transcription failed: ${message}`);
      this.send(ws, { type: "error", message: "Transcription failed." });
    }
  }
}
