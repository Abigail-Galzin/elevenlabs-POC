import record from "node-record-lpcm16-ts";
import fs from "fs";
import path from "path";
import readline from "readline";
import { ENV } from "../config/env.js";

export async function recordVoiceCommand(): Promise<string> {
  if (!fs.existsSync(ENV.TEMP_DIR)) {
    fs.mkdirSync(ENV.TEMP_DIR, { recursive: true });
  }

  const outputPath = path.join(ENV.TEMP_DIR, `voice_cmd_${Date.now()}.wav`);
  const fileStream = fs.createWriteStream(outputPath, { encoding: "binary" });

  console.log("\n🎙️  Recording audio... Speak your topic request now!");
  console.log("👉 Press ENTER when you finish speaking to stop recording.\n");

  const recording = record.record({
    sampleRate: 16000,
    channels: 1,
    audioType: "wav",
  });

  recording.stream().pipe(fileStream);

  // Esperar a que el usuario presione ENTER en la terminal
  await new Promise<void>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.on("line", () => {
      recording.stop();
      rl.close();
      resolve();
    });
  });

  console.log("🛑 Recording stopped. Processing audio...");
  return outputPath;
}
