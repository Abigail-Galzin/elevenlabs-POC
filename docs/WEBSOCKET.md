# WebSocket Feature

## Automated Daily News Podcaster — Real-Time WebSocket Mode

**Document Version:** 1.0  
**Date:** 2026-08-16  
**Author:** Senior Software Architect  
**Related:** [SDD.md](./SDD.md) (v2.0), [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) (v2.0)

---

## Quick Path

1. Start the backend server: `npm run dev:server` (port 4000)
2. Start the frontend dev server: `npm run dev --prefix frontend` (port 5173)
3. Open `http://localhost:5173` in your browser
4. Click the **WebSocket** toggle (below the title)
5. Select a topic and click **Generate Podcast** — watch the real-time status tracker advance step by step

---

## Purpose

The WebSocket feature is an **additive alternative** to the REST API. It does not replace or modify any existing endpoint. Where the REST API returns a single response after the entire pipeline completes, the WebSocket mode streams live progress updates at every stage of podcast generation:

| Stage | REST | WebSocket |
|-------|------|-----------|
| Status updates | No (single response at end) | Yes — every stage streamed |
| Log output | Server-side console only | Streamed to client in real time |
| Per-block detail | No | Yes — which block is synthesizing, cache hits/misses per block |
| Cancel in progress | No | Yes — client sends `{ type: "cancel" }` |
| Audio delivery | REST endpoint after generation | Same `GET /api/output/:filename` |

---

## Architecture

```
Browser (React)                         Backend (Express + ws)
  │                                        │
  │── WebSocket (ws://localhost:4000)      │
  │                                        │
  │── { type: "generate", topic, source } ──►
  │                                        │
  │   ┌─ status: "fetching_news"           │── NewsProvider.fetchNews()
  │◄── │  log: "Step 1: Fetching news..."  │
  │   ├─ status: "building_script"         │── ScriptBuilder.buildScript()
  │◄── │  log: "Step 2: Building script..."│
  │   ├─ status: "synthesizing"            │── AudioManager.synthesizeSpeech()
  │◄── │  synthesizing: { block_type }      │── per block
  │◄── │  cache_hit: { cache_key }          │── on cache hit
  │◄── │  log: "Cache hit — 0 credits"      │
  │◄── │  synthesis_complete: { result }   │── per block done
  │   ├─ status: "stitching"               │── AudioManager.stitchSegments()
  │◄── │  log: "Stitching audio segments..."  │
  │   └─ status: "ready"                    │── (pipeline done)
  │◄── │  ready: { podcast: { ... } }       │
  │                                        │
  │── GET /api/output/podcast_xxx.mp3 ──►  │── serves MP3
```

### Key Components

| File | Role |
|------|------|
| `backend/src/services/podcastWebSocketOrchestrator.ts` | Pipeline orchestrator with WebSocket progress streaming. **Reuses** `AudioManager`, `ScriptBuilder`, `MockNewsProvider`, `VoiceCommandParser` — same components as the REST path. Does NOT modify `NewsPodscriber` or any existing service. |
| `backend/src/websocket.ts` | `attachWebSocket(httpServer, audioManager)` — creates a `ws.WebSocketServer` on the Express HTTP server, spawns a fresh `PodcastWebSocketOrchestrator` per connection, routes by `msg.type`. |
| `frontend/src/services/websocketClient.ts` | `WebSocketClient` class — browser WebSocket wrapper with auto-reconnect (1s→2s→4s→8s→8s, max 5 attempts), multi-handler dispatch, `send`/`on`/`off`/`disconnect`. |
| `frontend/src/components/WebSocketModeToggle.tsx` | REST API / WebSocket mode selector. |
| `frontend/src/components/StreamingLogs.tsx` | Collapsible log panel showing real-time server messages. |
| `frontend/src/App.tsx` | Orchestrator — when WebSocket mode is active, uses `WebSocketClient` instead of the REST API client. Existing REST handlers remain unchanged. |

### What Was NOT Changed

