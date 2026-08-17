# Software Design Document (SDD)

## Automated Daily News Podcaster — Web Application

**Document Version:** 3.0  
**Date:** 2026-08-16  
**Author:** Senior Software Architect  
**Language:** English  

---

## 1. Overview & Use Cases

### 1.1 Purpose

The **Automated Daily News Podcaster** is a TypeScript-based web application that transforms daily news headlines into a radio-style audio podcast. A React frontend provides an interactive interface for users to generate podcasts by topic — either by typing a topic keyword or by recording a voice command in the browser. An Express HTTP server on the backend handles all ElevenLabs API interactions, audio synthesis, transcription, and local disk caching.

The application is designed as a **Proof of Concept (PoC)** with the following primary objectives:

- Demonstrate a clean client/server architecture that separates the browser UI from Node.js audio processing.
- Validate ElevenLabs' `eleven_flash_v2_5` TTS model (0.5 credits/char) for cost-efficient audio synthesis.
- Demonstrate `scribe_v1` STT for voice-driven topic requests captured via the browser's MediaRecorder API.
- Prove an MD5-based local disk caching strategy that eliminates redundant API calls across both CLI and web usage.
- Preserve the original CLI as a deprecated, archived artifact.

### 1.2 Use Cases

| # | Use Case | Description |
|---|----------|-------------|
| UC-01 | **Daily Automated Podcast Generation** | A user opens the web app, selects or types a topic (or leaves it blank for general news), and clicks "Generate." The system fetches the top 3 news headlines, builds a radio-style script (Intro → 3 News Items → Outro), synthesizes each section into speech via `eleven_flash_v2_5`, stitches the segments together with inter-segment silence, and makes the resulting MP3 playable in the browser via the `PodcastPlayer` component. |
| UC-02 | **Voice-Requested Topic Filtering** | A user clicks "Record" in the `AudioRecorder` component, speaks a topic (e.g., "Give me technology news today"), and stops the recording. The browser captures the audio via the MediaRecorder API. The audio blob is sent to the backend's `/api/transcribe` endpoint, which transcribes it via `scribe_v1`, extracts the topic keyword using `VoiceCommandParser`, and returns the parsed `VoiceCommand`. The frontend then calls `/api/generate-podcast` with the extracted topic to produce a targeted podcast. |
| UC-03 | **Cached Audio Reuse** | When the same text block (e.g., a recurring intro) is requested across multiple runs or sessions, the system serves the audio from local disk cache (`audio_cache/`), consuming zero API credits. Cache entries are keyed by the MD5 hash of the input text, shared between CLI and web invocations. |
| UC-04 | **Live Microphone Recording (Browser)** | The `AudioRecorder` component uses the browser's native `MediaRecorder` API to capture voice input directly from the user's microphone. Unlike the CLI's `--record` flag (which uses `node-record-lpcm16-ts` with a sox backend), the web version requires no system-level audio dependencies — only browser microphone permissions. The recording stops when the user clicks "Stop," and the resulting audio Blob is sent to the backend for transcription. |

---

## 2. Web Client/Server Architecture

