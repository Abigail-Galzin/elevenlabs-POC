import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { createServer } from "node:http";

import { ENV } from "./config/env.js";
import { AudioManager } from "./audioManager.js";
import { NewsPodcaster } from "./core/newsPodcaster.js";
import { log } from "./utils/functions.js";
import { VoiceCommandParser } from "./utils/voiceCommandParser.js";
import { CREDITS_PER_CHAR } from "./types/index.js";
import { attachWebSocket } from "./websocket.js";

import type { PodcastOutput, VoiceCommand } from "./types/index.js";
import type { Request, Response, NextFunction } from "express";

const app = express();
const PORT = process.env.PORT || 4000;
const isDev = process.env.NODE_ENV !== "production";

/* ------------------------------------------------------------------ */
/* Middleware                                                         */
/* ------------------------------------------------------------------ */
app.use(cors({ origin: isDev ? "http://localhost:5173" : false }));
app.use(express.json());

/* ------------------------------------------------------------------ */
/* Multer: temp-file disk storage for audio uploads (max 10 MB)        */
/* ------------------------------------------------------------------ */
if (!existsSync(ENV.TEMP_DIR)) {
  mkdirSync(ENV.TEMP_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ENV.TEMP_DIR),
    filename: (_req, file, cb) =>
      cb(null, `upload_${Date.now()}_${file.originalname}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/* ------------------------------------------------------------------ */
/* Singleton service instances                                        */
/* ------------------------------------------------------------------ */
log("INFO", "Initializing AudioManager...");
const audioManager = new AudioManager(ENV.ELEVENLABS_API_KEY);
log("INFO", "Initializing NewsPodcaster (singleton)...");
const newsPodcaster = new NewsPodcaster(ENV.ELEVENLABS_API_KEY);

/* ------------------------------------------------------------------ */
/* POST /api/transcribe — STT via scribe_v1                             */
/* ------------------------------------------------------------------ */
app.post(
  "/api/transcribe",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided." });
    }

    const filePath = req.file.path;

    try {
      log("INFO", `Transcribing audio file: ${filePath}`);
      const transcript: string = await audioManager.transcribeAudio(filePath);
      log("INFO", `Transcription complete: "${transcript}"`);

      const voiceCommand: VoiceCommand = VoiceCommandParser.parse(transcript);
      log(
        "INFO",
        `Voice command parsed. Topic: ${voiceCommand.topic || "(general)"}`
      );

      return res.json({ transcript, voiceCommand });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("ERROR", `Transcription failed: ${message}`);
      return res.status(500).json({ error: "Transcription failed." });
    } finally {
      try {
        unlinkSync(filePath);
      } catch {
        // Non-fatal: temp file may already be gone.
      }
    }
  }
);

/* ------------------------------------------------------------------ */
/* POST /api/generate-podcast — full pipeline                          */
/* ------------------------------------------------------------------ */
app.post(
  "/api/generate-podcast",
  async (req: Request, res: Response) => {
    const { topic, source } = req.body as { topic?: string; source?: string };

    if (!source || (source !== "voice" && source !== "text")) {
      return res.status(400).json({
        error:
          "Missing or invalid required field: 'source' (expected 'voice' or 'text').",
      });
    }

    try {
      log(
        "INFO",
        `Generating podcast (source: ${source}, topic: ${topic || "(general)"})...`
      );

      const output: PodcastOutput = await newsPodcaster.generatePodcast({
        topic,
        source,
      });

      const filename = basename(output.outputPath);
      const audioUrl = `/api/output/${filename}`;

      const estimatedCredits = output.creditsConsumed + output.creditsSaved;
      const totalChars = Math.round(estimatedCredits / CREDITS_PER_CHAR);

      return res.json({
        ...output,
        audioUrl,
        estimatedCredits,
        totalChars,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("ERROR", `Podcast generation failed: ${message}`);
      return res.status(500).json({ error: "Podcast generation failed." });
    }
  }
);

/* ------------------------------------------------------------------ */
/* POST /api/cache/clear                                              */
/* ------------------------------------------------------------------ */
app.post("/api/cache/clear", (_req: Request, res: Response) => {
  audioManager.clearCache();
  return res.json({
    success: true,
    message: "Audio cache cleared successfully.",
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/output/:filename — serve generated MP3                    */
/* ------------------------------------------------------------------ */
app.get("/api/output/:filename", (req: Request, res: Response) => {
  const filename = basename(req.params.filename as string);
  const filePath = join(ENV.OUTPUT_DIR, filename);

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "File not found." });
  }

  return res.sendFile(filePath, { headers: { "Content-Type": "audio/mpeg" } });
});

/* ------------------------------------------------------------------ */
/* Global error handler                                               */
/* ------------------------------------------------------------------ */
app.use(
  (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    log("ERROR", `Unhandled error: ${message}`);
    return res.status(500).json({ error: "Internal server error." });
  }
);

/* ------------------------------------------------------------------ */
/* Server lifecycle                                                   */
/* ------------------------------------------------------------------ */
const httpServer = createServer(app);
attachWebSocket(httpServer, audioManager);
const server = httpServer.listen(PORT, () => {
  log("INFO", `Express server listening on port ${PORT}`);
});

function shutdown(signal: string): void {
  log("INFO", `Received ${signal}. Shutting down server...`);
  server.close(() => {
    log("INFO", "Server closed.");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
