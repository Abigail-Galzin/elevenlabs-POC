import { PipelineStatus } from "../types";

interface Step {
  key: PipelineStatus;
  label: string;
  icon: string;
}

const STEPS: Step[] = [
  { key: "recording", label: "Recording", icon: "🎙️" },
  { key: "transcribing", label: "Transcribing", icon: "📝" },
  { key: "fetching_news", label: "Fetching News", icon: "📰" },
  { key: "synthesizing", label: "Synthesizing", icon: "🔊" },
  { key: "ready", label: "Ready", icon: "✅" },
];

const STATUS_ORDER: PipelineStatus[] = [
  "recording",
  "transcribing",
  "fetching_news",
  "synthesizing",
  "ready",
];

interface StatusTrackerProps {
  status: PipelineStatus;
}

function joinClasses(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function StatusTracker({ status }: StatusTrackerProps) {
  if (status === "idle") return null;

  const activeIndex = STATUS_ORDER.indexOf(status);
  const completed = activeIndex >= 0;

  return (
    <div className="flex w-full items-center justify-between gap-2">
      {STEPS.map((step, i) => {
        const isComplete = completed && i < activeIndex;
        const isActive = completed && i === activeIndex;
        const isPending = !completed || i > activeIndex;

        return (
          <div key={step.key} className="flex items-center gap-2">
            <div
              className={joinClasses(
                "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xl transition-all",
                isActive && "bg-blue-100 text-blue-700 ring-2 ring-blue-500",
                isComplete && "bg-green-100 text-green-700",
                isPending && "bg-gray-100 text-gray-400",
              )}
            >
              {isComplete ? "✅" : step.icon}
            </div>
            <span
              className={joinClasses(
                "hidden text-sm font-medium sm:inline",
                isActive && "text-blue-700",
                isComplete && "text-green-700",
                isPending && "text-gray-400",
              )}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={joinClasses(
                  "h-0.5 w-6 sm:w-12",
                  isComplete ? "bg-green-500" : isActive ? "bg-blue-500" : "bg-gray-300",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
