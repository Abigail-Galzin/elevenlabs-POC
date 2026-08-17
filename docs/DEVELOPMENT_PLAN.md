# Development Plan

## Automated Daily News Podcaster — Proof of Concept

**Plan Version:** 3.0  
**Date:** 2026-08-16  
**Author:** Senior Software Architect  
**Dependency:** Based on [SDD.md](./SDD.md) v3.0

---

## Overview

This document outlines the step-by-step implementation plan for building the Automated Daily News Podcaster PoC. The plan is organized into 5 milestones, each delivering a testable increment of functionality.

---

## Milestone 1: Environment Setup

**Goal:** Establish a clean TypeScript project with all dependencies installed and runnable.

### Tasks

| # | Task | Details | Est. Time |
|---|------|---------|-----------|
| 1.1 | Create `package.json` | `npm init -y`, name: `daily-news-podcaster`, set `"type": "module"`. | 5 min |
| 1.2 | Install runtime dependencies | `npm install @elevenlabs/elevenlabs-js dotenv ffmpeg-static fluent-ffmpeg node-record-lpcm16-ts` | 5 min |
| 1.2b | Install system dependency for recording | `brew install sox` (macOS) or `sudo apt install sox` (Linux) — required for `--record` flag | 2 min |
| 1.3 | Install dev dependencies | `npm install -D typescript tsx @types/node @types/fluent-ffmpeg` | 5 min |
| 1.4 | Create `tsconfig.json` | Target: `ES2022`, Module: `NodeNext`, ModuleResolution: `NodeNext`, Strict mode, `resolveJsonModule: true`, `esModuleInterop: true`, `skipLibCheck: true`. | 10 min |
| 1.5 | Create `.env` file | `ELEVENLABS_API_KEY=sk_...` (from `my-playground-voice/.env`). | 2 min |
| 1.6 | Create `.gitignore` | Ignore `.env`, `node_modules/`, `audio_cache/`, `output/`. | 2 min |
| 1.7 | Create `README.md` | Project description, setup instructions, usage examples. | 10 min |
| 1.8 | Verify setup | Run `npx ts-node --version` to confirm TypeScript execution works. | 3 min |

### Verification

- `npx tsc --noEmit` passes with zero errors.
- `npx tsx src/index.ts --help` displays CLI usage.

### Deliverables

- `package.json`
- `tsconfig.json`
- `.env`
- `.gitignore`
- `README.md`

---

## Milestone 2: Audio Manager & Caching

**Goal:** Implement the TTS synthesizer with MD5-based disk caching and STT transcription capability.

### Tasks

| # | Task | Details | Est. Time |
|---|------|---------|-----------|
| 2.1 | Create `src/types/index.ts` | Define all interfaces: `NewsItem`, `ScriptBlock`, `PodcastScript`, `PodcastOutput`, `VoiceCommand`, `NewsProvider`, `SynthesisResult`. Include constants: `MAX_BLOCK_CHARS = 249`, `CREDITS_PER_CHAR = 0.5`, `ELEVENLABS_VOICE_ID`, `TTS_MODEL`, `STT_MODEL`, `TTS_OUTPUT_FORMAT`, `SEGMENT_SILENCE_SECONDS`. | 15 min |
| 2.2 | Create `src/audioManager.ts` (skeleton) | Class `AudioManager` with constructor accepting `apiKey: string`. Initialize `ElevenLabsClient`. | 10 min |
| 2.3 | Implement `generateCacheKey(text: string)` | Use `crypto.createHash('md5').update(text).digest('hex')`. | 5 min |
| 2.4 | Implement `getCachedAudioPath(cacheKey: string)` | Return `path.join(CACHE_DIR, cacheKey + '.mp3')`. | 3 min |
| 2.5 | Implement `synthesizeSpeech(text: string)` | Validate char limit (<250). Generate cache key. Check cache. If hit, return cached path. If miss, call `client.textToSpeech.convert()` with `eleven_flash_v2_5` and `mp3_44100_128`, stream to buffer, save to cache, return path. | 20 min |
| 2.6 | Implement `transcribeAudio(filePath: string)` | Call `client.speechToText.convert({ modelId: 'scribe_v1', file: createReadStream(filePath) })`. Return `SpeechToTextChunkResponseModel`. | 15 min |
| 2.7 | Implement `streamToBuffer(stream)` | Helper to consume a `ReadableStream<Uint8Array>` into a `Buffer`. | 5 min |
| 2.8 | Implement `stitchAudioSegments(segments: string[])` | Use `fluent-ffmpeg` with `ffmpeg-static` to concatenate MP3 files with 0.5s silence between segments. Output to `output/` directory. Return output path. | 25 min |
| 2.9 | Implement `estimateDuration(filePath: string)` | Use `fluent-ffmpeg` to probe the MP3 file and return duration in seconds. | 10 min |
| 2.10 | Implement `clearCache()` | Delete all files in `audio_cache/`. | 5 min |

