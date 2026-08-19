# Project History

## Automated Daily News Podcaster — Evolution from CLI to Web Application

**Document Version:** 1.0  
**Date:** 2026-08-16  
**Author:** Senior Software Architect  
**Related:** [SDD.md](./SDD.md) (v3.0), [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) (v3.0)  

---

## Timeline

| Date | Phase | Milestone | Key Outcome |
|------|-------|-----------|-------------|
| 2026-08-10 | CLI Era | Project Initialization | Initial project structure created (`package.json`, `tsconfig.json`, `.env`). |
| 2026-08-12 | CLI Era | SDD v1.0 & Development Plan v1.0 | Documentation frozen at CLI architecture. |
| 2026-08-13 | CLI Era | Core Functionality Complete | AudioManager, ScriptBuilder, MockNewsProvider, VoiceCommandParser, CLI pipeline. |
| 2026-08-16 | Transition | CLI → Web App | Architecture transition: React frontend + Express backend. CLI preserved as deprecated legacy. SDD & Development Plan updated to v2.0. |
| 2026-08-16 | Web App | WebSocket Real-Time Streaming + History Log | Added WebSocket mode with live progress streaming, embedded news article display panel, and persistent history log with SQLite storage. |

---

## 1. Origin (CLI Era)

The Automated Daily News Podcaster began as a **Command-Line Interface (CLI) tool** written in TypeScript, executed via `npx tsx src/index.ts`. The original vision was simple: take daily news headlines, format them into a radio-style script, and synthesize the script into speech using ElevenLabs' TTS API — all from the terminal.

### 1.1 Motivation

The project was initiated as a **Proof of Concept (PoC)** to validate:

1. The cost-efficiency of ElevenLabs' `eleven_flash_v2_5` TTS model (0.5 credits/char — the cheapest available).
2. The accuracy of `scribe_v1` STT for voice-driven topic requests.
3. The effectiveness of an MD5-based local disk caching strategy for eliminating redundant API calls.
4. A clean three-layer architecture separating command capture, content curation, and audio processing.

### 1.2 Initial Implementation

The project was bootstrapped with `npm init -y`, configured for ESM (`"type": "module"`) with NodeNext module resolution and strict TypeScript. All dependencies were installed in a single monorepo root: `@elevenlabs/elevenlabs-js`, `dotenv`, `ffmpeg-static`, `fluent-ffmpeg`, and `tsx` for runtime execution.

---

## 2. CLI Architecture

The original CLI architecture was organized into **three layers** with unidirectional data flow:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Command Layer (STT)                         │
│                                                                 │
│  VoiceCommandRequest  ──►  SpeechToText.convert(scribe_v1)      │
│                          ▼                                      │
│                    Transcribed Text  ──┐                        │
│                                         │                        │
│  TextCommandRequest ───────────────────┘                        │
│                                         │                        │
├─────────────────────────────────────────┼────────────────────────┤
│              Curation Layer             │                        │
│              (Script Orchestration)     │                        │
│                                         ▼                        │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐       │
│  │ NewsProvider │──► ScriptBuilder │──► PodcastScript    │       │
│  │ (fetch news)  │  │ (intro,     │  │ (structured       │       │
│  │              │  │  items,      │  │  blocks, each    │       │
│  │              │  │  outro)      │  │  <250 chars)     │       │
│  └─────────────┘  └──────────────┘  └──────────────────┘       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│              Audio & Cache Layer                                │
│              (TTS + Caching + Stitching)                        │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐      │
│  │ Text Block    │──►│ Cache Layer  │──►│ TTS Synthesizer│      │
│  │ (<250 chars)  │   │ MD5 Hash Key │   │ eleven_flash_v2_5 │   │
│  │              │   │ Disk Cache   │   │ 0.5 credits/char │      │
│  └──────────────┘   └──────────────┘   └────────────────┘      │
│                                           │                      │
│                                           ▼                      │
│                              ┌──────────────────┐              │
│                              │ Audio Stitcher    │              │
│                              │ (ffmpeg concat +   │              │
│                              │  inter-segment     │              │
│                              │  silence)          │              │
│                              └──────────────────┘              │
│                                           │                      │
│                                           ▼                      │
│                              ┌──────────────────┐              │
│                              │  MP3 File Output  │              │
│                              └──────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Command Layer

