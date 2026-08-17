interface WebSocketModeToggleProps {
  mode: "rest" | "websocket";
  onChange: (mode: "rest" | "websocket") => void;
}

export default function WebSocketModeToggle({
  mode,
  onChange,
}: WebSocketModeToggleProps) {
  return (
    <nav className="flex justify-center gap-2">
      <button
        type="button"
        onClick={() => onChange("rest")}
        className={
          "rounded-md px-4 py-2 font-medium transition-colors focus:ring-2 focus:outline-none " +
          (mode === "rest"
            ? "bg-blue-600 text-white ring-blue-500"
            : "border border-gray-300 text-gray-700 hover:bg-gray-50")
        }
      >
        REST API
      </button>
      <button
        type="button"
        onClick={() => onChange("websocket")}
        className={
          "rounded-md px-4 py-2 font-medium transition-colors focus:ring-2 focus:outline-none " +
          (mode === "websocket"
            ? "bg-blue-600 text-white ring-blue-500"
            : "border border-gray-300 text-gray-700 hover:bg-gray-50")
        }
      >
        WebSocket
      </button>
    </nav>
  );
}