### Verification

- Unit test: `generateCacheKey("hello")` produces a deterministic 32-char hex string.
- Unit test: `synthesizeSpeech()` on the same text twice returns the same cached file on the second call.
- Unit test: `transcribeAudio()` on a test WAV file returns recognized text.
- `tsc --noEmit` passes.

### Deliverables

- `src/types/index.ts` (full data contracts)
- `src/audioManager.ts` (complete `AudioManager` class)

---

## Milestone 3: Speech-To-Text Integration

**Goal:** Wrap the `scribe_v1` STT functionality with command parsing for voice-driven topic requests.

### Tasks

| # | Task | Details | Est. Time |
|---|------|---------|-----------|
| 3.1 | Implement `VoiceCommandParser` class | Takes transcribed text from `scribe_v1`. Extracts a topic keyword from a predefined list (`technology`, `sports`, `politics`, `business`, `science`, `entertainment`, `health`). Uses regex matching on the transcript. Located at `src/utils/voiceCommandParser.ts`. | 15 min |
| 3.2 | Implement `parseVoiceCommand(audioPath: string)` | Convenience method: calls `transcribeAudio` then `VoiceCommandParser`. Returns `VoiceCommand`. | 5 min |
| 3.3 | Handle empty/unrecognized topics | If no topic is detected, default to empty string (general news). Log a warning. | 5 min |
| 3.4 | Create sample audio file for testing | Generate a short WAV file using `ffmpeg` for testing the STT pipeline without a real microphone. | 10 min |

### Verification

- `parseVoiceCommand("sample.wav")` correctly extracts the topic from the audio.
- Topic extraction handles partial matches (e.g., "tech news" → "technology").
- Empty/invalid transcripts default to general news.

### Deliverables

- `VoiceCommandParser` class (within `audioManager.ts` or a separate `src/commandParser.ts`)
- Sample test audio file

---

## Milestone 4: End-to-End Execution Pipeline

**Goal:** Build the main orchestration layer that ties news fetching, script building, audio synthesis, and stitching into a complete pipeline.

### Tasks

| # | Task | Details | Est. Time |
|---|------|---------|-----------|
| 4.1 | Implement `MockNewsProvider` | Returns 3 hardcoded `NewsItem` objects with realistic headlines. Organized by topic. | 15 min |
| 4.2 | Implement `ScriptBuilder` class | Takes `NewsItem[]`. Builds `PodcastScript` with Intro, 1-3 News blocks, Outro. Enforces <250 char limit per block with truncation. Calculates `estimatedCredits` and `totalChars`. | 25 min |
| 4.3 | Implement `NewsPodcaster` class (orchestrator) | Main pipeline: `generatePodcast(options)`. Steps: 1) Create `AudioManager`, 2) Fetch news (via `MockNewsProvider`), 3) Build script (via `ScriptBuilder`), 4) Synthesize each block (via `AudioManager`), 5) Stitch segments, 6) Save output, 7) Return `PodcastOutput`. | 25 min |
| 4.4 | Implement `NewsPodcaster.processVoiceRequest()` | Pipeline variant: 1) Transcribe audio (via `AudioManager.transcribeAudio`), 2) Parse voice command (via `VoiceCommandParser`), 3) Fetch news filtered by topic, 4) Generate podcast, 5) Return `PodcastOutput`. | 15 min |
| 4.5 | Implement CLI entry point in `src/index.ts` | Parse command-line arguments: `--topic <topic>`, `--voice <path>`, `--record`/`-r` (live recording), `--clear-cache`, `--help`. Dispatch to the appropriate method on `NewsPodcaster`. | 20 min |
| 4.6 | Add structured logging | Use `console.log` with timestamp prefixes for: `INFO`, `WARNING`, `ERROR`. Log each phase's progress, cache hits/misses, and credit consumption. | 10 min |
| 4.7 | Add error handling | Catch and log ElevenLabs API errors, file system errors, and invalid input. Exit with non-zero code on failure. | 10 min |