The system is organized into five layers with clear separation of concerns. Data flows through a request/response cycle orchestrated by the API server.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PRESENTATION LAYER                                 │
│                              (React + Vite)                                   │
│                                                                             │
│  User interacts via browser:                                                 │
│    • AudioRecorder  → MediaRecorder API → audio Blob                         │
│    • TopicInput     → selects topic keyword or "all news"                    │
│    • StatusTracker  → shows live pipeline progress                           │
│      (Recording → Transcribing → Fetching News → Synthesizing → Ready)     │
│    • PodcastPlayer  → plays generated MP3 in-browser                         │
│                                                                             │
│  HTTP requests to Express API server:                                        │
│    POST /api/transcribe      multipart/form-data (audio blob)                │
│    POST /api/generate-podcast  JSON { topic, source }                        │
│    POST /api/cache/clear       (no body)                                      │
│    GET /api/output/:filename   serve MP3 for playback                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                           API SERVER LAYER                                   │
│                           (Express HTTP Server)                              │
│                                                                             │
│  POST /api/transcribe                                                         │
│    1. Receive audio Blob (multipart)                                          │
│    2. Save to temp file                                                       │
│    3. AudioManager.transcribeAudio() → scribe_v1                              │
│    4. VoiceCommandParser.parse() → extract topic                             │
│    5. Return { transcript, voiceCommand }                                    │
│                                                                             │
│  POST /api/generate-podcast                                                   │
│    1. NewsPodcaster.generatePodcast({ topic, source })                       │
│       a. NewsProvider.fetchNews(topic) → NewsItem[]                          │
│       b. ScriptBuilder.buildScript() → PodcastScript                         │
│       c. AudioManager.synthesizeSpeech() per block (with MD5 cache)          │
│       d. AudioManager.stitchSegments() → final MP3                          │
│    2. Return PodcastOutput + audio URL                                       │
│                                                                             │
│  POST /api/cache/clear                                                        │
│    1. AudioManager.clearCache()                                              │
│    2. Return { success, message }                                            │
│                                                                             │
│  GET /api/output/:filename                                                    │
│    1. Serve MP3 file from output/ for browser playback                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                           SERVICE LAYER                                      │
│                        (Existing logic, unchanged, reused)                   │
│                                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ NewsPodcaster│──► ScriptBuilder │──► PodcastScript │──► AudioManager  │   │
│  │ (orchestrate │  │ (Intro→News→ │  │ (5 blocks,   │  │ (TTS + STT +    │   │
│  │  pipeline)   │  │  Outro)      │  │  <250 chars) │  │  cache + stitch)│   │
│  └─────────────┘  └──────────────┘  └──────────────┘  └─────────────────┘   │
│        │                 │                  │                │              │
│        ▼                 ▼                  ▼                ▼              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐    │
│  │NewsProvider │  │ VoiceCommand │  │ ScriptBlock  │  │SynthResult  │    │
│  │ (mock/real) │  │  (topic ext.)│  │              │  │+ StitchResult│    │
│  └─────────────┘  └──────────────┘  └──────────────┘  └─────────────┘    │
├─────────────────────────────────────────────────────────────────────────────┤
│                    AUDIO & CACHE LAYER (via AudioManager)                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Text Block (<250 chars) → MD5 Cache Key → Cache Hit/Miss                │ │
│  │  Hit: serve from audio_cache/{hash}.mp3 (0 credits)                      │ │
│  │  Miss: eleven_flash_v2_5 TTS (0.5 credits/char) → save to cache          │ │
│  │  STT: scribe_v1 (for voice command transcription)                          │ │
│  │  Stitch: ffmpeg concat + 0.5s silence → output/podcast_{timestamp}.mp3   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│                    CLI LEGACY LAYER (deprecated, archived)                   │
│                                                                             │
│  backend/src/cli.ts → npx tsx src/cli.ts [--topic | --voice | --record | ...│
│  • Fully functional but deprecated                                           │
│  • Preserved for archival; not maintained                                    │
│  • Uses recorder.ts (node-record-lpcm16-ts, backend-only)                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Presentation Layer (React)

**Responsibility:** Provide an interactive web UI for podcast generation, voice recording, topic selection, live status feedback, and audio playback.

**Components:**

- **`AudioRecorder`** — Uses the browser's native `MediaRecorder` API to capture microphone input. Requests `getUserMedia` permission, records until the user clicks "Stop," and emits an `audio/Blob` (WebM/Opus or WAV). No system-level audio dependencies are required (unlike the CLI's sox-based `recorder.ts`).
- **`TopicInput`** — A dropdown/autocomplete input listing the supported topics (`technology`, `sports`, `politics`, `business`, `science`, `entertainment`, `health`). Includes a "General News" option (empty topic). Emits the selected topic string.
- **`StatusTracker`** — A real-time progress indicator showing the pipeline state: `Recording → Transcribing → Fetching News → Synthesizing → Ready`. Transitions are driven by the parent component as each API call progresses. Each state has an icon and label.
- **`PodcastPlayer`** — An HTML5 `<audio>` element with native controls, loading the generated MP3 via `GET /api/output/:filename`. Displays episode metadata (duration, credits consumed, cache hits/misses).
- **`App`** — Root component that assembles the above into a single-page layout, manages shared state (selected topic, audio blob, status, podcast output), and orchestrates API calls.

**Data Flow:**
1. User selects a topic (or leaves blank) → `TopicInput` emits topic string.
2. User clicks "Record" → `AudioRecorder` requests microphone, records, emits audio Blob.
3. Parent sends audio Blob to `POST /api/transcribe` → backend returns `{ transcript, voiceCommand }`.
4. Parent sends `{ topic, source: "voice" }` to `POST /api/generate-podcast` → backend returns `PodcastOutput` + `audioUrl`.
5. `PodcastPlayer` loads `audioUrl` and plays the MP3.
6. For non-voice mode: User clicks "Generate" → Parent sends `{ topic, source: "text" }` to `POST /api/generate-podcast`.

### 2.2 API Server Layer (Express)

**Responsibility:** Expose HTTP endpoints that bridge the browser UI to the Node.js service layer. Handle multipart audio uploads, JSON request bodies, and MP3 file serving.

**Components / Endpoints:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/transcribe` | Accepts a multipart audio blob, saves to temp, transcribes via `scribe_v1`, parses voice command, returns transcript + `VoiceCommand`. |
| `POST` | `/api/generate-podcast` | Accepts `{ topic, source }`, delegates to `NewsPodcaster.generatePodcast()`, returns `PodcastOutput` + `audioUrl`. |
| `POST` | `/api/cache/clear` | Clears all files in `audio_cache/`, returns success status. |
| `GET` | `/api/output/:filename` | Serves an MP3 file from `output/` for browser playback. |

**Cross-origin handling:** CORS middleware is configured to allow requests from the Vite dev server (`http://localhost:5173`) during development and from the same origin in production (frontend and backend served from the same domain).

**Request/Response Contracts:** See Section 4 (API Endpoint Contracts).

### 2.3 Service Layer (Existing)

**Responsibility:** The same orchestration and business logic from the original CLI PoC, unchanged and reused by the API server.

**Components (unchanged from CLI):**

- **`NewsPodcaster`** (`core/newsPodcaster.ts`) — Orchestrates the full pipeline: news fetch → script build → TTS synthesis → audio stitching → output. Exposes `generatePodcast(options)` and `processVoiceRequest(audioPath)`.
- **`ScriptBuilder`** (`core/scriptBuilder.ts`) — Builds a radio-style `PodcastScript` (Intro → 1–3 News Items → Outro). Enforces the `< 250 chars per block` invariant via `truncateBlock()`. Calculates `estimatedCredits` and `totalChars`.
- **`NewsProvider`** (`types/index.ts` abstract interface) — Defines `fetchNews(topic?, limit?)`.
- **`MockNewsProvider`** (`mocks/MockNewsProvider.ts`) — Generates 24 realistic fake news items across 7 topics. Shuffled and sliced to `limit` (default 3).
- **`VoiceCommandParser`** (`utils/voiceCommandParser.ts`) — Extracts a topic keyword from transcribed text using prefix matching.

