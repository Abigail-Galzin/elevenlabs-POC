/**
 * Automated Daily News Podcaster — Main Entry Point
 *
 * Pipeline:
 *   1. Fetch news (MockNewsProvider, topic-filtered)
 *   2. Build radio-style script (Intro → News Items → Outro)
 *   3. Synthesize each block via eleven_flash_v2_5 (with MD5 cache)
 *   4. Stitch segments with ffmpeg (inter-segment silence)
 *   5. Save MP3 to output/
 *
 * CLI:
 *   npm run dev -- [--topic <topic>] [--voice <path>] [--clear-cache] [--help]
 */

import "dotenv/config";

import { existsSync } from "node:fs";

import { AudioManager } from "./audioManager.js";
import {
  type NewsItem,
  type NewsProvider,
  type PodcastOutput,
  type PodcastScript,
  type ScriptBlock,
  type ScriptBlockType,
  type SynthesisResult,
  type VoiceCommand,
  CREDITS_PER_CHAR,
  MAX_BLOCK_CHARS,
  MAX_NEWS_ITEMS,
} from "./types.js";

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

type LogLevel = "INFO" | "WARNING" | "ERROR";

/**
 * Log a message with a timestamp and level prefix.
 * @param level - Severity level.
 * @param message - The message to log.
 */