### CLI Usage Examples

```bash
# Generate a daily podcast with all news
npx ts-node src/index.ts

# Generate a podcast filtered by topic
npx tsx src/index.ts --topic technology

# Generate a podcast from a voice command
npx tsx src/index.ts --voice audio/sample-command.wav

# Record your voice live from the terminal microphone
npx tsx src/index.ts --record

# Clear the audio cache
npx tsx src/index.ts --clear-cache
```

### Verification

- `npx tsx src/index.ts` generates `output/podcast_{timestamp}.mp3`.
- `npx tsx src/index.ts --topic technology` filters news to technology items.
- `npx tsx src/index.ts --record` records live from the microphone and transcribes via scribe_v1.
- Running the same command twice shows cache hit logging and 0 credits consumed.
- `--clear-cache` removes all files from `audio_cache/`.
- `tsc --noEmit` passes with zero errors.

### Deliverables

- `src/index.ts` (complete CLI + orchestration)
- End-to-end pipeline working
- Sample output podcast file

---

## Milestone 5: Web GUI & Backend API Routes

**Goal:** Transition the CLI PoC into a React web application with an Express HTTP backend, preserving all existing service-layer logic and introducing a browser-native `AudioRecorder` component that replaces the sox-based CLI recorder.

### Tasks

| # | Task | Details | Est. Time |
|---|------|---------|-----------|
| 5.1 | Restructure monorepo layout | Move `src/` → `backend/src/`. Rename `src/index.ts` → `backend/src/cli.ts` (deprecated). Create `frontend/`, `backend/`, and `shared/` directories. Create root workspace `package.json` with `workspaces` field. | 20 min |
| 5.2 | Extract shared types | Move `src/types/index.ts` → `shared/types/index.ts`. Set up Vite path alias (`@shared`) in `frontend/vite.config.ts` and tsconfig path mapping in both frontend and backend. | 10 min |
| 5.3 | Create backend Express server | Create `backend/src/server.ts`. Configure CORS (allow Vite dev server origin), body parser, and multer for multipart uploads. Instantiate `NewsPodcaster` at startup. | 15 min |
| 5.4 | Implement `POST /api/transcribe` endpoint | Accept multipart audio Blob via multer. Save to `temp/`. Call `AudioManager.transcribeAudio()`. Call `VoiceCommandParser.parse()`. Delete temp file. Return `{ transcript, voiceCommand }`. | 20 min |
| 5.5 | Implement `POST /api/generate-podcast` endpoint | Accept JSON `{ topic, source }`. Call `NewsPodcaster.generatePodcast({ topic, source })`. Derive `audioUrl` from `outputPath` filename. Return augmented `PodcastOutput` with `audioUrl`, `estimatedCredits`, `totalChars`. | 15 min |
| 5.6 | Implement `POST /api/cache/clear` endpoint | Call `AudioManager.clearCache()`. Return `{ success, message }`. | 5 min |
| 5.7 | Implement `GET /api/output/:filename` endpoint | Serve MP3 file from `output/` directory. Return 404 if not found. | 10 min |
| 5.8 | Create frontend React app scaffolding | `npm create vite@latest frontend -- --template react-ts`. Install Tailwind CSS. Configure tsconfig and vite aliases for `@shared`. | 15 min |
| 5.9 | Implement `AudioRecorder` component | Use browser `MediaRecorder` API. Request `getUserMedia` microphone permission. Capture `audio/webm;codec=opus` Blobs. Emit `onRecordingComplete(blob)` callback. Show recording timer. | 30 min |
| 5.10 | Implement `TopicInput` component | Dropdown/autocomplete listing 7 topics + "General News". Emit `onTopicChange(topic)` callback. Default to empty string. | 15 min |
| 5.11 | Implement `StatusTracker` component | Display live pipeline status with 5 states: `Recording → Transcribing → Fetching News → Synthesizing → Ready`. Each state has an icon and label. Accept `status` prop and update via parent state. | 20 min |
| 5.12 | Implement `PodcastPlayer` component | HTML5 `<audio>` element with native controls. Accept `audioUrl` prop. Display episode metadata (duration, credits, cache stats) received from `PodcastOutput`. | 15 min |
| 5.13 | Implement `App` component + API client | Orchestrate: TopicInput → AudioRecorder → StatusTracker → PodcastPlayer. Create `frontend/src/services/api.ts` with `transcribeAudio()`, `generatePodcast()`, `clearCache()` functions. Manage state transitions for StatusTracker. | 30 min |
| 5.14 | Add backend `recorder.ts` isolation guard | Verify `recorder.ts` is never imported into frontend. Add a comment at the top of `backend/src/utils/recorder.ts` documenting it is backend-only. Add an import-boundary check to the verification checklist. | 5 min |
| 5.15 | Add "Clear Cache" button to web UI | Wire up to `POST /api/cache/clear`. Show success/failure toast. | 10 min |

