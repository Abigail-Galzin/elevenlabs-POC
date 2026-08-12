# Software Design Document (SDD)

## Automated Daily News Podcaster — Proof of Concept

**Document Version:** 1.0  
**Date:** 2026-08-12  
**Author:** Senior Software Architect  
**Language:** English  

---

## 1. Overview & Use Cases

### 1.1 Purpose

The **Automated Daily News Podcaster** is a TypeScript-based Command-Line Interface (CLI) tool that transforms daily news headlines into a radio-style audio podcast. It leverages ElevenLabs' text-to-speech (TTS) and speech-to-text (STT) APIs to produce a short, professional-sounding audio newscast with minimal credit consumption through aggressive local caching and a lightweight model selection.

The tool is designed as a **Proof of Concept (PoC)** with the following primary objectives:
- Demonstrate a clean, layered architecture for news-to-audio automation.
- Validate ElevenLabs' `eleven_flash_v2_5` TTS model (0.5 credits/char) for cost-efficient audio synthesis.
- Demonstrate `scribe_v1` STT for voice-driven topic requests.
- Prove an MD5-based local disk caching strategy that eliminates redundant API calls.

### 1.2 Use Cases

| # | Use Case | Description |
|---|----------|-------------|
| UC-01 | **Daily Automated Podcast Generation** | Fetch the top 3 news headlines from a news source, build a radio-style script (Intro → 3 News Items → Outro), synthesize each section into speech via `eleven_flash_v2_5`, stitch the segments together with inter-segment silence, and save a single MP3 podcast file to `output/`. |
| UC-02 | **Voice-Requested Topic Filtering** | A user speaks a topic (e.g., "Give me technology news today"). The system captures the audio, transcribes it via `scribe_v1`, extracts the topic keyword, filters news items by topic, and generates a targeted podcast containing only matching articles. |
| UC-03 | **Cached Audio Reuse** | When the same text block (e.g., a recurring intro) is requested across multiple runs, the system serves the audio from local disk cache (`audio_cache/`), consuming zero API credits. Cache entries are keyed by the MD5 hash of the input text. |

---

## 2. Layered Architecture

The system is organized into three layers, each with a distinct responsibility. Data flows unidirectionally: Command → Curation → Audio & Cache.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Command Layer (STT)                          │
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

**Responsibility:** Capture and interpret user intent, whether through voice or typed commands.

**Components:**
- **`SpeechToTextClient` (ElevenLabs SDK):** Accepts an audio file path (WAV/MP3/M4A), invokes `client.speechToText.convert({ modelId: "scribe_v1", file })`, and returns the transcribed text.
- **`VoiceCommandParser`:** Takes the transcribed text and extracts:
  - The **topic keyword** (e.g., "technology", "sports", "politics").
  - An optional **action** (default: "generate podcast about <topic>").
- **`TextCommandParser`:** For non-voice operation, accepts a direct string argument (e.g., `--topic "technology"`).

**Data Flow:**
1. Audio file path → `SpeechToTextClient` → Transcribed text string.
2. Transcribed text → `VoiceCommandParser` → `VoiceCommand` object (transcript, topic, confidence).
3. `VoiceCommand` → Curation Layer.

### 2.2 Curation Layer

**Responsibility:** Transform raw news data into a well-structured, radio-style podcast script with strict character limits.

**Components:**
- **`NewsProvider` (Abstract Interface):** Defines `fetchNews(topic?: string): Promise<NewsItem[]>`. The PoC ships with a `MockNewsProvider` that generates realistic fake headlines. A real implementation would wrap an RSS feed or news API.
- **`ScriptBuilder`:** Takes `NewsItem[]` and produces a `PodcastScript`. Responsibilities:
  - Generate an **Intro** block (welcome message, date, episode description). Must be < 250 chars.
  - Select up to **3 News Items** from the results. Each news item is formatted as a script block (< 250 chars: headline + shortened summary).
  - Generate an **Outro** block (closing, source credits, call-to-action). Must be < 250 chars.
  - Calculate `estimatedCredits` = `totalChars × 0.5` (the `eleven_flash_v2_5` rate).
  - Calculate `totalChars` = sum of all block text lengths.
- **`ScriptValidator`:** Enforces the `< 250 chars per block` invariant. If any block exceeds the limit, the script is truncated with an ellipsis and a warning is logged.