- **`index.ts`** — CLI entry point. Parsed arguments (`--topic`, `--voice`, `--clear-cache`, `--help`) and dispatched to `NewsPodcaster`.
- **`voiceCommandParser.ts`** — Extracted a topic keyword from the transcribed text using prefix matching (e.g., "tech" → "technology").

### 2.2 Curation Layer

- **`newsPodcaster.ts`** — The pipeline orchestrator. Called `MockNewsProvider.fetchNews()`, `ScriptBuilder.buildScript()`, `AudioManager.synthesizeSpeech()` (per block), and `AudioManager.stitchSegments()`.
- **`scriptBuilder.ts`** — Built a `PodcastScript` with Intro → 1–3 News Items → Outro. Enforced the `< 250 chars per block` invariant via `truncateBlock()`.
- **`MockNewsProvider.ts`** — Generated 24 realistic fake news items across 7 topics, shuffled and sliced to 3 per request.

### 2.3 Audio & Cache Layer

- **`audioManager.ts`** — Single class managing all ElevenLabs interactions:
  - `synthesizeSpeech()` — MD5 cache check → TTS API call → save to disk.
  - `transcribeAudio()` — `scribe_v1` STT from a file path.
  - `stitchSegments()` — ffmpeg concat demuxer with 0.5s silence between segments.
  - `clearCache()` — Remove all files from `audio_cache/`.
- **`audio_cache/`** — MD5-keyed MP3 cache. Identical text always maps to the same hash and filename.
- **`output/`** — Generated podcast MP3 files (`podcast_{timestamp}.mp3`).

### 2.4 CLI File Structure (Original)

```
elevenlabs-POC/
├── docs/
│   ├── SDD.md
│   └── DEVELOPMENT_PLAN.md
├── src/
│   ├── audioManager.ts
│   ├── config/
│   │   └── env.ts
│   ├── core/
│   │   ├── newsPodcaster.ts
│   │   └── scriptBuilder.ts
│   ├── mocks/
│   │   └── MockNewsProvider.ts
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   ├── functions.ts
│   │   └── voiceCommandParser.ts
│   └── index.ts
├── audio_cache/
├── output/
├── temp/
├── .env
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## 3. CLI Features

The CLI was invoked via `npx tsx src/index.ts` with the following flags:

| Flag | Description | Implementation |
|------|-------------|----------------|
| `--topic <topic>` | Filter news by topic keyword (e.g., `technology`, `sports`, `politics`, `business`, `science`, `entertainment`, `health`). | Parsed in `index.ts`, passed to `NewsPodcaster.generatePodcast({ topic })`. |
| `--voice <path>` | Transcribe a pre-recorded audio file, extract the topic from the transcript, and generate a podcast for that topic. | `AudioManager.transcribeAudio()` → `VoiceCommandParser.parse()` → `NewsPodcaster.generatePodcast({ topic, source: "voice" })`. |
| `--clear-cache` | Delete all files from `audio_cache/`. | `AudioManager.clearCache()`. |
| `--help`, `-h` | Display usage information. | Static help text in `index.ts`. |

### 3.1 CLI Usage Examples

```bash
# Generate a daily podcast with all news
npx tsx src/index.ts

# Generate a podcast filtered by topic
npx tsx src/index.ts --topic technology

# Generate a podcast from a pre-recorded voice command
npx tsx src/index.ts --voice audio/sample-command.wav

