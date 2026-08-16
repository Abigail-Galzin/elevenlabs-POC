import { TopicOption } from "../types";

const TOPIC_OPTIONS: TopicOption[] = [
  { value: "", label: "General News" },
  { value: "technology", label: "Technology" },
  { value: "sports", label: "Sports" },
  { value: "politics", label: "Politics" },
  { value: "business", label: "Business" },
  { value: "science", label: "Science" },
  { value: "entertainment", label: "Entertainment" },
  { value: "health", label: "Health" },
];

export { TOPIC_OPTIONS };
export type { TopicOption };

interface TopicInputProps {
  value: string;
  onChange: (topic: string) => void;
}

export default function TopicInput({ value, onChange }: TopicInputProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="topic-select" className="text-sm font-medium text-gray-700">
        News Topic
      </label>
      <select
        id="topic-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
      >
        {TOPIC_OPTIONS.map((option) => (
          <option key={option.value || "__general__"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