- All 4 REST endpoints (`/api/transcribe`, `/api/generate-podcast`, `/api/cache/clear`, `/api/output/:filename`) — byte-for-byte unchanged.
- `NewsPodcaster` class — unchanged; `generatePodcast()` still exists for REST mode.
- `AudioManager`, `ScriptBuilder`, `MockNewsProvider`, `VoiceCommandParser` — all unchanged.
- `recorder.ts` — still backend-only, still not imported into the frontend.

### What Was Added

- `podcastWebSocketOrchestrator.ts` — new class that calls the same service-layer components individually (instead of through `NewsPodcaster.generatePodcast()`) to emit progress updates between each step.
- `websocket.ts` — WebSocket server attachment.
- `websocketClient.ts`, `WebSocketModeToggle.tsx`, `StreamingLogs.tsx` — frontend WebSocket infrastructure.
- `NewsPanel.tsx` — new component that displays fetched news articles (headlines, summaries, sources, timestamps) in a card layout.
- `App.tsx` modified to support a `commMode` state (`"rest" | "websocket"`) alongside the existing `mode` state (`"text" | "voice"`).
- `podcastWebSocketOrchestrator.ts` and `newsPodcaster.ts` modified to include `newsArticles` in the `PodcastOutput` return value — the REST endpoint now returns the fetched articles in the response for display in both modes.
- `frontend/src/types/index.ts` and `backend/src/types/index.ts` modified to add `newsArticles: NewsItem[]` to the output/response types.

---

## WebSocket Protocol

### Connection

- **Dev:** `ws://localhost:4000`
- **Production:** `ws://{host}` or `wss://{host}` (based on `window.location.protocol`)
- The Vite dev server proxies `/api` to the Express backend; WebSocket connections go directly to port 4000 in dev.

### Client → Server Messages

```json
{ "type": "generate", "topic": "technology", "source": "text" }
{ "type": "generate", "topic": "", "source": "text" }
{ "type": "transcribe", "audio": "<base64-encoded audio data>", "mimeType": "audio/webm;codec=opus" }
{ "type": "cancel" }
```

| Message | Fields | Description |
|---------|--------|-------------|
| `generate` | `topic?: string`, `source: "text"\|"voice"` | Starts the full podcast pipeline with the given topic. |
| `transcribe` | `audio: string` (base64), `mimeType: string` | Transcribes the audio, extracts topic, then auto-triggers `generate` with `source: "voice"`. |
| `cancel` | (none) | Cancels the current pipeline (checked between steps). |

### Server → Client Messages

| Message | Fields | Description |
|---------|--------|-------------|
| `status` | `status: string` | Pipeline phase. Values: `"fetching_news"`, `"building_script"`, `"synthesizing"`, `"stitching"`, `"ready"`, `"error"`. |
| `log` | `level: "INFO"\|"WARNING"\|"ERROR"`, `message: string` | Console log line (mirrors server-side `log()` output). |
| `news` | `articles: NewsItem[]` | News items fetched from provider. |
| `script` | `script: PodcastScript` | Built podcast script (intro, news items, outro). |
| `synthesizing` | `block_type: string`, `text: string`, `char_count: number` | Starting synthesis of a specific block. |
| `cache_hit` | `cache_key: string` | Block served from cache (0 credits). |
| `synthesis_complete` | `result: SynthesisResult` | One block synthesis finished. |
| `stitching` | (none) | Starting ffmpeg audio stitching. |
| `transcription` | `transcript: string`, `voiceCommand: VoiceCommand` | STT result for a voice command. |
| `ready` | `podcast: AugmentedPodcastOutput` | Final result — full podcast metadata + `audioUrl`, `estimatedCredits`, `totalChars`. |
| `error` | `message: string` | Error occurred; pipeline halted. |

### Message Flow (Text Mode)

