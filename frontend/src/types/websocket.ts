import type { GeneratePodcastResponse, VoiceCommand } from "./index";

export type { WebSocketClient } from "../services/websocketClient";

/** Status values sent in server `status` messages. */
export type ServerStatus =
  | "fetching_news"
  | "building_script"
  | "synthesizing"
  | "stitching"
  | "ready"
  | "error";

export type ServerMessageType =
  | "status"
  | "log"
  | "news"
  | "script"
  | "synthesizing"
  | "cache_hit"
  | "synthesis_complete"
  | "stitching"
  | "transcription"
  | "ready"
  | "error";

export type ClientMessage =
  | { type: "generate"; topic?: string; source: "text" | "voice" }
  | { type: "transcribe"; audio: string; mimeType: string }
  | { type: "cancel" };

export interface StatusMessage {
  type: "status";
  status: ServerStatus;
}

export interface LogMessage {
  type: "log";
  level: "INFO" | "WARNING" | "ERROR";
  message: string;
}

export interface NewsItem {
  headline: string;
  summary: string;
  source: string;
  url: string;
  topic: string;
  publishedAt: string;
}

export interface NewsMessage {
  type: "news";
  articles: NewsItem[];
}

export type ScriptBlockType = "intro" | "news" | "outro";

export interface ScriptBlock {
  text: string;
  type: ScriptBlockType;
  index?: number;
}

export interface PodcastScript {
  date: string;
  intro: ScriptBlock;
  newsItems: ScriptBlock[];
  outro: ScriptBlock;
  totalChars: number;
  estimatedCredits: number;
}

export interface ScriptMessage {
  type: "script";
  script: PodcastScript;
}

export interface SynthesizingMessage {
  type: "synthesizing";
  block_type: string;
  text: string;
  char_count: number;
}

export interface CacheHitMessage {
  type: "cache_hit";
  cache_key: string;
}

export interface SynthesisResult {
  filePath: string;
  charCount: number;
  credits: number;
  fromCache: boolean;
  cacheKey: string;
}

export interface SynthesisCompleteMessage {
  type: "synthesis_complete";
  result: SynthesisResult;
}

export interface StitchingMessage {
  type: "stitching";
}

export interface TranscriptionMessage {
  type: "transcription";
  transcript: string;
  voiceCommand: VoiceCommand;
}

export type AugmentedPodcastOutput = GeneratePodcastResponse;

export interface ReadyMessage {
  type: "ready";
  podcast: AugmentedPodcastOutput;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type ServerMessage =
  | StatusMessage
  | LogMessage
  | NewsMessage
  | ScriptMessage
  | SynthesizingMessage
  | CacheHitMessage
  | SynthesisCompleteMessage
  | StitchingMessage
  | TranscriptionMessage
  | ReadyMessage
  | ErrorMessage;

/** Extended pipeline statuses including WebSocket-specific phases. */
export type ExtendedPipelineStatus =
  | "idle"
  | "recording"
  | "transcribing"
  | "fetching_news"
  | "building_script"
  | "synthesizing"
  | "stitching"
  | "ready"
  | "error";
