/**
 * Core TypeScript data contracts and constants for the Automated Daily News Podcaster.
 * All interfaces are strictly typed — no `any` is used anywhere in this file.
 */

import { join } from "node:path";

// ---------------------------------------------------------------------------
// Configuration Constants
// ---------------------------------------------------------------------------

/** Maximum characters allowed per script block (strictly less than 250). */
export const MAX_BLOCK_CHARS = 249;

/** Credits consumed per character for the eleven_flash_v2_5 TTS model. */
export const CREDITS_PER_CHAR = 0.5;

/** Directory for cached synthesized audio files (keyed by MD5 hash). */
export const CACHE_DIR = join(process.cwd(), "audio_cache");

/** Directory for final output podcast files. */
export const OUTPUT_DIR = join(process.cwd(), "output");

/** ElevenLabs voice ID — "George", a clear newsreader voice. */
export const ELEVENLABS_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

/** TTS model identifier — ultra-lightweight at 0.5 credits/char. */
export const TTS_MODEL = "eleven_flash_v2_5";

/** STT model identifier — high-accuracy speech-to-text. */
export const STT_MODEL = "scribe_v1";

/** Output audio format for synthesized speech. */
export const TTS_OUTPUT_FORMAT = "mp3_44100_128";

/** Silence duration (in seconds) inserted between podcast segments. */
export const SEGMENT_SILENCE_SECONDS = 0.5;

/** Maximum number of news items included in a single podcast episode. */
export const MAX_NEWS_ITEMS = 3;

/** Predefined list of supported news topics. */
export const TOPICS = [
  "technology",
  "sports",
  "politics",
  "business",
  "science",
  "entertainment",
  "health",
] as const;

/** Union type derived from the TOPICS constant. */
export type Topic = (typeof TOPICS)[number];

// ---------------------------------------------------------------------------
// Data Contracts
// ---------------------------------------------------------------------------

/**
 * A single news article fetched from a news source.
 */
export interface NewsItem {
  /** Short headline (max 100 characters). */
  headline: string;
  /** Brief summary of the story (max 200 characters). */
  summary: string;
  /** Name of the news outlet publishing the article. */
  source: string;
  /** Direct URL to the full article. */
  url: string;
  /** Topic category (e.g., "technology", "sports"). */
  topic: Topic;
  /** ISO 8601 publication timestamp. */
  publishedAt: string;
}

/**
 * The semantic category of a script block in the podcast.
 */
export type ScriptBlockType = "intro" | "news" | "outro";

/**
 * A single unit of synthesized speech in the podcast script.
 * The text field is guaranteed to be strictly less than MAX_BLOCK_CHARS (250).
 */
export interface ScriptBlock {
  /** The text content to be synthesized. Enforced to be < 250 characters. */
  text: string;
  /** Semantic category of this block. */
  type: ScriptBlockType;
  /** Zero-based index for news blocks; undefined for intro/outro. */
  index?: number;
}

/**
 * The complete structured script before audio synthesis.
 */
export interface PodcastScript {
  /** ISO date string for this episode (e.g., "2026-08-12"). */
  date: string;
  /** Welcome block introducing the podcast and date. */
  intro: ScriptBlock;
  /** Array of 1–3 news item blocks. */
  newsItems: ScriptBlock[];
  /** Closing block with credits and call-to-action. */
  outro: ScriptBlock;
  /** Total character count across all blocks (post-truncation). */
  totalChars: number;
  /** Estimated cost in credits (totalChars × CREDITS_PER_CHAR). */
  estimatedCredits: number;
}

/**
 * Metadata about a completed podcast generation.
 */
export interface PodcastOutput {
  /** File system path to the output MP3 file. */
  outputPath: string;
  /** Total duration of the podcast in seconds. */
  durationSeconds: number;
  /** Ordered list of cached MP3 file paths used for each block. */
  segmentPaths: string[];
  /** Total credits actually consumed (cache hits = 0). */
  creditsConsumed: number;
  /** Credits saved by serving blocks from cache. */
  creditsSaved: number;
  /** Number of blocks served from cache. */
  cacheHits: number;
  /** Number of blocks that required fresh synthesis. */
  cacheMisses: number;
  /** Whether the output was generated from a voice command. */
  source: "voice" | "text";
  /** The topic this podcast covers (empty string for general news). */
  topic: string;
}

/**
 * The parsed result of a voice (or text) command.
 */
export interface VoiceCommand {
  /** Raw transcribed text from scribe_v1. */
  transcript: string;
  /** Extracted topic keyword (e.g., "technology"). Empty for general news. */
  topic: string;
  /** Confidence score from the STT model (0.0–1.0). */
  confidence: number;
  /** Whether the command originated from voice input. */
  isVoice: boolean;
}

/**
 * Abstract news provider interface — allows swapping the data source.
 */
export interface NewsProvider {
  /**
   * Fetch news articles, optionally filtered by topic.
   * @param topic - Optional topic filter.
   * @param limit - Maximum number of items to return (default: MAX_NEWS_ITEMS).
   * @returns Array of NewsItem sorted by relevance/recency.
   */
  fetchNews(topic?: string, limit?: number): Promise<NewsItem[]>;
}

/**
 * Record of a single synthesized block — used for credit tracking and stitching.
 */
export interface SynthesisResult {
  /** File path to the synthesized or cached MP3. */
  filePath: string;
  /** Number of characters synthesized. */
  charCount: number;
  /** Credits consumed for this block (0 if cached). */
  credits: number;
  /** Whether the result came from cache. */
  fromCache: boolean;
  /** The MD5 hash key used for caching. */
  cacheKey: string;
}

/**
 * Result of stitching audio segments into a single podcast file.
 */
export interface StitchResult {
  /** File system path to the stitched podcast MP3. */
  outputPath: string;
  /** Total duration of the stitched file in seconds. */
  duration: number;
}
