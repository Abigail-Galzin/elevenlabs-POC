# Development Plan

## Automated Daily News Podcaster — Proof of Concept

**Plan Version:** 1.0  
**Date:** 2026-08-12  
**Author:** Senior Software Architect  
**Dependency:** Based on [SDD.md](./SDD.md)  

---

## Overview

This document outlines the step-by-step implementation plan for building the Automated Daily News Podcaster PoC. The plan is organized into 4 milestones, each delivering a testable increment of functionality.

---

## Milestone 1: Environment Setup

**Goal:** Establish a clean TypeScript project with all dependencies installed and runnable.

### Tasks

| # | Task | Details | Est. Time |
|---|------|---------|-----------|
| 1.1 | Create `package.json` | `npm init -y`, name: `daily-news-podcaster`, set `"type": "module"`. | 5 min |
| 1.2 | Install runtime dependencies | `npm install @elevenlabs/elevenlabs-js dotenv ffmpeg-static fluent-ffmpeg` | 5 min |
| 1.3 | Install dev dependencies | `npm install -D typescript ts-node @types/node @types/fluent-ffmpeg` | 5 min |
| 1.4 | Create `tsconfig.json` | Target: `ES2022`, Module: `NodeNext`, ModuleResolution: `NodeNext`, Strict mode, `resolveJsonModule: true`, `esModuleInterop: true`, `skipLibCheck: true`. | 10 min |
| 1.5 | Create `.env` file | `ELEVENLABS_API_KEY=sk_...` (from `my-playground-voice/.env`). | 2 min |
| 1.6 | Create `.gitignore` | Ignore `.env`, `node_modules/`, `audio_cache/`, `output/`. | 2 min |
| 1.7 | Create `README.md` | Project description, setup instructions, usage examples. | 10 min |
| 1.8 | Verify setup | Run `npx ts-node --version` to confirm TypeScript execution works. | 3 min |

### Verification

- `npx tsc --noEmit` passes with zero errors.
- `npx ts-node src/index.ts --help` displays CLI usage.

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
| 2.1 | Create `src/types.ts` | Define all interfaces: `NewsItem`, `ScriptBlock`, `PodcastScript`, `PodcastOutput`, `VoiceCommand`, `NewsProvider`, `SynthesisResult`. Include constants: `MAX_BLOCK_CHARS = 249`, `CREDITS_PER_CHAR = 0.5`, `ELEVENLABS_VOICE_ID`, `TTS_MODEL`, `STT_MODEL`. | 15 min |
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

- `src/types.ts` (full data contracts)
- `src/audioManager.ts` (complete `AudioManager` class)

---

## Milestone 3: Speech-To-Text Integration

**Goal:** Wrap the `scribe_v1` STT functionality with command parsing for voice-driven topic requests.

### Tasks

| # | Task | Details | Est. Time |
|---|------|---------|-----------|
| 3.1 | Implement `VoiceCommandParser` class | Takes transcribed text from `scribe_v1`. Extracts a topic keyword from a predefined list (`technology`, `sports`, `politics`, `business`, `science`, `entertainment`, `health`). Uses regex matching on the transcript. | 15 min |
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
| 4.5 | Implement CLI entry point in `src/index.ts` | Parse command-line arguments: `--topic <topic>`, `--voice <audio-file>`, `--clear-cache`, `--help`. Dispatch to the appropriate method on `NewsPodcaster`. | 20 min |
| 4.6 | Add structured logging | Use `console.log` with timestamp prefixes for: `INFO`, `WARNING`, `ERROR`. Log each phase's progress, cache hits/misses, and credit consumption. | 10 min |
| 4.7 | Add error handling | Catch and log ElevenLabs API errors, file system errors, and invalid input. Exit with non-zero code on failure. | 10 min |

### CLI Usage Examples

```bash
# Generate a daily podcast with all news
npx ts-node src/index.ts

# Generate a podcast filtered by topic
npx ts-node src/index.ts --topic technology

# Generate a podcast from a voice command
npx ts-node src/index.ts --voice /path/to/recording.wav

# Clear the audio cache
npx ts-node src/index.ts --clear-cache
```

### Verification

- `npx ts-node src/index.ts` generates `output/podcast_{timestamp}.mp3`.
- `npx ts-node src/index.ts --topic technology` filters news to technology items.
- Running the same command twice shows cache hit logging and 0 credits consumed.
- `--clear-cache` removes all files from `audio_cache/`.
- `tsc --noEmit` passes with zero errors.

### Deliverables

- `src/index.ts` (complete CLI + orchestration)
- End-to-end pipeline working
- Sample output podcast file

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
  └── E2E verification: npx ts-node src/index.ts
```

---

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ElevenLabs API rate limits | Medium | High | Cache aggressively; each unique text is synthesized only once. |
| ffmpeg not found on system | Low | High | Use `ffmpeg-static` which bundles the binary. |
| STT transcription accuracy | Medium | Medium | Use `scribe_v1` (highest accuracy); provide `--topic` as CLI fallback. |
| Audio stitching artifacts | Low | Medium | Use 0.5s silence between segments to mask transitions. |
| Cache directory permissions | Low | Low | Create directory with `mkdirSync({ recursive: true })`. |
| TypeScript strict mode errors | Medium | Low | Use `skipLibCheck: true` and explicit type annotations everywhere. |

---

## Testing Strategy

Since this is a PoC, testing will be lightweight:

1. **Compile-time verification:** `npx tsc --noEmit` with `strict: true`.
2. **Cache determinism test:** Run `synthesizeSpeech("test")` twice, verify the second call returns the cached file (0 credits).
3. **Character limit test:** Pass a 300-character string to `ScriptBuilder`, verify it is truncated to <250 chars.
4. **End-to-end smoke test:** Run `npx ts-node src/index.ts` and verify an MP3 file is produced in `output/`.
5. **STT smoke test:** Run `npx ts-node src/index.ts --voice sample.wav` and verify topic extraction.

---

## Next Steps (Post-PoC)

- Replace `MockNewsProvider` with a real RSS/NewsAPI integration.
- Add support for recording live audio via microphone (`navigator.mediaDevices` or a Node.js mic library).
- Add configurable voice selection (allow users to pick from available ElevenLabs voices).
- Implement scheduled daily execution (cron job / CI workflow).
- Add unit tests with Jest.
- Add a `--verbose` flag for debug-level logging.
