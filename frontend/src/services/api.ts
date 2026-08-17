import type {
  CacheClearResponse,
  GeneratePodcastResponse,
  HistoryResponse,
  TranscribeResponse,
} from "../types";

function toErrorMessage(data: unknown): string {
  if (data && typeof data === "object" && "error" in data) {
    const msg = (data as { error?: unknown }).error;
    if (typeof msg === "string") return msg;
  }
  return "Request failed.";
}

export async function transcribeAudio(
  blob: Blob,
): Promise<TranscribeResponse> {
  const form = new FormData();
  const subtype = blob.type.split(";")[0].split("/")[1] || "wav";
  form.append("audio", blob, `recording.${subtype}`);

  const res = await fetch("/api/transcribe", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(toErrorMessage(data));
  }

  return res.json();
}

export async function generatePodcast(
  topic: string,
  source: "text" | "voice",
): Promise<GeneratePodcastResponse> {
  const res = await fetch("/api/generate-podcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, source }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(toErrorMessage(data));
  }

  return res.json();
}

export async function clearCache(): Promise<CacheClearResponse> {
  const res = await fetch("/api/cache/clear", {
    method: "POST",
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(toErrorMessage(data));
  }

  return res.json();
}

export async function fetchHistory(limit?: number): Promise<HistoryResponse> {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  const queryString = params.toString();
  const res = await fetch(queryString ? `/api/history?${queryString}` : "/api/history");

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(toErrorMessage(data));
  }

  return res.json();
}