**Data Flow:** Identical to the original CLI pipeline. The only difference is the entry point: HTTP request handlers in the Express server call these services instead of CLI argument parsing in `index.ts`.

### 2.4 Audio & Cache Layer

**Responsibility:** TTS synthesis, STT transcription, MD5-based disk caching, and audio segment stitching. Accessed exclusively through the backend's `AudioManager`.

**Components (unchanged):**

- **`AudioManager`** (`audioManager.ts`) — ElevenLabs client wrapper. Methods: `generateCacheKey(text)` (MD5), `getCachedAudioPath(cacheKey)`, `synthesizeSpeech(text)` (cache check → TTS API → save), `transcribeAudio(filePath)` (scribe_v1), `stitchSegments(segmentPaths)` (ffmpeg concat + silence), `clearCache()`.
- **Cache Layer** — `audio_cache/{md5hash}.mp3`. Deterministic cache keys ensure identical text is never synthesized twice.
- **TTS Synthesizer** — `eleven_flash_v2_5` at 0.5 credits/char. Voice: `JBFqnCBsd6RMkjVDRZzb` ("George"). Output: `mp3_44100_128`.
- **STT Transcriber** — `scribe_v1`, high-accuracy speech-to-text.
- **Audio Stitcher** — `ffmpeg-static` + `fluent-ffmpeg`. Concatenates MP3 segments with 0.5s silence between each. Output: `output/podcast_{timestamp}.mp3`.

### 2.5 CLI Legacy Layer

**Responsibility:** Preserved the original CLI entry point as a deprecated artifact for archival and backward compatibility.

- **Location:** `backend/src/cli.ts` (renamed from `src/index.ts`).
- **Status:** Fully functional but deprecated. No new features or bug fixes.
- **Usage:** `npx tsx src/cli.ts [--topic | --voice | --record | --clear-cache | --help]`.
- **Backend-only recording:** `recorder.ts` (`utils/recorder.ts`) uses `node-record-lpcm16-ts` with a sox backend (`rec` on macOS, `arecord` on Linux). It contains two manual fixes that must not be lost:
  - **`Promise.race([inputPromise, streamErrorPromise])`** — races the ENTER-keypress resolver against a stream error listener so that SoX startup failures surface immediately instead of blocking on stdin.
  - **`pipeline(stream, fileStream)`** — uses Node.js `stream.pipeline` to ensure the recording stream is fully flushed to disk before the file is closed, preventing truncated WAV output.
- **Important:** `recorder.ts` imports `node-record-lpcm16-ts`, a native Node.js module that is **not** browser-compatible. It must NEVER be imported into the React frontend. The web app uses the browser's native `MediaRecorder` API instead (see Section 2.1).

---

## 3. Core TypeScript Data Contracts

All contracts are defined in `shared/types/index.ts` with strict typing (no `any`). The shared types are imported by both the backend (`@shared/types`) and compiled into the frontend via Vite's alias resolution.

### 3.1 Configuration Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_BLOCK_CHARS` | 249 | Maximum characters per script block (strictly < 250). |
| `CREDITS_PER_CHAR` | 0.5 | Credits consumed per character for `eleven_flash_v2_5`. |
| `CACHE_DIR` | `audio_cache/` | Directory for MD5-keyed cached MP3 files. |
| `OUTPUT_DIR` | `output/` | Directory for final podcast MP3 files. |
| `ELEVENLABS_VOICE_ID` | `JBFqnCBsd6RMkjVDRZzb` | "George" voice — clear newsreader. |
| `TTS_MODEL` | `eleven_flash_v2_5` | Ultra-lightweight TTS model (0.5 credits/char). |
| `STT_MODEL` | `scribe_v1` | High-accuracy speech-to-text model. |
| `TTS_OUTPUT_FORMAT` | `mp3_44100_128` | MP3, 44.1 kHz, 128 kbps. |
| `SEGMENT_SILENCE_SECONDS` | 0.5 | Silence between stitched segments. |
| `MAX_NEWS_ITEMS` | 3 | Max news items per episode. |

### 3.2 `NewsItem`

Represents a single news article fetched from a news source.

```typescript
interface NewsItem {
  /** Short headline (max 100 characters). */
  headline: string;
  /** Brief summary of the story (max 200 characters). */
  summary: string;
  /** Name of the news outlet publishing the article. */
  source: string;
  /** Direct URL to the full article. */
  url: string;
  /** Topic category (e.g., "technology", "sports"). */
  topic: Topic;
  /** ISO 8601 publication timestamp. */
  publishedAt: string;
}
```

### 3.3 `ScriptBlock`

A single unit of synthesized speech in the podcast script.

```typescript
type ScriptBlockType = "intro" | "news" | "outro";

interface ScriptBlock {
  /** The text content to be synthesized. Enforced to be < 250 characters. */
  text: string;
  /** Semantic category of this block. */
  type: ScriptBlockType;
  /** Zero-based index for news blocks; undefined for intro/outro. */
  index?: number;
}
```

### 3.4 `PodcastScript`

The complete structured script before audio synthesis.

