# Automated Daily News Podcaster

A TypeScript-based CLI tool that transforms daily news headlines into a radio-style audio podcast using ElevenLabs' text-to-speech (`eleven_flash_v2_5`) and speech-to-text (`scribe_v1`) APIs.

## Features

- **Automated podcast generation**: Fetches news headlines and produces a radio-style MP3 podcast (Intro → 3 News Items → Outro).
- **Voice-driven topic filtering**: Speak a topic (e.g., "Technology news") and the system transcribes it via `scribe_v1` and filters news accordingly.
- **Credit-optimized caching**: MD5-based local disk cache eliminates redundant API calls — identical text is never synthesized twice.
- **Character limit enforcement**: Each script block is strictly capped at <250 characters for safety and granularity.
- **Ultra-lightweight model**: Uses `eleven_flash_v2_5` at 0.5 credits/char (the cheapest TTS model available).

## Architecture

```
Command Layer (STT / scribe_v1)
    ↓
Curation Layer (Script orchestration)
    ↓
Audio & Cache Layer (TTS + MD5 cache + ffmpeg stitching)
```

See [`docs/SDD.md`](docs/SDD.md) for the full Software Design Document and [`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md) for the implementation roadmap.

## Prerequisites

- Node.js >= 18
- npm >= 9
- ElevenLabs API key (with access to `eleven_flash_v2_5` and `scribe_v1` models)

## Setup

```bash
# Clone and navigate to the project directory
cd elevenlabs

# Install dependencies
npm install

# Set your API key
echo "ELEVENLABS_API_KEY=your_api_key_here" > .env
```

## Usage

```bash
# Generate a daily podcast with all news
npm run dev

# Generate a podcast filtered by topic
npm run dev:text

# Generate a podcast from a voice command (pre-recorded audio file)
npm run dev:voice

# Clear the audio cache
npm run dev:clear-cache

# Type-check without emitting
npm run typecheck
```

### CLI Options

| Flag | Description |
|------|-------------|
| `--topic <topic>` | Filter news by topic (e.g., `technology`, `sports`) |
| `--voice <path>` | Transcribe a voice command from an audio file and generate a podcast for the extracted topic |
| `--clear-cache` | Delete all cached audio files from `audio_cache/` |
| `--help`, `-h` | Display usage information |


### Voice Command from File (`--voice`)

```bash
npm run dev -- --voice /path/to/audio.wav
```

### Topic Filter (`--topic`)

```bash
npm run dev -- --topic technology
```

Supported topics: `technology`, `sports`, `politics`, `business`, `science`, `entertainment`, `health`.

## Project Structure

```
elevenlabs-POC/
├── docs/
│   ├── SDD.md                      ← Software Design Document
│   └── DEVELOPMENT_PLAN.md         ← Implementation roadmap
├── src/
│   ├── audioManager.ts             ← ElevenLabs TTS/STT, MD5 caching, ffmpeg stitching
│   ├── config/
│   │   └── env.ts                  ← Environment variables and constants
│   ├── core/
│   │   ├── newsPodcaster.ts        ← Podcast pipeline orchestration
│   │   └── scriptBuilder.ts        ← Script building (intro, news, outro)
│   ├── mocks/
│   │   └── MockNewsProvider.ts     ← Mock news data for PoC
│   ├── types/
│   │   └── index.ts                ← TypeScript interfaces and constants
│   ├── utils/
│   │   ├── functions.ts            ← Logging and utility helpers
│   │   └── voiceCommandParser.ts   ← Voice command topic extraction
│   └── index.ts                    ← CLI entry point and argument parsing
├── audio_cache/                    ← MD5-keyed MP3 cache directory
├── output/                         ← Generated podcast MP3 files
├── temp/                           ← Temporary recording files (auto-cleaned)
├── .env
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Credit Model

| Operation | Model | Cost |
|-----------|-------|------|
| Text-to-Speech | `eleven_flash_v2_5` | 0.5 credits/char |
| Speech-to-Text | `scribe_v1` | Billed per minute |
| Cache hit | N/A | 0 credits |

