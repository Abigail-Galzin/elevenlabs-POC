import { useState } from "react";
import { clearCache } from "../services/api";
import type { GeneratePodcastResponse } from "../types";

interface PodcastPlayerProps {
  audioUrl: string;
  podcast: GeneratePodcastResponse;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function displayTopic(topic: string): string {
  return topic ? topic : "General News";
}

export default function PodcastPlayer({ audioUrl, podcast }: PodcastPlayerProps) {
  const [clearing, setClearing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function handleClearCache(): Promise<void> {
    setClearing(true);
    setToast(null);
    try {
      const res = await clearCache();
      setToast(res.message);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to clear cache.";
      setToast(msg);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {audioUrl ? (
        <audio controls src={audioUrl} className="w-full">
          Your browser does not support the audio element.
        </audio>
      ) : (
        <p className="text-sm text-gray-500">No audio available for this podcast.</p>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <span className="text-gray-500">Duration</span>
          <span className="font-medium text-gray-900"> {formatDuration(podcast.durationSeconds)}</span>
        </div>
        <div>
          <span className="text-gray-500">Topic</span>
          <span className="font-medium text-gray-900"> {displayTopic(podcast.topic)}</span>
        </div>
        <div>
          <span className="text-gray-500">Credits Consumed</span>
          <span className="font-medium text-gray-900"> {podcast.creditsConsumed.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-500">Credits Saved</span>
          <span className="font-medium text-gray-900"> {podcast.creditsSaved.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-500">Cache Hits</span>
          <span className="font-medium text-gray-900"> {podcast.cacheHits}</span>
        </div>
        <div>
          <span className="text-gray-500">Cache Misses</span>
          <span className="font-medium text-gray-900"> {podcast.cacheMisses}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleClearCache}
          disabled={clearing}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-200 focus:outline-none disabled:cursor-wait disabled:opacity-60"
        >
          {clearing ? "Clearing…" : "Clear Cache"}
        </button>
        {toast && (
          <span className="text-sm font-medium text-green-700">{toast}</span>
        )}
      </div>
    </div>
  );
}