```typescript
interface PodcastScript {
  /** ISO date string for this episode (e.g., "2026-08-16"). */
  date: string;
  /** Welcome block introducing the podcast and date. */
  intro: ScriptBlock;
  /** Array of 1–3 news item blocks. */
  newsItems: ScriptBlock[];
  /** Closing block with credits and call-to-action. */
  outro: ScriptBlock;
  /** Total character count across all blocks (post-truncation). */
  totalChars: number;
  /** Estimated cost in credits (totalChars × CREDITS_PER_CHAR). */
  estimatedCredits: number;
}
```

### 3.5 `PodcastOutput`

Metadata about the completed podcast generation.

```typescript
interface PodcastOutput {
  /** File system path to the output MP3 file. */
  outputPath: string;
  /** Total duration of the podcast in seconds. */
  durationSeconds: number;
  /** Ordered list of cached MP3 file paths used for each block. */
  segmentPaths: string[];
  /** Total credits actually consumed (cache hits = 0). */
  creditsConsumed: number;
  /** Credits saved by serving blocks from cache. */
  creditsSaved: number;
  /** Number of blocks served from cache. */
  cacheHits: number;
  /** Number of blocks that required fresh synthesis. */
  cacheMisses: number;
  /** Whether the output was generated from a voice command. */
  source: "voice" | "text";
  /** The topic this podcast covers (empty string for general news). */
  topic: string;
}
```

### 3.6 `VoiceCommand`

The parsed result of a voice (or text) command.

```typescript
interface VoiceCommand {
  /** Raw transcribed text from scribe_v1. */
  transcript: string;
  /** Extracted topic keyword (e.g., "technology"). Empty for general news. */
  topic: string;
  /** Confidence score from the STT model (0.0–1.0). */
  confidence: number;
  /** Whether the command originated from voice input. */
  isVoice: boolean;
}
```

### 3.7 `NewsProvider` (Abstract Interface)

Allows swapping the news source implementation.

```typescript
interface NewsProvider {
  /**
   * Fetch news articles, optionally filtered by topic.
   * @param topic - Optional topic filter (e.g., "technology").
   * @param limit - Maximum number of items to return (default: MAX_NEWS_ITEMS).
   * @returns Array of NewsItem sorted by relevance/recency.
   */
  fetchNews(topic?: string, limit?: number): Promise<NewsItem[]>;
}
```

### 3.8 `SynthesisResult`

Internal record for a single synthesized block — used for credit tracking and stitching.

```typescript
interface SynthesisResult {
  /** File path to the synthesized or cached MP3. */
  filePath: string;
  /** Number of characters synthesized. */
  charCount: number;
  /** Credits consumed for this block (0 if cached). */
  credits: number;
  /** Whether the result came from cache. */
  fromCache: boolean;
  /** The MD5 hash key used for caching. */
  cacheKey: string;
}
```

### 3.9 `StitchResult`

Result of stitching audio segments into a single podcast file.

```typescript
interface StitchResult {
  /** File system path to the stitched podcast MP3. */
  outputPath: string;
  /** Total duration of the stitched file in seconds. */
  duration: number;
}
```

---

## 4. API Endpoint Contracts

All endpoints are hosted on the Express backend (default port: `4000`). The frontend communicates exclusively through these endpoints — no direct access to filesystem or cache is exposed.

### 4.1 `POST /api/transcribe`

Transcribes a voice command audio file and extracts the topic keyword.

**Request:**

```
Content-Type: multipart/form-data

Field: audio  (required)  — audio file (WAV, MP3, or WebM)
```

**Response (200):**

```json
{
  "transcript": "technology news today",
  "voiceCommand": {
    "transcript": "technology news today",
    "topic": "technology",
    "confidence": 0.8,
    "isVoice": true
  }
}
```

**Errors:**

| Status | Code | Message |
|--------|------|---------|
| 400 | `BAD_REQUEST` | No audio file provided in request. |
| 500 | `TRANSCRIPTION_FAILED` | STT API call failed. Details in message. |

**Flow:**
1. Receive audio Blob → save to `temp/voice_cmd_{timestamp}.wav`.
2. Call `AudioManager.transcribeAudio(filePath)` → `scribe_v1` transcription.
3. Call `VoiceCommandParser.parse(transcript)` → extract topic keyword.
4. Delete temp file.
5. Return `{ transcript, voiceCommand }`.

### 4.2 `POST /api/generate-podcast`

Generates a complete podcast episode from a topic or voice command.

**Request:**