function log(level: LogLevel, message: string): void {
  const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
  console.log(`[${timestamp}] [${level}] ${message}`);
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Format a Date as "Month D, YYYY" (e.g., "August 12, 2026").
 */
function formatDate(date: Date): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Create a shuffled copy of an array using the Fisher-Yates algorithm.
 * @param array - The array to shuffle.
 * @returns A new array with elements in random order.
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Mock News Provider
// ---------------------------------------------------------------------------

/**
 * Mock implementation of NewsProvider that generates realistic fake news items.
 *
 * In production, this would be replaced with an RSS feed parser or a news API
 * client (e.g., NewsAPI, GDELT). The MockNewsProvider allows the PoC to run
 * without external dependencies.
 */
class MockNewsProvider implements NewsProvider {
  private readonly today: string = new Date().toISOString();

  private readonly allNews: NewsItem[] = [
    // ----- Technology -----
    {
      headline: "Google unveils new AI chip for data centers",
      summary: "Tensor G3 processor delivers 40% faster inference for enterprise AI workloads.",
      source: "TechCrunch",
      url: "https://techcrunch.com/2026/google-ai-chip",
      topic: "technology",
      publishedAt: this.today,
    },
    {
      headline: "Open-source AI model reaches human-level coding",
      summary: "Researchers release open model that writes production code at human proficiency.",
      source: "Ars Technica",
      url: "https://arstechnica.com/ai/open-source-model",
      topic: "technology",
      publishedAt: this.today,
    },
    {
      headline: "WebAssembly runtime now supports GPU compute",
      summary: "WASI GPU API unlocks near-native GPU acceleration in web browsers.",
      source: "The New Stack",
      url: "https://thenewstack.io/webassembly-gpu",
      topic: "technology",
      publishedAt: this.today,
    },
    {
      headline: "Apple releases critical security update for iOS",
      summary: "iOS 18.1 patches three zero-day vulnerabilities affecting all devices.",
      source: "TechCrunch",
      url: "https://techcrunch.com/ios-security-update",
      topic: "technology",
      publishedAt: this.today,
    },
    {
      headline: "Quantum computer achieves new error correction milestone",
      summary: "Scientists demonstrate fault-tolerant qubit operations at record scale.",
      source: "MIT Technology Review",
      url: "https://techreview.com/quantum-error-correction",
      topic: "technology",
      publishedAt: this.today,
    },

    // ----- Sports -----
    {
      headline: "Local marathon runner breaks 3-hour barrier",
      summary: "Sarah Chen completed the city marathon in 2 hours 58 minutes 45 seconds.",
      source: "Sports Daily",
      url: "https://sportsdaily.com/marathon-record",
      topic: "sports",
      publishedAt: this.today,
    },
    {
      headline: "Championship series goes to game 7 thriller",
      summary: "Lakers edge Celtics 112-108 in overtime to claim the title.",
      source: "ESPN",
      url: "https://espn.com/lakers-celtics-game7",
      topic: "sports",
      publishedAt: this.today,
    },
    {
      headline: "Tennis legend announces retirement after 22 majors",
      summary: "The champion will retire after winning three titles this season.",
      source: "Sports Daily",
      url: "https://sportsdaily.com/tennis-retirement",
      topic: "sports",
      publishedAt: this.today,
    },
    {
      headline: "Soccer team wins international tournament",
      summary: "Host nation defeats Brazil 2-1 in the championship final.",
      source: "Reuters Sports",
      url: "https://reuters.com/soccer-tournament-winner",
      topic: "sports",
      publishedAt: this.today,
    },

    // ----- Politics -----
    {
      headline: "New climate bill passes Senate with bipartisan support",
      summary: "The Climate Action Act allocates $50 billion for renewable infrastructure.",
      source: "Reuters",
      url: "https://reuters.com/climate-bill-passes",
      topic: "politics",
      publishedAt: this.today,
    },
    {
      headline: "Mayor unveils $200M infrastructure investment plan",
      summary: "Five-year program targets roads, bridges, and public transit upgrades.",
      source: "The Washington Post",
      url: "https://washingtonpost.com/infrastructure-plan",
      topic: "politics",
      publishedAt: this.today,
    },
    {
      headline: "Supreme Court to hear major tech regulation case",
      summary: "Justices will review Section 230 protections for social media platforms.",
      source: "Reuters",
      url: "https://reuters.com/supreme-court-tech-case",
      topic: "politics",
      publishedAt: this.today,
    },
    {
      headline: "Senate approves new cybersecurity funding bill",
      summary: "Bill allocates $30 billion for critical infrastructure defense and research.",
      source: "Reuters",
      url: "https://reuters.com/cybersecurity-bill",
      topic: "politics",
      publishedAt: this.today,
    },

    // ----- Business -----
    {
      headline: "Stock market hits record high on Fed rate signal",
      summary: "S&P 500 closes at 5,300 as investors welcome pause on rate hikes.",
      source: "Bloomberg",
      url: "https://bloomberg.com/stock-market-record",
      topic: "business",
      publishedAt: this.today,
    },
    {
      headline: "AI startup raises $150M in Series C funding",
      summary: "Anthropic secures new investment to accelerate Claude development.",
      source: "TechCrunch",
      url: "https://techcrunch.com/anthropic-funding",
      topic: "business",
      publishedAt: this.today,
    },
    {
      headline: "Federal Reserve holds interest rates steady",
      summary: "Central bank maintains rates at 5.25 to 5.50 percent for the quarter.",
      source: "Bloomberg",
      url: "https://bloomberg.com/fed-rates-steady",
      topic: "business",
      publishedAt: this.today,
    },
    {
      headline: "Tech giant reports 40% revenue growth in cloud segment",
      summary: "Cloud computing division exceeds analyst expectations for Q3.",
      source: "Bloomberg",
      url: "https://bloomberg.com/cloud-revenue-growth",
      topic: "business",
      publishedAt: this.today,
    },

    // ----- Science -----
    {
      headline: "JWST discovers water vapor on potentially habitable exoplanet",
      summary: "James Webb Space Telescope data reveals promising signs of habitability.",
      source: "Nature",
      url: "https://nature.com/jwst-habitable-exoplanet",
      topic: "science",
      publishedAt: this.today,
    },
    {
      headline: "CRISPR gene therapy shows 80% success in clinical trial",
      summary: "Treatment for inherited blindness achieves dramatic vision improvement.",
      source: "Science Magazine",
      url: "https://science.org/crispr-gene-therapy",
      topic: "science",
      publishedAt: this.today,
    },
    {
      headline: "Deep-sea explorers discover new species in Mariana Trench",
      summary: "Scientists identify five previously unknown amphipod species.",
      source: "National Geographic",
      url: "https://natgeo.com/mariana-trench-species",
      topic: "science",
      publishedAt: this.today,
    },
    {
      headline: "Fusion reactor achieves net energy gain for 24 hours",
      summary: "Experimental tokamak sustains fusion reaction at record duration.",
      source: "Nature",
      url: "https://nature.com/fusion-energy-record",
      topic: "science",
      publishedAt: this.today,
    },

    // ----- Entertainment -----
    {
      headline: "Blockbuster sequel shatters opening weekend box office",
      summary: "Film grosses $150 million domestically, becoming the year's top opener.",
      source: "Variety",
      url: "https://variety.com/blockbuster-box-office",
      topic: "entertainment",
      publishedAt: this.today,
    },
    {
      headline: "Streaming giant reaches 200M subscriber milestone",
      summary: "Netflix adds 12 million new subscribers in Q3, exceeding projections.",
      source: "The Hollywood Reporter",
      url: "https://hollywoodreporter.com/netflix-subscribers",
      topic: "entertainment",
      publishedAt: this.today,
    },
    {
      headline: "Award-winning director teases mystery sci-fi project",
      summary: "Christopher Nolan's next film set for 2025 release, details scarce.",
      source: "Variety",
      url: "https://variety.com/nolan-sci-fi-project",
      topic: "entertainment",
      publishedAt: this.today,
    },
    {
      headline: "Music festival draws 100K attendees over weekend",
      summary: "Three-day event features 50 artists across five stages.",
      source: "Rolling Stone",
      url: "https://rollingstone.com/music-festival-2026",
      topic: "entertainment",
      publishedAt: this.today,
    },

    // ----- Health -----
    {
      headline: "WHO declares end of global health emergency",
      summary: "COVID-19 pandemic phase officially ends after three years.",
      source: "BBC Health",
      url: "https://bbc.com/health-emergency-end",
      topic: "health",
      publishedAt: this.today,
    },
    {
      headline: "New Alzheimer's drug approved by FDA regulators",
      summary: "Treatment slows cognitive decline by 27 percent in late-stage trials.",
      source: "Reuters Health",
      url: "https://reuters.com/alzheimers-drug-fda",
      topic: "health",
      publishedAt: this.today,
    },
    {
      headline: "Study links Mediterranean diet to 30% longer lifespan",
      summary: "Large-scale study confirms heart-healthy eating extends life expectancy.",
      source: "The Lancet",
      url: "https://thelancet.com/mediterranean-diet-study",
      topic: "health",
      publishedAt: this.today,
    },
    {
      headline: "Breakthrough study finds common supplement boosts immunity",
      summary: "Vitamin D deficiency linked to increased infection rates in clinical trial.",
      source: "BBC Health",
      url: "https://bbc.com/vitamin-d-immunity-study",
      topic: "health",
      publishedAt: this.today,
    },
  ];

  /**
   * Fetch news items, optionally filtered by topic.
   * @param topic - Optional topic filter (e.g., "technology").
   * @param limit - Maximum number of items to return (default: 3).
   * @returns Shuffled list of news items, up to `limit` in length.
   */
  async fetchNews(topic?: string, limit: number = MAX_NEWS_ITEMS): Promise<NewsItem[]> {
    let items: NewsItem[];

    if (topic && topic.length > 0) {
      const filtered = this.allNews.filter((item) => item.topic === topic);
      items = filtered.length > 0 ? filtered : this.allNews;
    } else {
      items = this.allNews;
    }

    return shuffleArray(items).slice(0, limit);
  }
}

// ---------------------------------------------------------------------------
// Script Builder
// ---------------------------------------------------------------------------

/**
 * Builds a radio-style podcast script from news items.
 *
 * The script follows the structure:
 *   Intro → News Items (1–3) → Outro
 *
 * Each block is validated to be strictly under MAX_BLOCK_CHARS (249 characters).
 */
class ScriptBuilder {
  /**
   * Ensure a text block is within the character limit.
   * If the text exceeds MAX_BLOCK_CHARS, it is truncated to MAX_BLOCK_CHARS - 3
   * characters with an ellipsis ("...") appended.
   *
   * @param text - The text to validate/truncate.
   * @param type - The semantic type of the block.
   * @param index - Zero-based index (for news blocks).
   * @returns A validated ScriptBlock.
   */
  static truncateBlock(text: string, type: ScriptBlockType, index?: number): ScriptBlock {
    let result = text;
    if (text.length > MAX_BLOCK_CHARS) {
      result = text.substring(0, MAX_BLOCK_CHARS - 3) + "...";
      log(
        "WARNING",
        `Truncated ${type} block from ${text.length} to ${result.length} characters.`
      );
    }
    return { text: result, type, index };
  }

  /**
   * Build a complete podcast script from news items.
   *
   * @param newsItems - Array of news items (1–3 items expected).
   * @param topic - Optional topic string for the intro message.
   * @returns A PodcastScript with intro, news blocks, and outro.
   */
  static buildScript(newsItems: NewsItem[], topic: string = ""): PodcastScript {
    const now = new Date();
    const dateStr = formatDate(now);
    const today = now.toISOString().split("T")[0];

    // --- Intro Block ---
    const introText = topic
      ? `Welcome to the Daily News Podcast for ${dateStr}. Here are today's top ${topic} stories.`
      : `Welcome to the Daily News Podcast for ${dateStr}. Here are today's top stories.`;
    const intro = ScriptBuilder.truncateBlock(introText, "intro");

    // --- News Item Blocks ---
    const newsBlocks: ScriptBlock[] = newsItems.map((item, i) => {
      const text = `Story ${i + 1}: ${item.headline}. ${item.summary}`;
      return ScriptBuilder.truncateBlock(text, "news", i);
    });

    // --- Outro Block ---
    const outroText =
      "That's all for today's news. This podcast was generated with " +
      "ElevenLabs eleven_flash_v2_5. Stay informed.";
    const outro = ScriptBuilder.truncateBlock(outroText, "outro");

    // --- Calculate Totals ---
    const allBlocks: ScriptBlock[] = [intro, ...newsBlocks, outro];
    const totalChars = allBlocks.reduce(
      (sum: number, block: ScriptBlock) => sum + block.text.length,
      0
    );
    const estimatedCredits = totalChars * CREDITS_PER_CHAR;

    return {
      date: today,
      intro,
      newsItems: newsBlocks,
      outro,
      totalChars,
      estimatedCredits,
    };
  }
}

// ---------------------------------------------------------------------------
// Voice Command Parser
// ---------------------------------------------------------------------------

/**
 * Parses transcribed text from scribe_v1 to extract a topic keyword.
 *
 * Uses prefix matching to support partial words (e.g., "tech" matches "technology").
 */
class VoiceCommandParser {
  private static readonly TOPIC_KEYWORDS: ReadonlyArray<{
    keyword: string;
    topic: string;
  }> = [
    { keyword: "tech", topic: "technology" },
    { keyword: "technology", topic: "technology" },
    { keyword: "sport", topic: "sports" },
    { keyword: "politic", topic: "politics" },
    { keyword: "busines", topic: "business" },
    { keyword: "scienc", topic: "science" },
    { keyword: "entertain", topic: "entertainment" },
    { keyword: "health", topic: "health" },
    { keyword: "healthcare", topic: "health" },
  ];

  /**
   * Parse a transcript string into a VoiceCommand.
   * @param transcript - The raw transcribed text.
   * @returns A VoiceCommand with the extracted topic (empty string if none found).
   */
  static parse(transcript: string): VoiceCommand {
    const lowerTranscript = transcript.toLowerCase().trim();
    let topic = "";

    for (const { keyword, topic: mappedTopic } of VoiceCommandParser.TOPIC_KEYWORDS) {
      if (lowerTranscript.includes(keyword)) {
        topic = mappedTopic;
        break;
      }
    }

    return {
      transcript,
      topic,
      confidence: 0.8,
      isVoice: true,
    };
  }
}

// ---------------------------------------------------------------------------
// News Podcaster (Main Orchestrator)
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full podcast generation pipeline:
 * news fetch → script build → TTS synthesis → audio stitching → output.
 */
class NewsPodcaster {
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

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

/**
 * Print CLI usage information.
 */
function printHelp(): void {
  console.log(`
Usage: npm run dev -- [options]

Options:
  --topic <topic>    Filter news by topic
                     (technology, sports, politics, business,
                      science, entertainment, health)
  --voice <path>     Transcribe a voice command from an audio file
                     and generate a podcast for the extracted topic
  --clear-cache      Clear all cached audio files from audio_cache/
  --help, -h         Show this help message

Examples:
  npm run dev -- --topic technology
  npm run dev -- --voice audio/sample-command.wav
  npm run dev -- --clear-cache
`);
}

/**
 * Parse CLI arguments and dispatch to the appropriate pipeline.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const helpRequested = args.includes("--help") || args.includes("-h");
  const clearCache = args.includes("--clear-cache");

  const topicIndex = args.indexOf("--topic");
  const topic =
    topicIndex !== -1 && topicIndex + 1 < args.length
      ? args[topicIndex + 1]
      : undefined;

  const voiceIndex = args.indexOf("--voice");
  const voicePath =
    voiceIndex !== -1 && voiceIndex + 1 < args.length
      ? args[voiceIndex + 1]
      : undefined;

  if (helpRequested) {
    printHelp();
    process.exit(0);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    log("ERROR", "ELEVENLABS_API_KEY is not set. Add it to your .env file.");
    process.exit(1);
  }

  if (clearCache) {
    const manager = new AudioManager(apiKey);
    manager.clearCache();
    log("INFO", "Audio cache cleared successfully.");
    process.exit(0);
  }

  try {
    const podcaster = new NewsPodcaster(apiKey);

    if (voicePath) {
      if (!existsSync(voicePath)) {
        log("ERROR", `Voice command audio file not found: ${voicePath}`);
        process.exit(1);
      }
      await podcaster.processVoiceRequest(voicePath);
    } else {
      await podcaster.generatePodcast({
        topic: topic,
        source: "text",
      });
    }
  } catch (error) {
    log("ERROR", `Pipeline failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Execute main() only when this file is run directly (not imported).
const isMainModule = process.argv[1]?.endsWith("index.ts");
if (isMainModule) {
  main().catch((err: unknown) => {
    log("ERROR", `Fatal error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