### Verification

- `npx tsc --noEmit` passes in both `frontend/` and `backend/` with zero errors.
- `npm run dev:server` starts the Express server on port 4000; `curl http://localhost:4000/api/cache/clear` returns `{ success: true }`.
- `npm run dev` starts the Vite dev server on port 5173; the React app loads in the browser.
- `POST /api/generate-podcast` with `{ "topic": "technology", "source": "text" }` returns a `PodcastOutput` with `audioUrl` and `GET /api/output/{filename}` serves the MP3.
- Clicking "Record" in `AudioRecorder` requests microphone permission, records audio, and sends it to `POST /api/transcribe` which returns a recognized topic.
- `StatusTracker` shows the full state sequence (`Recording → Transcribing → Fetching News → Synthesizing → Ready`) during a voice-driven generation.
- `PodcastPlayer` plays the generated MP3 in-browser.
- `grep -r "recorder" frontend/src/` returns zero matches (recorder.ts is backend-only).
- The deprecated CLI (`npx tsx src/cli.ts --topic technology`) still works and produces identical output.
- Running the same topic twice on the web shows cache hits and 0 credits consumed.

### Deliverables

- `backend/` — Express server with 4 HTTP endpoints (`/api/transcribe`, `/api/generate-podcast`, `/api/cache/clear`, `/api/output/:filename`)
- `backend/src/server.ts` — HTTP server entry point
- `backend/src/cli.ts` — Deprecated CLI entry point (archived)
- `frontend/` — React + Vite + TypeScript + Tailwind CSS web application
- `frontend/src/components/` — `AudioRecorder`, `TopicInput`, `StatusTracker`, `PodcastPlayer`
- `frontend/src/services/api.ts` — API client
- `frontend/src/App.tsx` — Root component with state management
- `shared/types/index.ts` — Canonical data contracts shared between frontend and backend
- `HISTORY.md` — Project evolution documentation

---

## Milestone 6: WebSocket Real-Time Streaming + History Log

### Tasks