```
Content-Type: application/json

{
  "topic": "technology",
  "source": "text"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | `string` | No | Topic filter (e.g., "technology"). Empty string for general news. |
| `source` | `"text" \| "voice"` | Yes | Whether this request originated from a voice command or typed input. |

**Response (200):**

```json
{
  "outputPath": "output/podcast_abc123.mp3",
  "audioUrl": "/api/output/podcast_abc123.mp3",
  "durationSeconds": 45.2,
  "segmentPaths": [
    "audio_cache/a1b2c3d4....mp3",
    "audio_cache/f7e8d9c0....mp3",
    "audio_cache/b3c4d5e6....mp3",
    "audio_cache/7a8b9c0d....mp3",
    "audio_cache/e5f6a7b8....mp3"
  ],
  "creditsConsumed": 90,
  "creditsSaved": 435,
  "cacheHits": 5,
  "cacheMisses": 0,
  "source": "text",
  "topic": "technology",
  "estimatedCredits": 525,
  "totalChars": 1050
}
```

**Errors:**

| Status | Code | Message |
|--------|------|---------|
| 400 | `BAD_REQUEST` | Missing `source` field. |
| 500 | `GENERATION_FAILED` | Pipeline failed (news fetch, synthesis, or stitching error). |

**Flow:**
1. Validate request body.
2. Call `NewsPodcaster.generatePodcast({ topic, source })`.
3. Pipeline: `NewsProvider.fetchNews()` → `ScriptBuilder.buildScript()` → `AudioManager.synthesizeSpeech()` (per block) → `AudioManager.stitchSegments()`.
4. Return `PodcastOutput` augmented with `audioUrl` (derived from `outputPath` filename).

### 4.3 `POST /api/cache/clear`

Clears all cached audio files.

**Request:** Empty body.

**Response (200):**

```json
{
  "success": true,
  "message": "Audio cache cleared successfully."
}
```

### 4.4 `GET /api/output/:filename`

**Request:** None (path parameter: `filename`).

**Response (200):** Binary MP3 file.

### 4.5 `GET /api/history`

Returns the execution history of all past podcast generations. The history is persisted in a local SQLite database (`history.db`) stored in the backend's `data/` directory. Each record captures the pipeline method (API/WebSocket), interaction type (text/voice), input data, generated news structure, and the audio file path for replay.

**Request:** Empty body. Supports optional query parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 50 | Maximum number of entries to return (most recent first). |

**Response (200):**

```json
{
  "entries": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "timestamp": "2026-08-16T14:32:05.123Z",
      "pipeline_type": "WebSocket",
      "feature_type": "Speech-to-Speech",
      "input_data": "Technology news today",
      "generated_response": {
        "date": "2026-08-16",
        "intro": { "text": "...", "type": "intro" },
        "newsItems": [
          { "text": "...", "type": "news", "index": 0 },
          { "text": "...", "type": "news", "index": 1 }
        ],
        "outro": { "text": "...", "type": "outro" },
        "totalChars": 847,
        "estimatedCredits": 42.35
      },
      "audio_file_path": "/api/output/podcast_20260816_143205.mp3"
    }
  ]
}
```

Serves a generated podcast MP3 for in-browser playback.

**Request:** None (path parameter only).

**Response:** Binary MP3 file with `Content-Type: audio/mpeg`. Returns `404` if the file does not exist.

---

## 5. Credit Optimization & Caching Strategy

### 5.1 Model Selection

| Component | Model | Cost Rate | Rationale |
|-----------|-------|-----------|-----------|
| TTS | `eleven_flash_v2_5` | 0.5 credits/char | Lightest available TTS model; ideal for PoC cost control. Supports multiple languages including English. |
| STT | `scribe_v1` | Billed per-minute | Industry-leading accuracy; acceptable for short voice commands. |

The voice used for synthesis is `JBFqnCBsd6RMkjVDRZzb` ("George"), a clear, neutral-newsreader voice from the ElevenLabs voice library.

### 5.2 Output Format

- **Codec:** MP3
- **Sample Rate:** 44,100 Hz
- **Bitrate:** 128 kbps
- **Format String:** `mp3_44100_128`

This provides a good balance between file size, compatibility, and audio quality for a podcast.

### 5.3 MD5-Based Disk Caching

**Strategy:** Generate an MD5 hash of the exact text string. Use the hash as the filename in `audio_cache/`. This ensures deterministic cache lookups — identical text always maps to the same file.

```
audio_cache/
├── a1b2c3d4e5f6...mp3   ← cached intro
├── f7e8d9c0b1a2...mp3   ← cached news item 1
├── b3c4d5e6f7a8...mp3   ← cached news item 2
└── ...
```

**Cache Key Generation:**
```
cacheKey = md5(text).hex()  →  "audio_cache/{hash}.mp3"
```

**Cache Resolution Logic:**
1. Compute `cacheKey` from input text.
2. Check if `audio_cache/{cacheKey}.mp3` exists on disk.
3. **Hit:** Return the cached file path. Credits consumed = 0.
4. **Miss:** Call ElevenLabs TTS API, save raw bytes to `audio_cache/{cacheKey}.mp3`, return path. Credits consumed = `text.length × 0.5`.

**Cache Invalidation:** There is no automatic invalidation in the PoC. Cache files persist across runs and between CLI and web usage. A web UI "Clear Cache" button (or `--clear-cache` CLI flag) removes all files in `audio_cache/`.

### 5.4 Character Limit Validation

**Constraint:** Each script block (Intro, News Item, Outro) must be **strictly less than 250 characters** (enforced at 249 via `MAX_BLOCK_CHARS`).

**Enforcement:**
- The `ScriptBuilder` generates each block and immediately validates its length via `truncateBlock()`.
- If a block exceeds 250 characters, it is **truncated to 246 characters** + `"..."` (3 chars) to stay under the limit.
- A `WARNING` log entry is emitted for any truncation.
- The `totalChars` calculation in `PodcastScript` uses the **actual** (post-truncation) character count for accurate credit estimation.

**Rationale:** ElevenLabs imposes no hard character limit per request, but keeping blocks small:
- Reduces the blast radius of any single synthesis failure.
- Enables fine-grained caching (a changed headline only invalidates one cache entry, not the entire intro).
- Keeps individual audio segments short for responsive playback.

### 5.5 Credit Tracking

| Metric | Formula |
|--------|---------|
| Per-block credits | `blockText.length × 0.5` |
| Total estimated credits | `sum(all blocks) × 0.5` = `script.totalChars × 0.5` |
| Actual credits consumed | `sum(blocks that were cache misses × 0.5)` |
| Credits saved | `sum(blocks that were cache hits × 0.5)` |

### 5.6 News Fetcher Mock Strategy

For PoC purposes, `MockNewsProvider` generates 3 `NewsItem` objects per call (shuffled from 24 pre-defined items across 7 topics). These are **not** cached by the audio layer (they change each day), but the generated script blocks are. The typical credit flow for UC-01 (first run):

| Block | Chars | From Cache | Credits |
|-------|-------|------------|---------|
| Intro | ~180 | No | 90 |
| News 1 | ~240 | No | 120 |
| News 2 | ~240 | No | 120 |
| News 3 | ~240 | No | 120 |
| Outro | ~150 | No | 75 |
| **Total** | **~1,050** | **0 hits** | **~525** |

On a **second run** where the news items are identical (e.g., same mock data):

| Block | Chars | From Cache | Credits |
|-------|-------|------------|---------|
| Intro | ~180 | Yes | 0 |
| News 1 | ~240 | Yes | 0 |
| News 2 | ~240 | Yes | 0 |
| News 3 | ~240 | Yes | 0 |
| Outro | ~150 | Yes | 0 |
| **Total** | **~1,050** | **5 hits** | **0** |

This demonstrates a **100% credit savings** on repeat runs with identical content.

---

## 6. History Log System

The History Log provides a permanent record of every podcast generation, enabling users to review past requests, replay generated audio, and see which pipeline method was used (REST API vs. WebSocket).

### 7.1 Database

- **Technology:** [better-sqlite3](https://www.npmjs.com/package/better-sqlite3) — synchronous, zero-dependency SQLite bindings for Node.js.
- **Location:** `backend/data/history.db` (SQLite file).
- **Schema:**

```sql
CREATE TABLE IF NOT EXISTS history (
    id            TEXT PRIMARY KEY,       -- UUID v4
    timestamp     TEXT NOT NULL,          -- ISO 8601
    pipeline_type TEXT NOT NULL,          -- "API" | "WebSocket"
    feature_type  TEXT NOT NULL,          -- "Text-to-Speech" | "Speech-to-Text"
    input_data    TEXT NOT NULL,          -- raw topic or transcribed text
    generated_response TEXT NOT NULL,     -- serialized PodcastScript JSON
    audio_file_path TEXT NOT NULL        -- path to MP3 (/api/output/<filename>)
);
```

### 7.2 Architecture

```
User request (REST or WebSocket)
       │
       ▼