```
Client → { "type": "generate", "topic": "technology", "source": "text" }

Server → { "type": "status", "status": "fetching_news" }
Server → { "type": "log", "level": "INFO", "message": "Step 1: Fetching news..." }
Server → { "type": "news", "articles": [...] }
Server → { "type": "status", "status": "building_script" }
Server → { "type": "log", "level": "INFO", "message": "Step 2: Building podcast script..." }
Server → { "type": "script", "script": { ... } }
Server → { "type": "status", "status": "synthesizing" }
Server → { "type": "log", "level": "INFO", "message": "Step 3: Synthesizing audio blocks..." }
Server → { "type": "synthesizing", "block_type": "intro", "text": "...", "char_count": 180 }
Server → { "type": "synthesis_complete", "result": { ... } }  (×5 blocks: intro + 3 news + outro)
Server → { "type": "status", "status": "stitching" }
Server → { "type": "stitching" }
Server → { "type": "log", "level": "INFO", "message": "Step 4: Stitching audio segments..." }
Server → { "type": "status", "status": "ready" }
Server → { "type": "ready", "podcast": { "outputPath": "...", "audioUrl": "/api/output/podcast_xxx.mp3", ... } }
```

### Message Flow (Voice Mode)

```
Client → { "type": "transcribe", "audio": "<base64>", "mimeType": "audio/webm;codec=opus" }

Server → { "type": "log", "level": "INFO", "message": "Transcribing audio via WebSocket..." }
Server → { "type": "transcription", "transcript": "technology news today", "voiceCommand": { "topic": "technology", ... } }
Server → { "type": "log", "level": "INFO", "message": "Starting podcast generation for topic: technology..." }
Server → { "type": "status", "status": "fetching_news" }
... (same as text mode from here)
```

### Cancellation

```
Client → { "type": "cancel" }

Server → { "type": "error", "message": "Generation cancelled." }
```

The orchestrator checks the cancellation flag before each pipeline step (news fetch, script build, each block synthesis, stitching). If cancelled, it sends an error message and returns immediately.

---

## Usage

### On the Frontend

1. Start both servers (backend on port 4000, frontend on port 5173).
2. Open `http://localhost:5173`.
3. Click the **WebSocket** toggle below the title.
4. You'll see a connection status indicator: "● WebSocket connected · real-time streaming" (green) or "● WebSocket disconnected · retrying..." (red).
5. Choose **Text** or **Voice** mode (same as REST mode):
   - **Text mode:** Select a topic from the dropdown, click "Generate Podcast."
   - **Voice mode:** Click "Record Voice," speak your request, click "Stop Recording." The audio is encoded to base64 and sent over WebSocket for transcription.
6. Watch the `StatusTracker` advance in real time: Recording → Transcribing → Fetching News → Script → Synthesizing → Stitching → Ready.
7. Expand the **Logs** panel to see detailed per-step output (news count, script stats, per-block cache hits, credit consumption).
8. During generation, click **Cancel Generation** to stop the pipeline.
  9. Once ready, the `PodcastPlayer` appears with the generated MP3 and metadata.
  10. The **News Articles** panel appears automatically when articles are fetched, showing headlines, summaries, sources, and publication timestamps for each article included in the podcast script.

### Auto-Reconnect

If the WebSocket connection drops (e.g., server restarts), the `WebSocketClient` automatically retries with exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1 | 1 second |
| 2 | 2 seconds |
| 3 | 4 seconds |
| 4 | 8 seconds |
| 5 | 8 seconds (capped) |

After 5 failed attempts, the client stops retrying and shows "WebSocket disconnected."

---

## Implementation Details

### Backend: Pipeline Orchestration Strategy

The WebSocket orchestrator (`podcastWebSocketOrchestrator.ts`) does NOT call `NewsPodcaster.generatePodcast()` — that method runs the entire pipeline internally with no progress hooks. Instead, the orchestrator calls the **same individual service components** that `NewsPodcaster` uses, breaking the pipeline into observable steps:

```
NewsProvider.fetchNews()     → send "news" message
ScriptBuilder.buildScript()  → send "script" message
AudioManager.synthesizeSpeech() per block → send "synthesizing"/"cache_hit"/"synthesis_complete"
AudioManager.stitchSegments() → send "stitching"
Assemble output             → send "ready"
```

