import { useEffect, useRef, useState } from "react";

export type LogLevel = "INFO" | "WARNING" | "ERROR";

export interface LogEntry {
  level: LogLevel;
  message: string;
}

interface StreamingLogsProps {
  logs: LogEntry[];
  maxLines?: number;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  INFO: "text-gray-600",
  WARNING: "text-amber-700",
  ERROR: "text-red-700",
};

export default function StreamingLogs({ logs, maxLines = 100 }: StreamingLogsProps) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, expanded]);

  const trimmed = logs.length > maxLines ? logs.slice(logs.length - maxLines) : logs;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
      >
        <span>Logs ({logs.length})</span>
        <span className="text-gray-400">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div
          ref={containerRef}
          className="mt-1 max-h-[200px] overflow-y-auto font-mono text-xs"
        >
          {trimmed.map((log, i) => (
            <div key={i} className="whitespace-pre-wrap py-0.5">
              <span className={`w-9 font-medium ${LEVEL_COLORS[log.level]}`}>
                [{log.level}]
              </span>{" "}
              <span className="text-gray-800">{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
