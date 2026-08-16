import { useState } from "react";
import AudioRecorder from "./components/AudioRecorder";
import PodcastPlayer from "./components/PodcastPlayer";
import StatusTracker from "./components/StatusTracker";
import TopicInput from "./components/TopicInput";
import { generatePodcast, transcribeAudio } from "./services/api";
import type { GeneratePodcastResponse, PipelineStatus } from "./types";

const BUSY_STATUSES: PipelineStatus[] = [
  "recording",
  "transcribing",
  "fetching_news",
  "synthesizing",
];

const SYNTHESIZE_DELAY_MS = 450;

export default function App() {
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [status, setStatus] = useState<PipelineStatus>("idle");
  const [podcast, setPodcast] = useState<GeneratePodcastResponse | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isBusy = BUSY_STATUSES.includes(status);

  function resetOutputs(): void {
    setError(null);
    setTranscript(null);
    setPodcast(null);
    setAudioBlob(null);
  }

  async function handleGenerateText(): Promise<void> {
    resetOutputs();
    setStatus("fetching_news");
    try {
      const data = await generatePodcast(selectedTopic, "text");
      setPodcast(data);
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

  async function handleRecordingComplete(blob: Blob): Promise<void> {
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

  function handleStatusChange(
    nextStatus: "recording" | "idle",
  ): void {
    if (nextStatus === "recording") {
      setStatus("recording");
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl space-y-6">
          <header className="text-center">
            <h1 className="text-3xl font-extrabold text-gray-900">
              Automated Daily News Podcaster
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Radio-style podcasts from the latest headlines.
            </p>
          </header>

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

          {status !== "idle" && (
            <StatusTracker status={status} />
          )}

          {mode === "text" && (
            <section className="space-y-4">
              <TopicInput value={selectedTopic} onChange={setSelectedTopic} />
              <button
                type="button"
                onClick={handleGenerateText}
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
                onRecordingComplete={handleRecordingComplete}
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

          {podcast && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <PodcastPlayer
                audioUrl={podcast.audioUrl}
                podcast={podcast}
              />
            </section>
          )}
        </div>
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
