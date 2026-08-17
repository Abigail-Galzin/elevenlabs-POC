export interface VoiceCommand {
  transcript: string;
  topic: string;
  confidence: number;
  isVoice: boolean;
}

export interface TranscribeResponse {
  transcript: string;
  voiceCommand: VoiceCommand;
}

export interface GeneratePodcastResponse {
  outputPath: string;
  durationSeconds: number;
  segmentPaths: string[];
  creditsConsumed: number;
  creditsSaved: number;
  cacheHits: number;
  cacheMisses: number;
  source: "text" | "voice";
  topic: string;
  audioUrl: string;
  estimatedCredits: number;
  totalChars: number;
  newsArticles?: NewsItem[];
  script?: PodcastScript;
}

export interface CacheClearResponse {
  success: boolean;
  message: string;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  pipeline_type: "API" | "WebSocket";
  feature_type: "Text-to-Speech" | "Speech-to-Text";
  input_data: string;
  generated_response: string;
  audio_file_path: string;
}

export interface HistoryResponse {
  entries: HistoryEntry[];
}

export type PipelineStatus =
  | "idle"
  | "recording"
  | "transcribing"
  | "fetching_news"
  | "building_script"
  | "synthesizing"
  | "stitching"
  | "ready"
  | "error";

import type { ExtendedPipelineStatus, NewsItem, PodcastScript } from "./websocket";

export type { ExtendedPipelineStatus, NewsItem, PodcastScript } from "./websocket";

export type TopicOption = {
  value: string;
  label: string;
};
