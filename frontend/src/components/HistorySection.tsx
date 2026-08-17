import { useEffect, useState } from "react";
import { fetchHistory } from "../services/api";
import type { HistoryEntry, HistoryResponse } from "../types";

export default function HistorySection() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const data: HistoryResponse = await fetchHistory();
      setHistory(data.entries);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load history.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function toggleCard(id: string): void {
    setExpandedId(expandedId === id ? null : id);
  }

  function formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-500">
        Loading history...
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
        <button
          onClick={loadHistory}
          className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500">
        No history yet. Generate your first podcast to see it appear here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {history.map((entry) => (
        <div
          key={entry.id}
          className="rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
        >
          <button
            type="button"
            onClick={() => toggleCard(entry.id)}
            className="flex w-full items-center justify-between p-4 text-left"
          >
            <div className="flex-1 truncate">
              <h3 className="text-sm font-semibold text-gray-900">
                {entry.input_data || "(general news)"}
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                {formatDate(entry.timestamp)}
              </p>
            </div>
            <div className="ml-4 flex flex-shrink-0 items-center gap-2">
              <span
                className={
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
                  (entry.pipeline_type === "WebSocket"
                    ? "bg-purple-100 text-purple-800"
                    : "bg-blue-100 text-blue-800")
                }
              >
                {entry.pipeline_type}
              </span>
              <span
                className={
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
                  (entry.feature_type === "Speech-to-Text"
                    ? "bg-green-100 text-green-800"
                    : "bg-amber-100 text-amber-800")
                }
              >
                {entry.feature_type === "Speech-to-Text"
                  ? "Voice"
                  : "Text"}
              </span>
              <span
                className={`transform text-gray-400 transition-transform ${
                  expandedId === entry.id ? "rotate-180" : ""
                }`}
              >
                ▼
              </span>
            </div>
          </button>

          {expandedId === entry.id && (
            <div className="border-t border-gray-200 px-4 pb-4">
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">
                    Requested Input
                  </h4>
                  <div className="rounded-md bg-gray-50 p-3">
                    <p className="whitespace-pre-wrap break-words text-sm text-gray-800">
                      {entry.input_data || "(general news — no specific topic)"}
                    </p>
                  </div>
                </div>
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">
                    Generated News Response
                  </h4>
                  <div className="rounded-md bg-gray-50 p-3">
                    <p className="whitespace-pre-wrap break-words text-sm text-gray-800">
                      {entry.generated_response || "(no response data)"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">
                  Audio
                </h4>
                <div className="rounded-md bg-gray-50 p-3">
                  <audio
                    controls
                    src={entry.audio_file_path}
                    className="w-full"
                    preload="none"
                  >
                    Your browser does not support the audio element.
                  </audio>
                  <p className="mt-1 text-xs text-gray-500">
                    {entry.audio_file_path}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
