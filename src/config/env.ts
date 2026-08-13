import dotenv from "dotenv";
import path from "path";

dotenv.config();

export const ENV = {
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || "",
  CACHE_DIR: path.join(process.cwd(), "audio_cache"),
  OUTPUT_DIR: path.join(process.cwd(), "output"),
  TEMP_DIR: path.join(process.cwd(), "temp"),
  TTS_MODEL_ID: process.env.TTS_MODEL || "eleven_flash_v2_5",
  STT_MODEL_ID: process.env.STT_MODEL ||  "scribe_v1",
  TTS_VOICE_ID: process.env.TTS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb",
  TTS_OUTPUT_FORMAT: process.env.TTS_OUTPUT_FORMAT || "mp3_44100_128",
  MAX_BLOCK_CHARS: process.env.MAX_BLOCK_CHARS || 249,
  SEGMENT_SILENCE_SECONDS: process.env.SEGMENT_SILENCE_SECONDS || 0.5
};

if (!ENV.ELEVENLABS_API_KEY) {
  console.error("❌ Error: ELEVENLABS_API_KEY is not defined in .env file.");
  process.exit(1);
}