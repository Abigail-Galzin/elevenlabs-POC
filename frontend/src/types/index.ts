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
}

export interface CacheClearResponse {
  success: boolean;
  message: string;
}

export type PipelineStatus =
  | "idle"
  | "recording"
  | "transcribing"
  | "fetching_news"
  | "synthesizing"
  | "ready";

export type TopicOption = {
  value: string;
  label: string;
};