┌────────────────────┐
│  pipeline complete │
│  (PodcastOutput)   │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐   insert into   ┌─────────────────┐
│  HistoryService    │ ——————————————→  │  history.db     │
│  (better-sqlite3)  │                 │  (SQLite)       │
└────────┬───────────┘                 └──────┬──────────┘
         │                                    │
         │      GET /api/history              │
         └────────────────────────────────────┘
```

The `HistoryService` is invoked at the **end of every successful pipeline** — both the REST handler in `server.ts` and the WebSocket orchestrator (`podcastWebSocketOrchestrator.ts`) call `HistoryService.logGeneration()` with the pipeline metadata. No pipeline code is modified; the history insert is a single additional call before the response is sent to the client.

### 7.3 API Endpoint

`GET /api/history?limit=50` returns the most recent history entries (newest first). See [§4.5](#45-get-apihistory) for the full response shape.

### 7.4 Frontend History Section

The History section is a **full-page view** accessible via a persistent "History" button in the top-right corner of the UI. Each history entry renders as an **expandable accordion card** (no modals):

- **Header (always visible):** Topic headline, timestamp, and badges for pipeline type (API/WebSocket) and feature type (TTS/STT).
- **Expanded view:** The original input text alongside the generated news script JSON, plus an embedded `<audio>` player pointing to the saved MP3 file for in-place playback.

The history view is available in **both REST and WebSocket modes** — it reads from `GET /api/history` regardless of the active communication mode.

---

## 7. Non-Goals & Out of Scope

The following are explicitly out of scope for this PoC:

- **Real news API integration**: A live RSS or news API client. The PoC uses a mock provider.
- **Voice selection UI**: Dynamic voice selection. The PoC hardcodes the "George" voice ID.
- **Streaming synthesis**: Real-time TTS streaming. The PoC uses synchronous `convert` (blocking API call).
- **Multi-language news**: The PoC targets English-language news only.
- **Podcast hosting/distribution**: Publishing to podcast platforms. The PoC serves MP3 files via the backend.
- **Speaker diarization**: Distinguishing speakers in voice commands. `scribe_v1` supports it, but the PoC uses a single-speaker assumption.
- **Production deployment**: Docker, CI/CD, load balancing. The PoC runs locally with `npm run dev`.
- **Authentication/authorization**: No user accounts or session management. The API key is server-side only.

---

## 8. Security Considerations

- **API Key Management:** The ElevenLabs API key is loaded from the `ELEVENLABS_API_KEY` environment variable via `dotenv` on the backend only. It is **never** exposed to the browser. The frontend communicates exclusively through HTTP endpoints that internally use the key. The `.env` file is included in `.gitignore`.
- **API Key Exposure Prevention:** The React frontend never imports `@elevenlabs/elevenlabs-js` or any module that references the API key. All ElevenLabs calls are routed through the Express backend.
- **`recorder.ts` Backend Isolation:** `recorder.ts` imports `node-record-lpcm16-ts`, a native Node.js module. It must NEVER be imported into the React frontend bundle. The web app uses the browser's native `MediaRecorder` API instead. This is enforced by the architectural separation: backend source lives in `backend/src/`, frontend source lives in `frontend/src/`.
- **Input Sanitization:** All text blocks are truncated to `< 250 characters` before being sent to the ElevenLabs API, preventing oversized payloads.
- **Audio File Handling:** STT input audio files are received as multipart form data, saved to `temp/`, transcribed, and deleted. No file system writes occur outside `audio_cache/`, `output/`, and `temp/`.
- **CORS Configuration:** CORS is configured to allow requests only from the Vite dev server (`http://localhost:5173`) during development and from the same origin in production.
- **Rate Limiting:** The PoC does not implement rate limiting. In production, a retry-with-backoff wrapper around ElevenLabs API calls is recommended.