| # | Task | Details | Est. Time |
|---|------|---------|-----------|
| 6.1 | Install WebSocket dependencies | Add `ws@^8.x` and `@types/ws` to backend `package.json`. | 5 min |
| 6.2 | Create podcastWebSocketOrchestrator | `backend/src/services/podcastWebSocketOrchestrator.ts`: reusable pipeline that calls `AudioManager`, `ScriptBuilder`, `MockNewsProvider`, and `VoiceCommandParser` individually with progress callbacks between each step (instead of `NewsPodcaster.generatePodcast()` which has no hooks). Emits WebSocket messages at every stage. | 45 min |
| 6.3 | Create WebSocket server adapter | `backend/src/websocket.ts`: `attachWebSocket(httpServer, audioManager)` function that creates a `ws.WebSocketServer` on the same HTTP server. Spawns a fresh orchestrator per connection. Routes by `msg.type`. | 20 min |
| 6.4 | Integrate WebSocket into server | `backend/src/server.ts`: replace `app.listen` with `createServer(app)` + `attachWebSocket`. **All 4 REST endpoints remain byte-for-byte unchanged.** | 10 min |
| 6.5 | Define WebSocket protocol types | `frontend/src/types/websocket.ts`: 11 server→client message types (`status`, `log`, `news`, `script`, `synthesizing`, `cache_hit`, `synthesis_complete`, `stitching`, `transcription`, `ready`, `error`) + 3 client→server types (`generate`, `transcribe`, `cancel`). | 15 min |
| 6.6 | Create WebSocket client | `frontend/src/services/websocketClient.ts`: browser WebSocket wrapper with multi-handler dispatch, JSON serialization, and auto-reconnect (exponential backoff: 1s→2s→4s→8s→8s, max 5 attempts). | 30 min |
| 6.7 | Create mode toggle + log panel | `WebSocketModeToggle.tsx` (REST/WS toggle) and `StreamingLogs.tsx` (collapsible log panel with level-based coloring). | 20 min |
| 6.8 | Implement App.tsx integration | Add `commMode` state (`"rest" | "websocket"`). Wire up type-narrowed handlers for all 11 server message types. Maintain full discriminated union narrowing. | 40 min |
| 6.9 | Create NewsPanel component | `frontend/src/components/NewsPanel.tsx`: card-style article display (headlines, summaries, sources, timestamps). Shows in **both** modes — reads from REST response (`data.newsArticles`) or WebSocket `news` message. Add `newsArticles` to `PodcastOutput` type. | 30 min |
| 6.10 | Create HistoryService + SQLite | `backend/src/services/historyService.ts`: `better-sqlite3` wrapper storing all generations in `backend/data/history.db`. Schema: `id, timestamp, pipeline_type, feature_type, input_data, generated_response, audio_file_path`. Called at end of every successful pipeline (REST + WS). | 60 min |
| 6.11 | Implement GET /api/history endpoint | `server.ts`: returns latest history entries (newest first) as JSON. Optional `limit` query param (default 50). | 20 min |
| 6.12 | Create HistorySection frontend | `frontend/src/components/HistorySection.tsx`: full-page view with expandable accordion cards (no modals). Header shows topic, timestamp, badges. Expanded view shows input vs. generated news response + embedded `<audio>` player. | 60 min |
| 6.13 | Add History navigation button | Persistent button in top-right corner of UI to toggle/route to History section. | 15 min |

### Verification

- `npx tsc --noEmit` passes in both `frontend/` and `backend/` with zero errors.
- WebSocket mode: toggle to WS, generate a podcast, verify live status streaming updates the `StatusTracker` in real time (fetching_news → building_script → synthesizing → stitching → ready).
- REST mode unchanged: all 4 REST endpoints behave identically to before (verified by diff).
- NewsPanel renders articles in both REST and WebSocket modes.
- `GET /api/history` returns JSON array of past generations with all schema fields.
- HistorySection renders expandable cards with embedded audio players.
- `grep -r "recorder" frontend/src/` returns zero matches (recorder.ts is backend-only).
- No ElevenLabs API calls consumed during development (tsc-only verification).

### Deliverables

- `backend/src/websocket.ts` — WebSocket server adapter
- `backend/src/services/podcastWebSocketOrchestrator.ts` — WS pipeline orchestrator
- `backend/src/services/historyService.ts` — SQLite history database service
- `backend/src/server.ts` — Express + WebSocket integration (REST endpoints unchanged)
- `backend/src/types/index.ts` — extended `PodcastOutput` with `newsArticles`
- `frontend/src/types/websocket.ts` — WebSocket protocol message types
- `frontend/src/services/websocketClient.ts` — browser WS client with auto-reconnect
- `frontend/src/components/NewsPanel.tsx` — news article display
- `frontend/src/components/WebSocketModeToggle.tsx` — REST/WS mode selector
- `frontend/src/components/StreamingLogs.tsx` — collapsible log panel
- `frontend/src/components/HistorySection.tsx` — history accordion cards with audio
- `frontend/src/App.tsx` — REST + WS mode integration + history navigation
- `frontend/src/types/index.ts` — extended types for news articles and history
- `frontend/src/components/StatusTracker.tsx` — added building_script/stitching steps
- `backend/data/` — SQLite database directory
- `docs/WEBSOCKET.md` — WebSocket protocol documentation

