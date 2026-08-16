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
import { existsSync, unlinkSync } from "node:fs";
import { AudioManager } from "./audioManager.js";
import { NewsPodcaster } from "./core/newsPodcaster.js";
import { log } from "./utils/functions.js";
import { recordVoiceCommand } from "./utils/recorder.js";

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
    --record, -r       Record your voice live from the microphone,
                       transcribe it, and generate a podcast
    --clear-cache      Clear all cached audio files from audio_cache/
    --help, -h         Show this help message

  Examples:
    npm run dev -- --topic technology
    npm run dev -- --voice audio/sample-command.wav
    npm run dev -- --record
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
  const recordRequested = args.includes("--record") || args.includes("-r");

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
    } else if (recordRequested) {
      const tempWavPath = await recordVoiceCommand();
      try {
        await podcaster.processVoiceRequest(tempWavPath);
      } finally {
        // Clean up the temporary WAV file after transcription.
        try {
          unlinkSync(tempWavPath);
          log("INFO", "Temporary recording file cleaned up.");
        } catch {
          // Non-fatal: temp file in temp dir may be cleaned up by OS.
        }
      }
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