---

## 9. Dependencies

### 9.1 Backend (Node.js)

| Package | Version | Purpose |
|---------|---------|---------|
| `@elevenlabs/elevenlabs-js` | ^2.63.0 | Official ElevenLabs SDK for TTS and STT |
| `dotenv` | ^17.4.2 | Environment variable loading |
| `typescript` | ^5.0.0 | TypeScript compiler |
| `tsx` | ^4.23.0 | TypeScript execution without pre-compilation |
| `@types/node` | ^20.0.0 | Node.js type definitions |
| `ffmpeg-static` | ^5.0.0 | Bundled ffmpeg binary for audio stitching |
| `fluent-ffmpeg` | ^2.1.0 | FFmpeg wrapper for audio processing |
| `@types/fluent-ffmpeg` | ^2.0.0 | TypeScript types for fluent-ffmpeg |
| `express` | ^4.18.0 | HTTP server framework |
| `@types/express` | ^4.17.0 | TypeScript types for Express |
| `cors` | ^2.8.0 | CORS middleware |
| `@types/cors` | ^2.8.0 | TypeScript types for cors |
| `multer` | ^1.4.0 | Multipart form-data handling for audio uploads |
| `@types/multer` | ^1.4.0 | TypeScript types for multer |
| `node-record-lpcm16-ts` | ^1.0.0 | TypeScript microphone recording (CLI legacy, backend-only) |
| `node-record-lpcm16` | ^1.0.1 | Underlying recording library (sox/arecord/rec backend, CLI legacy) |
| `better-sqlite3` | ^9.0.0 | Local SQLite database for the History Log |

### 9.2 Backend Node.js Built-in Modules

| `crypto` | MD5 hash generation for cache keys |
| `fs` | File system operations (read/write/check cache, temp file cleanup) |
| `path` | Cross-platform path construction |
| `os` | Temporary directory access |
| `stream` | Stream consumption for audio buffers |
| `stream/promises` | `pipeline` for proper stream flushing (used in `recorder.ts`) |
| `child_process` | Spawning `system_profiler` for audio device detection (CLI legacy) |
| `util` | `promisify` wrapper for async exec calls |
| `readline` | Capturing ENTER keypress to stop live recording (CLI legacy) |

### 9.3 Frontend (React)

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^18.0.0 | UI library |
| `react-dom` | ^18.0.0 | React DOM renderer |
| `vite` | ^5.0.0 | Build tool and dev server |
| `typescript` | ^5.0.0 | TypeScript compiler |
| `@types/react` | ^18.0.0 | React type definitions |
| `@types/react-dom` | ^18.0.0 | React DOM type definitions |
| `tailwindcss` | ^3.0.0 | Utility-first CSS framework |
| (or) `nanostores` | ^0.20.0 | Lightweight state management (alternative to Tailwind) |

### 9.4 Frontend APIs

| `MediaRecorder` | Browser-native audio recording (replaces `node-record-lpcm16-ts`) |
| `getUserMedia` | Microphone permission request |
| `HTMLAudioElement` | Native audio playback for `<audio>` element |

---

## 10. File Structure