---

## Execution Sequence

```
Milestone 1: Environment Setup
  │
  ├── 1.1 package.json
  ├── 1.2-1.3 Dependencies installed
  ├── 1.4 tsconfig.json
  ├── 1.5 .env
  ├── 1.6 .gitignore
  ├── 1.7 README.md
  └── 1.8 Verify: tsc --noEmit passes
  │
  ▼
Milestone 2: Audio Manager & Caching
  │
  ├── 2.1 types.ts (data contracts)
  ├── 2.2-2.5 AudioManager class (TTS + MD5 cache)
  ├── 2.6 STT transcription (scribe_v1)
  ├── 2.8 Audio stitching (ffmpeg concat)
  └── 2.9-2.10 Duration estimation + cache clear
  │
  ▼
Milestone 3: Speech-To-Text Integration
  │
  ├── 3.1 VoiceCommandParser
  ├── 3.2-3.3 parseVoiceCommand + topic extraction
  └── 3.4 Test audio sample
  │
  ▼
Milestone 4: End-to-End Pipeline
  │
  ├── 4.1 MockNewsProvider
  ├── 4.2 ScriptBuilder
  ├── 4.3-4.4 NewsPodcaster (orchestrator)
  ├── 4.5 CLI entry point
  ├── 4.6-4.7 Logging + error handling
  └── E2E verification: npx tsx src/index.ts
  │
  ▼
Milestone 5: Web GUI & Backend API Routes
  │
  ├── 5.1 Monorepo restructure (backend/ + frontend/ + shared/)
  ├── 5.2 Shared types extraction (@shared alias)
  ├── 5.3 Express server scaffold (CORS + multer)
  ├── 5.4 POST /api/transcribe (STT + voice command parsing)
  ├── 5.5 POST /api/generate-podcast (full pipeline via API)
  ├── 5.6 POST /api/cache/clear
  ├── 5.7 GET /api/output/:filename (MP3 serving)
  ├── 5.8 Frontend React + Vite + Tailwind scaffolding
  ├── 5.9 AudioRecorder component (MediaRecorder API)
  ├── 5.10 TopicInput component
  ├── 5.11 StatusTracker component
  ├── 5.12 PodcastPlayer component
  ├── 5.13 App component + API client
  ├── 5.14 recorder.ts backend-only isolation guard
  ├── 5.15 Clear Cache button in web UI
   └── Verification: Web app end-to-end with voice recording + playback

    ▼
Milestone 6: WebSocket Real-Time Streaming + History Log
   │
   ├── 6.1 ws + @types/ws dependencies installed
   ├── 6.2 podcastWebSocketOrchestrator.ts (pipeline orchestration with progress callbacks)
   ├── 6.3 websocket.ts (attachWebSocket adapter on Express HTTP server)
   ├── 6.4 server.ts integration (createServer + attachWebSocket; REST endpoints unchanged)
   ├── 6.5 WebSocket message protocol types (11 server→client, 3 client→server)
   ├── 6.6 websocketClient.ts (browser WS client with auto-reconnect)
   ├── 6.7 WebSocketModeToggle + StreamingLogs frontend components
   ├── 6.8 App.tsx integration (commMode state, type-narrowed handlers)
   ├── 6.9 NewsPanel component (article display for both REST + WS modes)
   ├── 6.10 HistoryService + SQLite database (backend/data/history.db)
   ├── 6.11 GET /api/history endpoint (retrieve past generations)
   ├── 6.12 HistorySection frontend component (expandable accordion cards + embedded audio)
   ├── 6.13 History navigation button (persistent top-right corner)
   └── Verification: tsc --noEmit passes (backend + frontend), no REST endpoints changed
```

