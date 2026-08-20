import { type Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket, type RawData } from "ws";

import { AudioManager } from "./audioManager.js";
import { MockNewsProvider } from "./mocks/MockNewsProvider.js";
import {
  PodcastWebSocketOrchestrator,
  type GenerateMessage,
  type TranscribeMessage,
} from "./services/podcastWebSocketOrchestrator.js";
import { log } from "./utils/functions.js";

/* -------------------------------------------------------------------------- */
/* attachWebSocket — wires the WebSocketServer onto the Express HTTP server   */
/* -------------------------------------------------------------------------- */

export function attachWebSocket(
  httpServer: HttpServer,
  audioManager: AudioManager
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws: WebSocket) => {
    log("INFO", "WebSocket client connected.");

    const orchestrator = new PodcastWebSocketOrchestrator(
      audioManager,
      new MockNewsProvider()
    );

    ws.on("message", (data: RawData) => {
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        ws.send(
          JSON.stringify({ type: "error", message: "Invalid JSON message." })
        );
        return;
      }

      const typedMsg = msg as { type: string };

      switch (typedMsg.type) {
        case "generate":
          orchestrator.handleGenerate(ws, msg as GenerateMessage);
          break;
        case "transcribe":
          orchestrator.handleTranscribe(ws, msg as TranscribeMessage);
          break;
        case "cancel":
          orchestrator.cancel();
          break;
        default:
          ws.send(
            JSON.stringify({
              type: "error",
              message: `Unknown message type: ${typedMsg.type}`,
            })
          );
          break;
      }
    });

    ws.on("close", () => {
      log("INFO", "WebSocket client disconnected.");
    });

    ws.on("error", (error: Error) => {
      log("ERROR", `WebSocket connection error: ${error.message}`);
    });
  });

  wss.on("error", (error: Error) => {
    log("ERROR", `WebSocketServer error: ${error.message}`);
  });

  return wss;
}
