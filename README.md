# UBuddy

Voice + AI study companion for UWorld. A Chrome side-panel extension that:

- Reads questions aloud with two verbosity modes
- Gives a context-aware chat about every question (auto-prefixed with the stem,
  choices, your pick, the correct answer, and the official explanation)
- Celebrates correct answers; captures a one-line reflection on misses
- Tracks streaks and accuracy locally

Built for personal study. Do not redistribute.

## Setup

```bash
bun install
bun run build              # produces dist/chrome-mv3
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable Developer mode
3. **Load unpacked** → pick `dist/chrome-mv3`
4. Click the UBuddy toolbar icon (or hit `Cmd+Shift+U`) to open the side panel
5. In **Settings**, paste your [OpenRouter](https://openrouter.ai) API key,
   click **Load models**, pick a chat model and a TTS model + voice, and Save

For development:

```bash
bun run dev                # WXT launches Chrome with HMR
bun run compile            # tsc --noEmit
```

## Keyboard shortcuts

| Shortcut             | Action                    |
| -------------------- | ------------------------- |
| `Cmd/Ctrl+Shift+U`   | Toggle the side panel     |
| `Cmd/Ctrl+Shift+R`   | Read the current question |

## Two reading modes

### Verbatim

TTS reads the question stem and answer choices word-for-word. Use when you
want everything literally spoken to you. Works with the free Web Speech API
(no key needed) or any OpenRouter TTS model.

### Intense

Optimized for blazing through questions. The LLM produces a tight, single-
paragraph clinical summary in ~30 seconds of audio:

- Lead sentence: age, sex, key history, chief complaint — telegraphic
- Pertinent positives and negatives the stem volunteers
- The actual question restated verbatim at the end

Notable design choices:

- **Choices are NOT read aloud** — you read them on screen yourself
- **No units** anywhere in the audio (no "millimeters of mercury", "Celsius",
  "milligrams per deciliter") — TTS reads bare numbers
- **All temperatures in Fahrenheit** — Celsius values from the stem are
  auto-converted at parse time
- **Cannot leak the answer** — the stem is sliced at any spoiler marker
  (`Explanation:`, `Educational objective:`, `Correct answer`,
  `This patient has`) before the LLM ever sees it
- **Time-to-first-audio ~500ms** — long sentences are sub-chunked at clause
  boundaries so the first ~30-60 chars play while the rest fetch in parallel

Both modes share TTS settings: provider (Web Speech or OpenRouter), model,
voice, speech rate.

## Picking models

In Settings, click **Load models**. UBuddy hits OpenRouter's `/models`
endpoint, partitions the catalog into Chat (text out) and TTS (audio out /
has `supported_voices`), and shows two filterable pickers with live pricing
per million tokens.

When you pick a TTS model, its `supported_voices` populate as a dropdown.
PCM-only providers (e.g., Gemini TTS) are auto-detected by model id and
served as `pcm` wrapped in a WAV header so playback works through the
standard `<audio>` element.

The catalog is cached in `chrome.storage.local` for 24h.

## Privacy

- Your OpenRouter key lives in `chrome.storage.local` (browser-local). It's
  never injected into the UWorld page.
- All API calls originate from the side panel, not the page context.
- Question history and reflections live locally in IndexedDB. Nothing is
  uploaded.

## Architecture (one screen)

```
┌─ UWorld tab ─────┐    ┌─ Background SW ─┐    ┌─ Side Panel ─────┐
│ content.ts       │    │ background.ts    │    │ App.tsx          │
│ - parser         │◀──▶│ - opens panel    │◀──▶│ - read flow      │
│ - MutationObs    │    │ - keyboard cmds  │    │ - TTS pipeline   │
│ - click forward  │    │ - msg router     │    │ - chat / settings│
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

Detailed file tour and design invariants live in [CLAUDE.md](CLAUDE.md).

## Stack

- [WXT](https://wxt.dev/) — extension framework (MV3, TypeScript, HMR)
- React 19 + plain CSS (no Tailwind in v1; one self-contained panel)
- Zustand for app state, Dexie for IndexedDB
- OpenRouter for LLM (chat completions, streaming) and TTS (`/audio/speech`)
- Web Speech API as a free TTS fallback

## Limits and known issues

- Chromium-only (uses `chrome.sidePanel`). Firefox port would need
  `sidebarAction`.
- No automated tests yet — see CLAUDE.md "Open issues / future work".
- UWorld's DOM occasionally changes; if the panel shows
  `Parser can't find: …`, edit `src/uworld/selectors.ts` and rebuild.