---

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ElevenLabs API rate limits | Medium | High | Cache aggressively; each unique text is synthesized only once. |
| ffmpeg not found on system | Low | High | Use `ffmpeg-static` which bundles the binary. |
| sox not found on system | Low | Medium | Required for `--record` flag (CLI legacy). Install via `brew install sox` (macOS) or `sudo apt install sox` (Linux). The web app does not require sox. |
| No audio input device | Low | Medium | The `--record` flow performs a pre-flight check and provides actionable error if no microphone is detected. The web app checks `MediaRecorder.isTypeSupported`. |
| STT transcription accuracy | Medium | Medium | Use `scribe_v1` (highest accuracy); provide topic selection as fallback. |
| Audio stitching artifacts | Low | Medium | Use 0.5s silence between segments to mask transitions. |
| Cache directory permissions | Low | Low | Create directory with `mkdirSync({ recursive: true })`. |
| TypeScript strict mode errors | Medium | Low | Use `skipLibCheck: true` and explicit type annotations everywhere. |
| **CORS misconfiguration** | Medium | High | Configure CORS middleware to allow only the Vite dev server origin (`http://localhost:5173`) in development; same-origin in production. |
| **Browser microphone permissions denied** | Medium | Medium | The `AudioRecorder` component handles `NotAllowedError` and `NotFoundError` with user-facing error messages. |
| **MediaRecorder API unsupported in older browsers** | Low | Medium | Add a browser-compatibility check; gracefully degrade with a link to use the CLI `--voice` flag instead. |
| **Audio upload size exceeds server limits** | Low | Medium | Set `multer` limits (`limits: { fileSize: 10 * 1024 * 1024 }` for 10MB max). Recordings are short (<30 seconds). |
| **API key accidentally exposed in frontend bundle** | High | Critical | The API key is loaded from `.env` only in `backend/src/config/env.ts`. A grep check verifies no `@elevenlabs/elevenlabs-js` import exists in `frontend/src/`. |
| **recorder.ts accidentally imported into frontend** | High | Critical | The `recorder.ts` module imports `node-record-lpcm16-ts` which breaks browser builds. Verification includes `grep -r "recorder" frontend/src/` which must return zero matches. |

---

## Testing Strategy

Since this is a PoC, testing will be lightweight:

1. **Compile-time verification:** `npx tsc --noEmit` with `strict: true` in both `frontend/` and `backend/`.
2. **Cache determinism test:** Run `synthesizeSpeech("test")` twice, verify the second call returns the cached file (0 credits).
3. **Character limit test:** Pass a 300-character string to `ScriptBuilder`, verify it is truncated to <250 chars.
4. **End-to-end CLI smoke test:** Run `npx ts-node src/index.ts` and verify an MP3 file is produced in `output/`.
5. **STT smoke test:** Run `npx tsx src/index.ts --voice sample.wav` and verify topic extraction.
6. **Live recording smoke test:** Run `npx tsx src/index.ts --record`, speak a topic, press ENTER, and verify transcription + podcast generation. (Requires sox and a connected microphone.)
7. **API endpoint test:** `curl -X POST http://localhost:4000/api/generate-podcast -H "Content-Type: application/json" -d '{"topic":"technology","source":"text"}'` and verify a `PodcastOutput` JSON response with `audioUrl`.
8. **Frontend smoke test:** Start `npm run dev`, open browser to `http://localhost:5173`, verify all four components render and the "Generate" flow produces playable audio.
9. **Import boundary test:** `grep -r "recorder" frontend/src/` returns zero matches, confirming `recorder.ts` is not imported into the frontend.
10. **Cache cross-compatibility test:** Run `npx tsx src/cli.ts --topic technology` (CLI), then generate the same topic via the web UI; verify cache hits on the second run (0 credits).

---

## Next Steps (Post-Web)

- [x] **Milestone 6: WebSocket Real-Time Streaming + History Log** — COMPLETE. WebSocket mode with live progress streaming, embedded news article display panel, and persistent history log with SQLite storage.
- Replace `MockNewsProvider` with a real RSS feed or NewsAPI integration.
- Add configurable voice selection (allow users to pick from available ElevenLabs voices via the web UI).
- Add unit tests with Jest / Vitest for both frontend and backend.
- Add a `--verbose` flag for debug-level logging.
- Replace mock STT with real audio file upload in the browser (file input fallback for `--voice`).
- Add a download button for the generated MP3 in the `PodcastPlayer` component.
- Containerize the backend with Docker for deployment.

---

 *End of document (v3.0)*