import {
  type PodcastOutput,
  type NewsProvider,
  type SynthesisResult,
  type PodcastScript,
  type VoiceCommand,
  ScriptBlock,
  MAX_NEWS_ITEMS,
  CREDITS_PER_CHAR,
} from "../types/index.js";
import { AudioManager } from "../audioManager.js";
import { MockNewsProvider } from "../mocks/MockNewsProvider.js";
import { log } from "../utils/functions.js";
import { ScriptBuilder } from "./scriptBuilder.js";
import { VoiceCommandParser } from "../utils/voiceCommandParser.js";

/**
 * Orchestrates the full podcast generation pipeline:
 * news fetch → script build → TTS synthesis → audio stitching → output.
 */
export class NewsPodcaster {
  private readonly audioManager: AudioManager;
  private readonly newsProvider: NewsProvider;

  constructor(apiKey: string, newsProvider?: NewsProvider) {
    this.audioManager = new AudioManager(apiKey);
    this.newsProvider = newsProvider ?? new MockNewsProvider();
  }

  /**
   * Generate a complete podcast episode.
   *
   * @param options - Configuration: optional topic filter and source type.
   * @returns PodcastOutput with metadata about the generated file.
   */
  async generatePodcast(options: {
    topic?: string;
    source: "voice" | "text";
  }): Promise<PodcastOutput> {
    const { topic = "", source } = options;
    log(
      "INFO",
      `Starting podcast generation${topic ? ` for topic: ${topic}` : ""}...`
    );

    // --- Step 1: Fetch News ---
    log("INFO", "Step 1: Fetching news...");
    const newsItems = await this.newsProvider.fetchNews(
      topic || undefined,
      MAX_NEWS_ITEMS
    );
    log("INFO", `  Fetched ${newsItems.length} news items.`);

    // --- Step 2: Build Script ---
    log("INFO", "Step 2: Building podcast script...");
    const script: PodcastScript = ScriptBuilder.buildScript(newsItems, topic);
    const content = script.newsItems.reduce((content, block) => {
      return content + "\n" + block.text;
    }, "").trim();

    log(
      "INFO",
      `${script.date}
        ${script.intro.text}
        ${content}
        ${script.outro.text}`
    );
    log(
      "INFO",
      `  Script built: ${script.newsItems.length} news items, ` +
      `${script.totalChars} total chars, ${script.estimatedCredits} estimated credits.`
    );

    // --- Step 3: Synthesize Each Block ---
    log("INFO", "Step 3: Synthesizing audio blocks...");
    const allBlocks: ScriptBlock[] = [
      script.intro,
      ...script.newsItems,
      script.outro,
    ];

    const synthesisResults: SynthesisResult[] = [];

    for (const block of allBlocks) {
      log(
        "INFO",
        `  Synthesizing ${block.type} block (${block.text.length} chars)...`
      );
      const result = await this.audioManager.synthesizeSpeech(block.text);

      if (result.fromCache) {
        log("INFO", `    Cache hit — 0 credits consumed.`);
      } else {
        log("INFO", `    Cache miss — ${result.credits} credits consumed.`);
      }

      synthesisResults.push(result);
    }

    // --- Step 4: Stitch Segments ---
    log("INFO", "Step 4: Stitching audio segments...");
    const segmentPaths: string[] = synthesisResults.map((r) => r.filePath);
    const stitchResult = await this.audioManager.stitchSegments(segmentPaths);

    // --- Step 5: Calculate Credit Statistics ---
    const creditsConsumed = synthesisResults
      .filter((r) => !r.fromCache)
      .reduce((sum: number, r: SynthesisResult) => sum + r.credits, 0);

    const creditsSaved = synthesisResults
      .filter((r) => r.fromCache)
      .reduce(
        (sum: number, r: SynthesisResult) => sum + r.charCount * CREDITS_PER_CHAR,
        0
      );

    const cacheHits = synthesisResults.filter((r) => r.fromCache).length;
    const cacheMisses = synthesisResults.filter((r) => !r.fromCache).length;

    // --- Assemble Output ---
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

    log("INFO", "Podcast generation complete!");
    log("INFO", `  Output file: ${output.outputPath}`);
    log("INFO", `  Duration: ${output.durationSeconds.toFixed(1)} seconds`);
    log("INFO", `  Credits consumed: ${output.creditsConsumed}`);
    log("INFO", `  Credits saved (cache): ${output.creditsSaved}`);
    log(
      "INFO",
      `  Cache: ${output.cacheHits} hits, ${output.cacheMisses} misses`
    );

    return output;
  }

  /**
   * Process a voice command from an audio file.
   *
   * Transcribes the audio via scribe_v1, parses the topic, and generates
   * a podcast filtered by the extracted topic.
   *
   * @param audioPath - Path to the audio file for voice command.
   * @returns PodcastOutput with metadata about the generated file.
   */
  async processVoiceRequest(audioPath: string): Promise<PodcastOutput> {
    log("INFO", `Processing voice command from: ${audioPath}`);

    log("INFO", "Step 1: Transcribing audio with scribe_v1...");
    const transcript = await this.audioManager.transcribeAudio(audioPath);
    log("INFO", `  Transcription: "${transcript}"`);

    log("INFO", "Step 2: Parsing voice command...");
    const voiceCommand: VoiceCommand = VoiceCommandParser.parse(transcript);
    log(
      "INFO",
      `  Topic: ${voiceCommand.topic || "(general)"}`
    );
    log("INFO", `  Confidence: ${voiceCommand.confidence}`);

    return this.generatePodcast({
      topic: voiceCommand.topic,
      source: "voice",
    });
  }
}