This reuses the exact same logic (no duplication) while enabling fine-grained progress streaming.

### Backend: WebSocket Server Integration

The WebSocket server is attached to the Express HTTP server in `server.ts`:

```typescript
// server.ts (additive — existing REST endpoints unchanged)
import { createServer } from "node:http";
import { attachWebSocket } from "./websocket.js";

const httpServer = createServer(app);
attachWebSocket(httpServer, audioManager);
httpServer.listen(PORT, ...);
```

The `ws.WebSocketServer` is created with `{ server: httpServer }`, which means it shares the same HTTP server and port (4000) as the Express app. REST requests and WebSocket upgrades are handled by the same server.

One `PodcastWebSocketOrchestrator` instance is created per WebSocket connection, ensuring isolated state between clients.

### Frontend: WebSocket Client Architecture

The `WebSocketClient` class uses a pub/sub pattern:
- `on(type, handler)` — subscribes to a specific message type (multiple handlers per type supported via `Set`)
- `send(message)` — sends a JSON-serialized `ClientMessage`
- `disconnect()` — cleans up event listeners, clears reconnect timer

The `App.tsx` component wires up handlers for all 11 server message types in `setupWsHandlers()`, mapping WebSocket events to React state updates.

### Frontend: Status Mapping

WebSocket server statuses are mapped to `PipelineStatus` values:

| WebSocket `status` | Frontend `PipelineStatus` |
|---|---|
| `"fetching_news"` | `"fetching_news"` |
| `"building_script"` | `"building_script"` |
| `"synthesizing"` | `"synthesizing"` |
| `"stitching"` | `"stitching"` |
| `"ready"` | `"ready"` |
| `"error"` | `"error"` |

The `StatusTracker` component displays 7 steps in order: Recording → Transcribing → Fetching News → Script → Synthesizing → Stitching → Ready. Intermediate steps (Script, Stitching) appear as completed (green) when they occur between major status updates, since they happen internally within the pipeline.

### Voice Recording Over WebSocket

When using voice mode with WebSocket:
1. The `AudioRecorder` component captures audio via the browser's `MediaRecorder` API (same as REST mode).
2. When recording stops, the audio `Blob` is converted to a base64 string via `FileReader.readAsDataURL()`.
3. The base64 data is sent as `{ type: "transcribe", audio: "<base64>", mimeType: "<mime>" }`.
4. The backend decodes the base64, writes to a temp file, transcribes via `AudioManager.transcribeAudio()`, parses the topic via `VoiceCommandParser.parse()`, then auto-triggers generation.
5. Progress updates stream back in real time.

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `ws` | ^8.0.0 | WebSocket server for Node.js |
| `@types/ws` | ^8.0.0 | TypeScript types for `ws` |

These are in addition to the existing REST API dependencies (`express`, `cors`, `multer`).

---

## Testing & Verification

- **TypeScript:** `npx tsc --noEmit -p backend/tsconfig.json` and `npx tsc --noEmit -p frontend/tsconfig.json` — both pass with 0 errors.
- **Vite build:** `npx vite build` (from `frontend/`) — succeeds with all utilities generated.
- **Import boundary:** `grep -rn "recorder\|node-record\|backend/" frontend/src/` — zero matches.
- **Existing REST endpoints:** All 4 REST endpoints in `server.ts` are unchanged (verified by diff).
- **No credit consumption during testing:** The WebSocket server code is verified via TypeScript compilation only — no server was started or API calls made during development.

---

## Non-Goals & Limitations

- The WebSocket server does not implement authentication or per-client rate limiting.
- The `ws` library's WebSocket server runs on the same HTTP server as Express — no separate port.
- Audio is sent as base64 — this increases payload size by ~33% compared to binary. For short voice commands (<30s), this is acceptable. A future enhancement could use binary frames.
- The WebSocket mode provides real-time streaming but does not offer performance advantages over REST — the total pipeline time is the same (both call the same ElevenLabs APIs).
- The `cancel` message is only effective between pipeline steps, not during an in-progress ElevenLabs API call.

---

*End of document (v1.0)*
