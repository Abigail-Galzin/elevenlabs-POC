import { useEffect, useRef, useState } from "react";

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob) => void;
  onStatusChange?: (status: "recording" | "idle") => void;
}

function getSupportedMimeType(): string {
  const candidates = [
    "audio/webm;codec=opus",
    "audio/webm",
    "audio/wav",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const PERMISSION_LABELS: Record<PermissionState, string> = {
  prompt: "⏳ Prompt",
  granted: "✅ Granted",
  denied: "❌ Denied",
};

export default function AudioRecorder({
  onRecordingComplete,
  onStatusChange,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [permission, setPermission] = useState<PermissionState>("prompt");
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopTimer();
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTimer(): void {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function stopStream(): void {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function startTimer(): void {
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
  }

  async function startRecording(): Promise<void> {
    setError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const err = e as Error;
      setPermission("denied");
      if (err.name === "NotAllowedError") {
        setError(
          "Microphone access was denied. Please allow microphone access in your browser settings.",
        );
      } else if (err.name === "NotFoundError") {
        setError(
          "No microphone was found. Please connect a microphone and try again.",
        );
      } else {
        setError(`Microphone error: ${err.message}`);
      }
      return;
    }

    setPermission("granted");
    streamRef.current = stream;

    const mimeType = getSupportedMimeType();
    const mediaRecorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onerror = (e: Event) => {
      setError(
        `Recording error: ${(e as ErrorEvent).message || "an unknown error occurred"}`,
      );
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: mimeType || "audio/wav",
      });
      chunksRef.current = [];
      stopTimer();
      setIsRecording(false);
      onStatusChange?.("idle");
      onRecordingComplete(blob);
    };

    setIsRecording(true);
    onStatusChange?.("recording");
    startTimer();
    mediaRecorder.start();
  }

  function stopRecording(): void {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  }

  function toggle(): void {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm">
        <span>
          Mic permission:{" "}
          <span className="font-medium">{PERMISSION_LABELS[permission]}</span>
        </span>
        {isRecording && (
          <span className="font-mono text-red-600">● {formatTime(elapsed)}</span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <button
        type="button"
        onClick={toggle}
        disabled={permission === "denied"}
        className={
          "w-full rounded-md px-5 py-3 text-base font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 " +
          (isRecording
            ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
            : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500") +
          " disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {isRecording ? "Stop Recording" : "Record Voice"}
      </button>
    </div>
  );
}
