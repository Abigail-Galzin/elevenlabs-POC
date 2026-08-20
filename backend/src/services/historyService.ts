import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { basename, join } from "node:path";

import { type PodcastOutput, type PodcastScript, type NewsItem } from "../types/index.js";
import { log } from "../utils/functions.js";

const DATA_DIR = join(
  typeof __dirname !== "undefined"
    ? __dirname
    : // @ts-ignore — import.meta.dirname is ESM-only; dead branch under CJS builds
      import.meta.dirname,
  "..",
  "..",
  "data"
);
const DB_PATH = join(DATA_DIR, "history.db");

/**
 * Represents a single history entry stored in the SQLite database.
 */
export interface HistoryEntry {
  id: string;
  timestamp: string;
  pipeline_type: "API" | "WebSocket";
  feature_type: "Text-to-Speech" | "Speech-to-Text";
  input_data: string;
  generated_response: string;
  audio_file_path: string;
}

/**
 * Options for logging a generation to the history database.
 */
export interface LogGenerationOptions {
  pipeline_type: "API" | "WebSocket";
  feature_type: "Text-to-Speech" | "Speech-to-Text";
  /** The raw topic string (text mode) or transcribed speech text (voice mode). */
  input_data: string;
  /** The full PodcastOutput returned by the pipeline. */
  output: PodcastOutput;
  /** The full podcast script (for human-readable storage). Optional for REST path. */
  script?: PodcastScript;
}

/**
 * Parameters for retrieving history entries.
 */
export interface GetHistoryParams {
  limit?: number;
}

let dbInstance: Database.Database | null = null;

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  dbInstance = new Database(DB_PATH);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id              TEXT PRIMARY KEY,
      timestamp       TEXT NOT NULL,
      pipeline_type   TEXT NOT NULL,
      feature_type    TEXT NOT NULL,
      input_data      TEXT NOT NULL,
      generated_response TEXT NOT NULL,
      audio_file_path TEXT NOT NULL
    )
  `);

  dbInstance.exec(
    "CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp DESC)"
  );

  log("INFO", `History database initialized at ${DB_PATH}`);

  return dbInstance;
}

/**
   * Logs a podcast generation to the persistent history database.
   * Called at the end of every successful pipeline (REST and WebSocket paths).
   */
  export function logGeneration(options: LogGenerationOptions): void {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO history (
      id, timestamp, pipeline_type, feature_type,
      input_data, generated_response, audio_file_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const filename = basename(options.output.outputPath);
  const audioUrl = `/api/output/${filename}`;

  const entry: HistoryEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    pipeline_type: options.pipeline_type,
    feature_type: options.feature_type,
    input_data: options.input_data,
    generated_response: options.script
      ? formatScriptAsText(options.script)
      : formatArticlesAsText(options.output.newsArticles),
    audio_file_path: audioUrl,
  };

  stmt.run(
    entry.id,
    entry.timestamp,
    entry.pipeline_type,
    entry.feature_type,
    entry.input_data,
    entry.generated_response,
    entry.audio_file_path
  );

  log("INFO", `History entry logged: ${entry.id}`);
}

/**
 * Retrieves the most recent history entries from the database.
 *
 * @param params.limit Maximum number of entries to return (default 50, max 200).
 * @returns Array of HistoryEntry objects, newest first.
 */
export function getHistory(params?: GetHistoryParams): HistoryEntry[] {
  const db = getDb();

  const limit = Math.min(params?.limit ?? 50, 200);

  const stmt = db.prepare(
    `SELECT * FROM history ORDER BY timestamp DESC LIMIT ?`
  );

  const rows = stmt.all(limit) as HistoryEntry[];

  return rows as HistoryEntry[];
}

/**
 * Formats a PodcastScript into a human-readable text representation.
 */
function formatScriptAsText(script: PodcastScript): string {
  const lines: string[] = [];

  lines.push(script.intro.text);
  lines.push("");

  script.newsItems.forEach((item) => {
    lines.push(item.text);
    lines.push("");
  });

  lines.push(script.outro.text);

  return lines.join("\n");
}

/**
 * Formats NewsItem[] into a human-readable text representation (REST path fallback).
 */
function formatArticlesAsText(articles: NewsItem[]): string {
  if (!articles || articles.length === 0) {
    return "No articles fetched.";
  }

  const lines: string[] = [];
  articles.forEach((article, i) => {
    lines.push(`${i + 1}. ${article.headline}`);
    lines.push(`   Source: ${article.source} | Published: ${article.publishedAt}`);
    lines.push(`   Summary: ${article.summary}`);
    lines.push(`   URL: ${article.url}`);
    lines.push("");
  });

  return lines.join("\n").trim();
}
export function closeHistoryDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    log("INFO", "History database connection closed.");
  }
}
