import { useEffect, useRef, useState } from "react";
import AudioRecorder from "./components/AudioRecorder";
import HistorySection from "./components/HistorySection";
import NewsPanel from "./components/NewsPanel";
import PodcastPlayer from "./components/PodcastPlayer";
import StatusTracker from "./components/StatusTracker";
import TopicInput from "./components/TopicInput";
import WebSocketModeToggle from "./components/WebSocketModeToggle";
import StreamingLogs from "./components/StreamingLogs";
import type { LogEntry } from "./components/StreamingLogs";
import { generatePodcast, transcribeAudio } from "./services/api";
import { WebSocketClient } from "./services/websocketClient";
import type { GeneratePodcastResponse, NewsItem, PipelineStatus } from "./types";

const BUSY_STATUSES: readonly PipelineStatus[] = [
  "recording",
  "transcribing",
  "fetching_news",
  "building_script",
  "synthesizing",
  "stitching",
];

const SYNTHESIZE_DELAY_MS = 450;

export default function App() {
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [commMode, setCommMode] = useState<"rest" | "websocket">("rest");
  const [view, setView] = useState<"main" | "history">("main");

  const [selectedTopic, setSelectedTopic] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [status, setStatus] = useState<PipelineStatus>("idle");
  const [podcast, setPodcast] = useState<GeneratePodcastResponse | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [wsConnected, setWsConnected] = useState(false);
  const [wsLogs, setWsLogs] = useState<LogEntry[]>([]);
  const [newsArticles, setNewsArticles] = useState<NewsItem[] | null>(null);
  const wsClientRef = useRef<WebSocketClient | null>(null);

  const isBusy = BUSY_STATUSES.includes(status);

  /* ---------------------------------------------------------------- */
  /* WebSocket lifecycle                                              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (commMode !== "websocket") return;

    const wsUrl =
      import.meta.env.DEV
        ? "ws://localhost:4000"
        : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

    const client = new WebSocketClient(wsUrl);
    wsClientRef.current = client;

    setupWsHandlers(client);

    void client
      .connect()
      .then(() => setWsConnected(true))
      .catch(() => setWsConnected(false));

    return () => {
      client.disconnect();
      wsClientRef.current = null;
      setWsConnected(false);
    };
  }, [commMode]);

  function setupWsHandlers(client: WebSocketClient): void {
    client.on("status", (msg) => {
      if (msg.type === "status") mapWsStatus(msg.status);
    });

    client.on("log", (msg) => {
      if (msg.type === "log") addLog(msg.level, msg.message);
    });

    client.on("transcription", (msg) => {
      if (msg.type === "transcription") {
        setTranscript(msg.transcript);
        setSelectedTopic(msg.voiceCommand.topic);
      }
    });

    client.on("ready", (msg) => {
      if (msg.type === "ready") {
        setPodcast(msg.podcast);
        setStatus("ready");
        addLog(
          "INFO",
          `Podcast ready! Duration: ${msg.podcast.durationSeconds.toFixed(1)}s, ` +
            `${msg.podcast.creditsConsumed} credits consumed.`
        );
      }
    });

    client.on("error", (msg) => {
      if (msg.type === "error") {
        setError(msg.message);
        setStatus("idle");
        addLog("ERROR", msg.message);
      }
    });

    client.on("news", (msg) => {
      if (msg.type === "news") {
        setNewsArticles(msg.articles);
        addLog("INFO", `Fetched ${msg.articles.length} news items.`);
      }
    });

    client.on("script", (msg) => {
      if (msg.type === "script") {
        addLog(
          "INFO",
          `Script built: ${msg.script.totalChars} chars, ~${msg.script.estimatedCredits} credits estimated.`
        );
      }
    });

    client.on("synthesizing", (msg) => {
      if (msg.type === "synthesizing") {
        addLog(
          "INFO",
          `Synthesizing ${msg.block_type} block (${msg.char_count} chars)...`
        );
      }
    });

    client.on("cache_hit", (_msg) => {
      addLog("INFO", `Cache hit — 0 credits consumed.`);
    });

    client.on("synthesis_complete", (msg) => {
      if (msg.type === "synthesis_complete") {
        const r = msg.result;
        addLog(
          "INFO",
          r.fromCache
            ? "Cache hit — 0 credits."
            : `Cache miss — ${r.credits} credits consumed.`
        );
      }
    });

    client.on("stitching", () => {
      addLog("INFO", "Stitching audio segments with ffmpeg...");
    });
  }

  function mapWsStatus(wsStatus: string): void {
    const mapping: Record<string, PipelineStatus> = {
      fetching_news: "fetching_news",
      building_script: "building_script",
      synthesizing: "synthesizing",
      stitching: "stitching",
      ready: "ready",
      error: "error",
    };
    setStatus(mapping[wsStatus] ?? "idle");
  }

  function addLog(level: "INFO" | "WARNING" | "ERROR", message: string): void {
    setWsLogs((prev) => [...prev, { level, message }].slice(-500));
  }

  function blobToBase64(
    blob: Blob
  ): Promise<{ base64: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const parts = dataUrl.split(",");
        const base64 = parts[1] ?? "";
        resolve({ base64, mimeType: blob.type });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  /* ---------------------------------------------------------------- */
  /* State helpers                                                    */
  /* ---------------------------------------------------------------- */

  function resetOutputs(): void {
    setError(null);
    setTranscript(null);
    setPodcast(null);
    setAudioBlob(null);
    setWsLogs([]);
    setNewsArticles(null);
  }

  function switchCommMode(newMode: "rest" | "websocket"): void {
    if (wsClientRef.current) {
      wsClientRef.current.disconnect();
      wsClientRef.current = null;
    }
    setWsConnected(false);
    resetOutputs();
    setCommMode(newMode);
  }

  /* ---------------------------------------------------------------- */
  /* REST handlers (unchanged from original)                          */
  /* ---------------------------------------------------------------- */

  async function handleGenerateTextRest(): Promise<void> {
    resetOutputs();
    setStatus("fetching_news");
    try {
      const data = await generatePodcast(selectedTopic, "text");
      setPodcast(data);
      setNewsArticles(data.newsArticles ?? null);
      setStatus("synthesizing");
      await new Promise((resolve) => setTimeout(resolve, SYNTHESIZE_DELAY_MS));
      setStatus("ready");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to generate podcast.";
      setError(msg);
      setStatus("idle");
    }
  }

  async function handleRecordingCompleteRest(blob: Blob): Promise<void> {
    setAudioBlob(blob);
    resetOutputs();
    setStatus("transcribing");
    try {
      const res = await transcribeAudio(blob);
      setTranscript(res.transcript);
      setSelectedTopic(res.voiceCommand.topic);

      setStatus("fetching_news");
      const data = await generatePodcast(res.voiceCommand.topic, "voice");
      setPodcast(data);
      setNewsArticles(data.newsArticles ?? null);
      setStatus("synthesizing");
      await new Promise((resolve) => setTimeout(resolve, SYNTHESIZE_DELAY_MS));
      setStatus("ready");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Voice pipeline failed.";
      setError(msg);
      setStatus("idle");
    }
  }

  /* ---------------------------------------------------------------- */
  /* WebSocket handlers                                                */
  /* ---------------------------------------------------------------- */

  function handleGenerateTextWs(): void {
    resetOutputs();
    wsClientRef.current?.send({
      type: "generate",
      topic: selectedTopic,
      source: "text",
    });
  }

  function handleCancel(): void {
    wsClientRef.current?.send({ type: "cancel" });
  }

  async function handleRecordingCompleteWs(blob: Blob): Promise<void> {
    setAudioBlob(blob);
    resetOutputs();
    setStatus("transcribing");

    try {
      const { base64, mimeType } = await blobToBase64(blob);
      wsClientRef.current?.send({
        type: "transcribe",
        audio: base64,
        mimeType,
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to encode audio for WebSocket.";
      setError(msg);
      setStatus("idle");
    }
  }

  /* ---------------------------------------------------------------- */
  /* Shared handlers                                                   */
  /* ---------------------------------------------------------------- */

  function handleStatusChange(nextStatus: "recording" | "idle"): void {
    if (nextStatus === "recording") {
      setStatus("recording");
    }
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Persistent History navigation button (top-right corner) */}
      <button
        type="button"
        onClick={() => setView(view === "main" ? "history" : "main")}
        className="fixed top-4 right-4 z-10 rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
      >
        {view === "main" ? "History" : "← Back"}
      </button>

      <main className="flex min-h-screen items-center justify-center px-4 pt-16 pb-10">
        {view === "history" ? (
          <div className="w-full max-w-2xl">
            <header className="mb-6 text-center">
              <h1 className="text-3xl font-extrabold text-gray-900">
                History Log
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Past podcast generations.
              </p>
            </header>
            <HistorySection />
          </div>
        ) : (
          <div className="w-full max-w-2xl space-y-6">
            <header className="text-center">
              <h1 className="text-3xl font-extrabold text-gray-900">
                Automated Daily News Podcaster
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Radio-style podcasts from the latest headlines.
              </p>
            </header>

          {/* Communication mode toggle */}
          <WebSocketModeToggle
            mode={commMode}
            onChange={switchCommMode}
          />

          {/* WebSocket connection status */}
          {commMode === "websocket" && (
            <div className="flex justify-center">
              <span
                className={`text-sm font-medium ${
                  wsConnected ? "text-green-600" : "text-red-600"
                }`}
              >
                {wsConnected
                  ? "● WebSocket connected · real-time streaming"
                  : "● WebSocket disconnected · retrying..."}
              </span>
            </div>
          )}

          {/* Text / Voice mode toggle */}
          <nav className="flex justify-center gap-2">
            <ModeButton
              label="Text"
              active={mode === "text"}
              onClick={() => {
                setMode("text");
                resetOutputs();
                setStatus("idle");
              }}
            />
            <ModeButton
              label="Voice"
              active={mode === "voice"}
              onClick={() => {
                setMode("voice");
                resetOutputs();
                setStatus("idle");
              }}
            />
          </nav>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}
          {status !== "idle" && status !== "error" && (
            <StatusTracker status={status} />
          )}

          {status === "error" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Pipeline error. Check the logs below for details.
            </div>
          )}

          {/* Streaming logs (WebSocket mode only) */}
          {commMode === "websocket" && wsLogs.length > 0 && (
            <StreamingLogs logs={wsLogs} />
          )}

          {/* News articles panel (both REST and WebSocket) */}
          {newsArticles && newsArticles.length > 0 && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <NewsPanel articles={newsArticles} />
            </section>
          )}
          {mode === "text" && (
            <section className="space-y-4">
              <TopicInput value={selectedTopic} onChange={setSelectedTopic} />
              <button
                type="button"
                onClick={
                  commMode === "websocket"
                    ? handleGenerateTextWs
                    : handleGenerateTextRest
                }
                disabled={isBusy}
                className="w-full rounded-md bg-blue-600 px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:cursor-wait disabled:opacity-60"
              >
                {isBusy ? "Generating…" : "Generate Podcast"}
              </button>
            </section>
          )}

          {mode === "voice" && (
            <section className="space-y-4">
              <AudioRecorder
                onRecordingComplete={
                  commMode === "websocket"
                    ? handleRecordingCompleteWs
                    : handleRecordingCompleteRest
                }
                onStatusChange={handleStatusChange}
              />
              {transcript && (
                <div className="rounded-lg border border-gray-200 bg-neutral-100 p-4">
                  <p className="mb-1 text-xs font-semibold uppercase text-gray-500">
                    Transcript
                  </p>
                  <p className="text-sm text-gray-800">{transcript}</p>
                </div>
              )}
            </section>
          )}

          {/* Cancel button (WebSocket mode only) */}
          {commMode === "websocket" && isBusy && (
            <button
              type="button"
              onClick={handleCancel}
              className="w-full rounded-md border border-gray-300 bg-white px-5 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              Cancel Generation
            </button>
          )}

          {podcast && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <PodcastPlayer
                audioUrl={podcast.audioUrl}
                podcast={podcast}
              />
            </section>
          )}
          </div>
        )}
      </main>
    </div>
  );
}

interface ModeButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function ModeButton({ label, active, onClick }: ModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md px-4 py-2 text-sm font-medium transition-colors focus:ring-2 focus:outline-none " +
        (active
          ? "bg-blue-600 text-white ring-blue-500"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200")
      }
    >
      {label}
    </button>
  );
}