# Clear the audio cache
npx tsx src/index.ts --clear-cache
```

---

## 4. Evolution Drivers

The transition from CLI to a React Web Application was driven by four key factors:

### 4.1 Better User Experience

The CLI required users to:
- Install Node.js, sox, and the ElevenLabs CLI tool.
- Interact with a terminal interface using flags and ENTER keypresses.
- Navigate the file system to find generated MP3 files.

A web application replaces this with an intuitive, visual interface: a topic dropdown, a real-time status tracker, and an in-browser audio player — all accessible from a single URL.

### 4.2 Visual Feedback

The CLI provided only text-based log output (`[INFO]`, `[WARNING]`, `[ERROR]`). The web app's `StatusTracker` component provides **real-time visual feedback** with a clear state machine: `Transcribing → Fetching News → Synthesizing → Ready`. Users can see exactly where the pipeline is at every moment.

### 4.3 Accessibility

*-*

### 4.4 Sharing and Portability

MP3 files generated by the CLI were written to a local `output/` directory, requiring manual file transfer to share. The web app serves the generated MP3 directly through an HTTP endpoint, allowing in-browser playback and easy bookmarking of episodes.

---

## 5. Transition Architecture

The architecture evolved from a **three-layer CLI** to a **five-layer client/server** design:

### 5.1 New Layers

| New Layer | Responsibility | Key Components |
|-----------|----------------|----------------|
| **Presentation Layer (React)** | Browser-based UI for interaction | `TopicInput`, `StatusTracker`, `PodcastPlayer`, `App` |
| **API Server Layer (Express)** | HTTP request/response bridge | `/api/transcribe`, `/api/generate-podcast`, `/api/cache/clear`, `GET /api/output/:filename` |
| **Service Layer (Existing)** | Business logic — unchanged | `NewsPodcaster`, `ScriptBuilder`, `NewsProvider`, `VoiceCommandParser` |
| **Audio & Cache Layer** | TTS/STT + cache + stitching — unchanged | `AudioManager`, `audio_cache/`, `output/` |
| **CLI Legacy Layer** | Deprecated, archived | `cli.ts` |

### 5.2 Data Flow (Web Request Cycle)

```
Browser                Express Backend                 ElevenLabs APIs
   │                        │                              │
   │── POST /api/transcribe ──► audio Blob                │
   │◄── { transcript,        │                              │
   │    voiceCommand }       │── scribe_v1 STT ─────────►  │
   │                        │◄── text                      │
   │                        │                              │
   │── POST /api/generate   ──► { topic, source }          │
   │                        │── NewsProvider.fetchNews()   │
   │                        │── ScriptBuilder.buildScript()│
   │                        │── AudioManager.synthesize()  │
   │                        │    ── Cache check / Miss ──► │
   │                        │◄─── mp3 data (or cache hit)  │
   │                        │── AudioManager.stitch()      │
   │◄── { outputPath,        │                              │
   │    audioUrl, ... }      │                              │
   │                        │                              │
   │── GET /api/output/:fn ──► serve MP3                    │
   │◄── binary MP3 data      │                              │