```
elevenlabs-POC/
├── docs/
│   ├── SDD.md                      ← This document (v3.0)
│   ├── HISTORY.md                  ← Project evolution chronology
│   └── DEVELOPMENT_PLAN.md         ← Implementation roadmap (v3.0)
├── frontend/                       ← React + Vite web application
│   ├── src/
│   │   ├── components/
│   │   │   ├── AudioRecorder.tsx   ← MediaRecorder API wrapper
│   │   │   ├── TopicInput.tsx      ← Topic selector/dropdown
│   │   │   ├── StatusTracker.tsx   ← Live pipeline status indicator
│   │   │   ├── WebSocketModeToggle.tsx ← REST/WS mode selector (WebSocket feature)
│   │   │   ├── StreamingLogs.tsx ← Collapsible real-time log panel (WebSocket feature)
│   │   │   ├── NewsPanel.tsx     ← News articles display (additive feature)
│   │   │   └── PodcastPlayer.tsx ← Audio player for generated MP3
│   │   ├── services/
│   │   │   ├── api.ts            ← HTTP client for REST API endpoints
│   │   │   └── websocketClient.ts ← Browser WebSocket client with auto-reconnect (WebSocket feature)
│   │   ├── types/
│   │   │   ├── index.ts          ← Frontend type definitions (API shapes)
│   │   │   └── websocket.ts      ← WebSocket protocol message types (WebSocket feature)
│   │   ├── App.tsx               ← Root component + state management (REST + WS modes)
│   │   ├── main.tsx              ← React entry point
│   │   └── index.css             ← Global styles (Tailwind directives)
│   ├── index.html
│   ├── vite.config.ts              ← Vite config with @shared alias
│   ├── tsconfig.json
│   └── package.json
├── backend/                        ← Express HTTP server (Node.js)
│   ├── src/
│   │   ├── server.ts               ← Express server entry point (+ WebSocket attachment)
│   │   ├── websocket.ts            ← attachWebSocket() adapter (WebSocket feature)
│   │   ├── services/
│   │   │   └── podcastWebSocketOrchestrator.ts ← WS pipeline orchestrator with progress streaming (WebSocket feature)
│   │   ├── audioManager.ts         ← ElevenLabs TTS/STT, MD5 cache, ffmpeg
│   │   ├── config/
│   │   │   └── env.ts              ← Environment variables and constants
│   │   ├── core/
│   │   │   ├── newsPodcaster.ts    ← Podcast pipeline orchestration
│   │   │   └── scriptBuilder.ts    ← Script building (intro, news, outro)
│   │   ├── mocks/
│   │   │   └── MockNewsProvider.ts ← Mock news data for PoC
│   │   ├── types/
│   │   │   └── index.ts            ← TypeScript interfaces and constants
│   │   ├── utils/
│   │   │   ├── functions.ts        ← Logging and utility helpers
│   │   │   ├── recorder.ts         ← Live microphone recording (CLI legacy,
│   │   │   │                       │   backend-only — NOT imported to frontend)
│   │   │   └── voiceCommandParser.ts ← Voice command topic extraction
│   │   └── cli.ts                  ← CLI entry point (deprecated, archived)
│   ├── tsconfig.json
│   └── package.json
├── shared/                         ← Shared TypeScript types (frontend + backend)
│   └── types/
│       └── index.ts                ← Canonical data contracts (NewsItem, etc.)
├── audio_cache/                    ← MD5-keyed MP3 cache directory
├── output/                         ← Generated podcast MP3 files
├── temp/                           ← Temporary recording files (auto-cleaned)
├── data/                           ← SQLite history database (history.db)
├── .env                            ← Environment variables (API key)
├── .gitignore                      ← Ignores .env, node_modules, audio_cache/
├── package.json                    ← Root workspace manifest
├── tsconfig.json                   ← Root TypeScript config (workspace)
└── README.md                       ← Project documentation
```

---

## 11. Assumptions & Constraints

| # | Assumption | Justification |
|---|-----------|---------------|
| A-01 | The `eleven_flash_v2_5` model is available in the user's ElevenLabs account. | Confirmed available in SDK v2.63.0; requires a paid account. |
| A-02 | The voice ID `JBFqnCBsd6RMkjVDRZzb` ("George") is accessible. | Available in the playground project's voice library. |
| A-03 | News mock data is sufficient for PoC validation. | The user specified a PoC; real news integration is a future enhancement (Non-Goal 7.1). |
| A-04 | Audio input for STT is provided as an audio file (WAV/MP3). Live microphone recording is supported via the browser's `MediaRecorder` API (web) or `--record` flag (CLI). | The web app captures audio in-browser and sends it to the backend's `/api/transcribe` endpoint. |
| A-05 | Single-threaded execution is sufficient for the API server. | A daily podcast is generated once per request; no concurrent pipeline requirements. |
| A-06 | The backend server runs on the same machine as the cache and output directories. | File system caching (`audio_cache/`, `output/`) requires local disk access. |
| A-07 | The browser supports the `MediaRecorder` API. | Required for voice recording. Modern browsers (Chrome 94+, Firefox 91+, Safari 14.1+) support it. |

---

## 12. Acceptance Criteria

The PoC is considered complete when:

1. ✅ The backend server (`npm run dev:server`) starts and exposes HTTP endpoints on port 4000 without errors.
2. ✅ The frontend app (`npm run dev`) loads in the browser and the `TopicInput`, `StatusTracker`, and `PodcastPlayer` components render correctly.
3. ✅ Clicking "Generate" (text mode) with a topic calls `POST /api/generate-podcast`, and the `PodcastPlayer` plays the resulting MP3 in-browser.
4. ✅ Clicking "Record" in `AudioRecorder` requests microphone permission, captures audio via `MediaRecorder`, sends it to `POST /api/transcribe`, and displays the extracted topic.
5. ✅ The `StatusTracker` shows the correct sequence: `Recording → Transcribing → Fetching News → Synthesizing → Ready` during a full voice-driven pipeline.
6. ✅ The intro/outro text blocks produce identical MD5 hashes across runs, proving the cache works across CLI and web sessions.
7. ✅ Each script block is strictly < 250 characters (verified by runtime assertion in `ScriptBuilder.truncateBlock()`).
8. ✅ The total credits estimated by the script matches the SDK's actual consumption within 2%.
9. ✅ Running the same topic twice shows cache hit logging and 0 credits consumed on the second run.
10. ✅ All TypeScript code compiles with `strict: true` and passes `tsc --noEmit` in both `frontend/` and `backend/`.
11. ✅ The deprecated CLI entry point (`backend/src/cli.ts`) still runs via `npx tsx src/cli.ts` and produces the same output as before the web transition.
12. ✅ The `recorder.ts` module is never imported by any frontend source file (verified by grep / import boundary check).

---

 *End of document (v3.0)*