**Data Flow:**
1. `VoiceCommand.topic` (or CLI `--topic`) → `NewsProvider.fetchNews(topic)`.
2. `NewsItem[]` → `ScriptBuilder.buildScript()` → `PodcastScript`.
3. `PodcastScript` → Audio & Cache Layer (block by block).

### 2.3 Audio & Cache Layer

**Responsibility:** Synthesize text to speech with aggressive caching, stitch segments into a final podcast file.

**Components:**
- **`CacheLayer`:**
  - Generates an MD5 hash of the input text using Node.js `crypto`.
  - Checks for `audio_cache/{hash}.mp3`. If present, returns the cached file path (zero credits consumed).
  - If absent, delegates to the TTS Synthesizer and stores the result.
- **`TTSSynthesizer`:**
  - Calls `client.textToSpeech.convert(voiceId, { text, modelId: "eleven_flash_v2_5", outputFormat: "mp3_44100_128" })`.
  - Consumes the returned `ReadableStream<Uint8Array>` into a `Buffer`.
  - Saves the buffer to `audio_cache/{hash}.mp3`.
  - Credits consumed = `text.length × 0.5`.
- **`AudioStitcher`:**
  - Accepts an ordered list of MP3 file paths (one per script block).
  - Generates a 0.5-second silence MP3 via ffmpeg's `anullsrc` filter.
  - Concatenates segments with inter-segment silence using ffmpeg's concat demuxer.
  - Outputs a single merged MP3 to `output/podcast_{timestamp}.mp3`.

**Data Flow:**
1. `PodcastScript` blocks → `CacheLayer.getSynthesizedAudio(text)` → `Buffer` (or cached file path).
2. Synthesized segments → `AudioStitcher.stitch(segments)` → `PodcastOutput`.

---

## 3. Core TypeScript Data Contracts

All contracts are defined in `src/types.ts` with strict typing (no `any`).

### 3.1 `NewsItem`

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
  /** Topic category (e.g., "technology", "sports", "politics", "business"). */
  topic: string;
  /** ISO 8601 publication timestamp. */
  publishedAt: string;
}
```

### 3.2 `ScriptBlock`

A single unit of synthesized speech in the podcast script.

```typescript
type ScriptBlockType = "intro" | "news" | "outro";