```

### 5.3 Architectural Decisions

1. **Shared types:** Data contracts (`NewsItem`, `ScriptBlock`, `PodcastScript`, `PodcastOutput`, `VoiceCommand`, etc.) were extracted to a `shared/types/` directory, imported by both frontend and backend via Vite path aliases.

2. **Express server:** A new Express server (`backend/src/server.ts`) was added to host the HTTP endpoints. It instantiates `NewsPodcaster` once at startup and delegates all requests to it.

3. **CLI archival:** The original `src/index.ts` was renamed to `backend/src/cli.ts` and marked as deprecated. It remains fully functional but is no longer the primary entry point.

---

## 6. Preserved Components

The following modules were reused **unchanged** from the CLI PoC in the backend server:

| Component | Location (CLI) | Location (Web) | Status |
|-----------|----------------|----------------|--------|
| `AudioManager` | `src/audioManager.ts` | `backend/src/audioManager.ts` | Unchanged |
| `NewsPodcaster` | `src/core/newsPodcaster.ts` | `backend/src/core/newsPodcaster.ts` | Unchanged |
| `ScriptBuilder` | `src/core/scriptBuilder.ts` | `backend/src/core/scriptBuilder.ts` | Unchanged |
| `MockNewsProvider` | `src/mocks/MockNewsProvider.ts` | `backend/src/mocks/MockNewsProvider.ts` | Unchanged |
| `VoiceCommandParser` | `src/utils/voiceCommandParser.ts` | `backend/src/utils/voiceCommandParser.ts` | Unchanged |
| `NewsItem`, `ScriptBlock`, etc. | `src/types/index.ts` | `shared/types/index.ts` | Extracted, otherwise unchanged |
| MD5 caching strategy | `audio_cache/{hash}.mp3` | `audio_cache/{hash}.mp3` | Unchanged |
| Credit model | 0.5 credits/char (flash_v2_5) | 0.5 credits/char (flash_v2_5) | Unchanged |
| ffmpeg stitching | `fluent-ffmpeg` + `ffmpeg-static` | `fluent-ffmpeg` + `ffmpeg-static` | Unchanged |
| STT model | `scribe_v1` | `scribe_v1` | Unchanged |
| TTS voice | `JBFqnCBsd6RMkjVDRZzb` ("George") | `JBFqnCBsd6RMkjVDRZzb` ("George") | Unchanged |

### 6.1 What Was NOT Changed

- The `AudioManager` class — its `synthesizeSpeech()`, `transcribeAudio()`, `stitchSegments()`, and `clearCache()` methods are identical.
- The `NewsPodcaster` class — its `generatePodcast()` and `processVoiceRequest()` methods are identical.
- The `ScriptBuilder` class — its `buildScript()` and `truncateBlock()` methods are identical.
- The `MockNewsProvider` — all 24 mock news items across 7 topics.
- The `VoiceCommandParser` — same prefix-matching keyword extraction logic.
- The character limit invariant (`< 250 chars per block`).
- The credit calculation (`totalChars × 0.5`).
- The cache key generation (`md5(text)`).

### 6.2 What Was Added

- **Frontend:** React + Vite app with `AudioRecorder`, `TopicInput`, `StatusTracker`, `PodcastPlayer`, `App`, and an API client (`services/api.ts`).
- **Express server:** `backend/src/server.ts` with HTTP endpoint handlers.
- **API contracts:** HTTP request/response schemas for `/api/transcribe`, `/api/generate-podcast`, `/api/cache/clear`, and `GET /api/output/:filename`.
- **Shared types:** `shared/types/index.ts` imported by both frontend and backend.

---

## 7. Legacy Artifacts

The following CLI-era artifacts were preserved as deprecated, archived components:

### 7.1 CLI Entry Point

- **Original path:** `src/index.ts`
- **New path:** `backend/src/cli.ts`
- **Status:** Deprecated. Still functional via `npx tsx src/cli.ts` but no new features will be added.

### 7.3 Original File Structure

The original flat `src/` structure was reorganized into:

| Original | New Location |
|----------|-------------|
| `src/index.ts` | `backend/src/cli.ts` (deprecated) |
| `src/audioManager.ts` | `backend/src/audioManager.ts` |
| `src/core/` | `backend/src/core/` |
| `src/mocks/` | `backend/src/mocks/` |
| `src/types/index.ts` | `shared/types/index.ts` |
| `src/utils/` | `backend/src/utils/` |
| `src/config/env.ts` | `backend/src/config/env.ts` |
| — | `frontend/src/` (new) |
| — | `backend/src/server.ts` (new) |
| — | `backend/src/cli.ts` (new, from `src/index.ts`) |
| — | Root `package.json` upgraded to workspace manifest |

### 7.4 CLI Features Deprecated

| CLI Flag | Web Equivalent | Notes |
|----------|---------------|-------|
| `--topic <topic>` | `TopicInput` component (dropdown) | All 7 topics available in the dropdown. |
| `--voice <path>` | `AudioRecorder` component | Browser recording replaces file input. For file-based transcription, a future file-upload feature could be added. |
| `--clear-cache` | "Clear Cache" button in web UI | Calls `POST /api/cache/clear`. |
| `--help` | N/A | Web UI is self-documenting via on-screen instructions. |

---

## 8. Version History

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0 | 2026-08-12 | Senior Software Architect | Initial SDD documenting CLI architecture. |
| 1.0 | 2026-08-12 | Senior Software Architect | Initial Development Plan documenting 4 CLI milestones. |
| 2.0 | 2026-08-16 | Senior Software Architect | SDD rewritten for React + Express web architecture. Development Plan extended with Milestone 5 (Web GUI). This HISTORY document created. |
| 3.0 | 2026-08-17 | Senior Software Architect | SDD & HISTORY updated: added WebSocket real-time streaming mode, embedded news article display panel, and persistent history log with SQLite database + GET /api/history endpoint. |

---

 *End of document (v2.0)*