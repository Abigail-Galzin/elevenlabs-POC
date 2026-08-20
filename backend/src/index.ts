/**
 * Barrel export for the CJS build.
 * Re-exports AudioManager and core types so consumers can do:
 *   const { AudioManager } = require("elevenlabs/dist-cjs/index.js");
 */
export { AudioManager } from "./audioManager.js";
export type { SynthesisResult, StitchResult } from "./types/index.js";
export {
  ELEVENLABS_VOICE_ID,
  TTS_MODEL,
  STT_MODEL,
  TTS_OUTPUT_FORMAT,
  MAX_BLOCK_CHARS,
  CACHE_DIR,
  OUTPUT_DIR,
} from "./types/index.js";