interface ScriptBlock {
  /** The text to be synthesized. Enforced to be < 250 characters. */
  text: string;
  /** Semantic category of this block. */
  type: ScriptBlockType;
  /** Index for news blocks (0-based); undefined for intro/outro. */
  index?: number;
}
```

### 3.3 `PodcastScript`

The complete structured script before audio synthesis.

```typescript
interface PodcastScript {
  /** ISO date string for this episode (e.g., "2026-08-12"). */
  date: string;
  /** Welcome block introducing the podcast and date. */
  intro: ScriptBlock;
  /** Array of 1-3 news item blocks. */
  newsItems: ScriptBlock[];
  /** Closing block with credits and call-to-action. */
  outro: ScriptBlock;
  /** Total character count across all blocks. */
  totalChars: number;
  /** Estimated cost in ElevenLabs credits (0.5 credits/char for eleven_flash_v2_5). */
  estimatedCredits: number;
}
```

### 3.4 `PodcastOutput`

Metadata about the generated podcast file.

```typescript
interface PodcastOutput {
  /** File system path to the output MP3 file. */
  outputPath: string;
  /** Total duration of the podcast in seconds (calculated via ffmpeg). */
  durationSeconds: number;
  /** Ordered list of cached MP3 paths used for each block. */
  segmentPaths: string[];
  /** Total credits actually consumed (cache hits = 0). */
  creditsConsumed: number;
  /** Credits saved by serving from cache. */
  creditsSaved: number;
  /** Number of blocks served from cache. */
  cacheHits: number;
  /** Number of blocks requiring fresh synthesis. */
  cacheMisses: number;
  /** Whether the output was generated from a voice command. */
  source: "voice" | "text";
  /** The topic this podcast covers (empty string for general news). */
  topic: string;
}
```

### 3.5 `VoiceCommand`

The parsed result of a voice (or text) command.

```typescript
interface VoiceCommand {
  /** The raw transcribed text from scribe_v1. */
  transcript: string;
  /** Extracted topic keyword (e.g., "technology"). Empty for general news. */
  topic: string;
  /** Confidence score from the STT model (0.0–1.0). */
  confidence: number;
  /** Whether the command originated from voice input. */
  isVoice: boolean;
}
```

### 3.6 `NewsProvider` (Abstract Interface)

Allows swapping the news source implementation.

```typescript
interface NewsProvider {
  /**
   * Fetch news articles, optionally filtered by topic.
   * @param topic - Optional topic filter (e.g., "technology").
   * @param limit - Maximum number of items to return (default: 3).
   * @returns Array of NewsItem sorted by relevance/recency.
   */
  fetchNews(topic?: string, limit?: number): Promise<NewsItem[]>;
}
```

### 3.7 `SynthesisResult`

Internal record for a single synthesized block.

```typescript
interface SynthesisResult {
  /** File path to the synthesized/cached MP3. */
  filePath: string;
  /** Number of characters synthesized. */
  charCount: number;
  /** Credits consumed for this block (0 if cached). */
  credits: number;
  /** Whether the result came from cache. */
  fromCache: boolean;
  /** The hash key used for caching. */
  cacheKey: string;
}
```

---

## 4. Credit Optimization & Caching Strategy

### 4.1 Model Selection

| Component | Model | Cost Rate | Rationale |
|-----------|-------|-----------|-----------|
| TTS | `eleven_flash_v2_5` | 0.5 credits/char | Lightest available TTS model; ideal for PoC cost control. Supports multiple languages including English. |
| STT | `scribe_v1` | Billed per-minute | Industry-leading accuracy; acceptable for short voice commands. |

The voice used for synthesis is `JBFqnCBsd6RMkjVDRZzb` ("George"), a clear, neutral-newsreader voice from the ElevenLabs voice library.

### 4.2 Output Format

- **Codec:** MP3
- **Sample Rate:** 44,100 Hz
- **Bitrate:** 128 kbps
- **Format String:** `mp3_44100_128`

This provides a good balance between file size, compatibility, and audio quality for a podcast.

### 4.3 MD5-Based Disk Caching

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

**Cache Invalidation:** There is no automatic invalidation in the PoC. Cache files persist across runs. A `--clear-cache` CLI flag removes all files in `audio_cache/`.

### 4.4 Character Limit Validation

**Constraint:** Each script block (Intro, News Item, Outro) must be **strictly less than 250 characters**.

**Enforcement:**
- The `ScriptBuilder` generates each block and immediately validates its length.
- If a block exceeds 250 characters, it is **truncated to 247 characters** + `"..."` (3 chars) to stay under the limit.
- A `WARNING` log entry is emitted for any truncation.
- The `totalChars` calculation in `PodcastScript` uses the **actual** (post-truncation) character count for accurate credit estimation.

**Rationale:** ElevenLabs imposes no hard character limit per request, but keeping blocks small:
- Reduces the blast radius of any single synthesis failure.
- Enables fine-grained caching (a changed headline only invalidates one cache entry, not the entire intro).
- Keeps individual audio segments short for responsive playback.

### 4.5 Credit Tracking

| Metric | Formula |
|--------|---------|
| Per-block credits | `blockText.length × 0.5` |
| Total estimated credits | `sum(all blocks) × 0.5` = `script.totalChars × 0.5` |
| Actual credits consumed | `sum(blocks that were cache misses × 0.5)` |
| Credits saved | `sum(blocks that were cache hits × 0.5)` |

### 4.6 News Fetcher Mock Strategy

For PoC purposes, `MockNewsProvider` generates 3 `NewsItem` objects per call. These are **not** cached by the audio layer (they change each day), but the generated script blocks are. The typical credit flow for UC-01 (first run):

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

## 5. Non-Goals & Out of Scope

The following are explicitly out of scope for this PoC:

- **Real news API integration**: A live RSS or news API client. The PoC uses a mock provider.
- **Audio recording**: Capturing live microphone input. The PoC accepts an audio file path for STT.
- **Voice selection UI**: Dynamic voice selection. The PoC hardcodes the "George" voice ID.
- **Streaming synthesis**: Real-time TTS streaming. The PoC uses synchronous `convert` (blocking API call).
- **Multi-language news**: The PoC targets English-language news only.
- **Podcast hosting/distribution**: Publishing to podcast platforms. The PoC outputs to local disk.
- **Speaker diarization**: Distinguishing speakers in voice commands. `scribe_v1` supports it, but the PoC uses a single-speaker assumption.

---

## 6. Security Considerations

- **API Key Management:** The ElevenLabs API key is loaded from the `ELEVENLABS_API_KEY` environment variable via `dotenv`. It is **never** hardcoded. The `.env` file is included in `.gitignore`.
- **Input Sanitization:** All text blocks are truncated to <250 characters before being sent to the ElevenLabs API, preventing oversized payloads.
- **Audio File Handling:** STT input audio files are read from disk and passed as buffers. No file system writes occur outside `audio_cache/` and `output/`.
- **Rate Limiting:** The PoC does not implement rate limiting. In production, a retry-with-backoff wrapper around ElevenLabs API calls is recommended.

---

## 7. Dependencies

### 7.1 External Libraries

| Package | Version | Purpose |
|---------|---------|---------|
| `@elevenlabs/elevenlabs-js` | ^2.63.0 | Official ElevenLabs SDK for TTS and STT |
| `dotenv` | ^17.4.2 | Environment variable loading |
| `typescript` | ^5.0.0 | TypeScript compiler |
| `ts-node` | ^10.9.0 | TypeScript execution without pre-compilation |
| `@types/node` | ^20.0.0 | Node.js type definitions |
| `ffmpeg-static` | ^5.0.0 | Bundled ffmpeg binary for audio stitching |
| `fluent-ffmpeg` | ^2.1.0 | FFmpeg wrapper for audio processing |
| `@types/fluent-ffmpeg` | ^2.0.0 | TypeScript types for fluent-ffmpeg |

### 7.2 Node.js Built-in Modules

| Module | Usage |
|--------|-------|
| `crypto` | MD5 hash generation for cache keys |
| `fs` | File system operations (read/write/check cache) |
| `path` | Cross-platform path construction |
| `os` | Temporary directory access |
| `stream` | Stream consumption for audio buffers |

---

## 8. File Structure

```
elevenlabs/
├── docs/
│   ├── SDD.md                    ← This document
│   └── DEVELOPMENT_PLAN.md       ← Implementation roadmap
├── src/
│   ├── types.ts                  ← All TypeScript interfaces and constants
│   ├── audioManager.ts           ← ElevenLabs TTS/STT, MD5 caching, ffmpeg stitching
│   └── index.ts                  ← Main CLI entry point and pipeline orchestration
├── audio_cache/                  ← MD5-keyed MP3 cache directory
├── output/                       ← Generated podcast MP3 files
├── .env                          ← Environment variables (API key)
├── .gitignore                    ← Ignores .env, node_modules, audio_cache/
├── package.json                  ← Project manifest and scripts
├── tsconfig.json                 ← TypeScript compiler configuration (NodeNext)
└── README.md                     ← Project documentation
```

---

## 9. Assumptions & Constraints

| # | Assumption | Justification |
|---|-----------|---------------|
| A-01 | The `eleven_flash_v2_5` model is available in the user's ElevenLabs account. | Confirmed available in SDK v2.63.0; requires a paid account. |
| A-02 | The voice ID `JBFqnCBsd6RMkjVDRZzb` ("George") is accessible. | Available in the playground project's voice library. |
| A-03 | News mock data is sufficient for PoC validation. | The user specified a PoC; real news integration is a future enhancement (Non-Goal 1.1). |
| A-04 | Audio input for STT is provided as a file path. | Recording live audio from a microphone is out of scope (Non-Goal 1.2). |
| A-05 | Single-threaded execution is sufficient. | A daily podcast is generated once; no concurrency requirements. |

---

## 10. Acceptance Criteria

The PoC is considered complete when:

1. ✅ `npm run dev` executes without errors and generates at least one MP3 file in `output/`.
2. ✅ `npm run transcript` accepts an audio file path, transcribes it via `scribe_v1`, filters news by the extracted topic, and generates a podcast.
3. ✅ The intro/outro text blocks produce identical MD5 hashes across runs, proving the cache works.
4. ✅ Each script block is strictly < 250 characters (verified by runtime assertion).
5. ✅ The total credits estimated by the script matches the SDK's actual consumption within 2%.
6. ✅ Running the same command twice produces a second run with 0 credits consumed (all cache hits).
7. ✅ All TypeScript code compiles with `strict: true` and passes `tsc --noEmit`.
