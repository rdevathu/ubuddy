# UBuddy — Notes for future Claude sessions

A Chrome extension that reads UWorld questions aloud, gives a context-aware
chat about them, and gameifies the answer flow. Personal-use only.

## How to run

```bash
bun install
bun run dev      # HMR Chrome with the unpacked extension
bun run build    # produces dist/chrome-mv3
bun run compile  # tsc --noEmit (no JS output)
```

Loading the production build: open `chrome://extensions`, enable Developer mode,
**Load unpacked** → pick `dist/chrome-mv3` (NOT `.output` — `outDir` is `dist`
in `wxt.config.ts` so the folder is selectable in the Finder dialog without
toggling hidden files).

To test changes: `bun run build`, then hit the refresh icon on the UBuddy card
in `chrome://extensions`. No need to remove/re-add.

## Architecture in one screen

```
┌─ uworld.com tab ─┐    ┌─ Background SW ─┐    ┌─ Side Panel ─────┐
│ entrypoints/     │    │ entrypoints/     │    │ entrypoints/     │
│   content.ts     │◀──▶│   background.ts  │◀──▶│   sidepanel/     │
│                  │    │                  │    │     App.tsx      │
│ src/uworld/      │    │ - opens panel    │    │ src/panel/*      │
│   selectors.ts   │    │ - keyboard cmds  │    │ src/llm/*        │
│   parser.ts      │    │ - routes msgs    │    │ src/tts/*        │
│   observer.ts    │    │                  │    │ src/state/*      │
│   labs.ts        │    │                  │    │ src/storage/*    │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

- **Content script** (`entrypoints/content.ts`) runs on `*.uworld.com`. It owns
  the `UWorldObserver` (MutationObserver wrapper) and broadcasts question /
  explanation events as DOM changes settle. It also handles `panel:requestParse`
  pull requests from the side panel.
- **Background SW** (`entrypoints/background.ts`) is mostly a thin shim: opens
  the side panel via `chrome.sidePanel`, wires `chrome.commands` keyboard
  shortcuts, forwards them to the panel as runtime messages.
- **Side panel** (`entrypoints/sidepanel/App.tsx` + `src/panel/*`) is where all
  the work happens — UI, TTS playback, LLM streaming, settings, history.
- **Messaging** (`src/messaging/*`) is a small typed wrapper over
  `browser.runtime.sendMessage` / `onMessage`. Use the typed `RuntimeMessage`
  union; never send untyped messages.

## Key invariants — break these and things break in subtle ways

### Parser

- **`#questionText` is UWorld's stem container.** It's the primary selector and
  is guaranteed clean — no toolbar, no explanation. Always prefer this over
  any class-based fallback.
- **`#answerContainer` (table) wraps all choices.** Each `<tr class="answer-choice-background">`
  is one choice. Each row has its OWN `<mat-radio-group role="radiogroup">` —
  there is NO single radiogroup wrapping all choices. So a generic
  `[role="radiogroup"]` query returns just the first choice's radio.
- **The choice-anchored walk-back is a fallback only.** When the primary
  `#questionText` selector fails (rare), we anchor on the choice list and
  collect text before it in DOM order. This walk is depth-capped at 5 and
  size-capped at 8000 chars; without those caps it climbs to the page wrapper
  and starts including the explanation panel.
- **Selectors live in ONE file: `src/uworld/selectors.ts`.** Every other file
  imports from there. When UWorld changes their DOM, that's the only file to
  edit.
- **Parse only emits if the result is "complete".** `parseQuestion` returns
  `null` if there are <2 choices or every choice has empty text. The
  `MutationObserver` will retry on the next tick. This avoids broadcasting a
  half-rendered skeleton parse that gets dedup-locked by the hash check.
- **`stripStemNoise()` cleans the stem.** It's the regex blacklist for
  UWorld UI artifacts: "Mark Question", "Item: 1 of 28", "Question Id: …",
  "Time Spent", "Answered (in)?correctly", "Block Time Elapsed: …", etc.
- **`stripExplanationNoise()` additionally cuts the trailing references /
  Medical Library / Copyright block.**

### Observer (`src/uworld/observer.ts`)

- `refresh()` MUST NOT broadcast. It returns the parsed payload directly. If
  it broadcasts, the side panel re-receives `question:loaded`, calls
  `requestParse` again, which calls `refresh()` again, → infinite loop. This
  was a real bug. The only place `onQuestion` fires is inside `scan()` when
  the content hash actually changed.
- The MutationObserver is on `document.body` with `childList: true,
  subtree: true, characterData: true`. Debounced 200ms.
- Dedup is by `hashStem(stem)` — a content hash, not a URL or counter. This
  survives UWorld's SPA navigation between questions.

### TTS (`src/tts/*`)

- **One singleton provider per session.** `setActiveProvider()` is called from
  `App.tsx`'s `useEffect` based on settings. `speak()` and `speakChunk()` use
  `getActiveProvider()` — they MUST NOT create new providers per call. If they
  do, each gets its own queue and `playing` flag, and 5 sentences play
  simultaneously instead of sequentially. This was a real bug.
- **Playback is a serial promise chain.** `playChain = playChain.then(...)`.
  Each step awaits its own fetch (parallel) then the previous step's audio
  ending (serial). Strictly in order, no overlap.
- **`SentenceStream` does clause-grade chunking.** First emittable chunk is
  ~30-60 chars even if the full sentence is 200+ chars. This is how we get
  fast "time to first audio" — without it, the whole first sentence has to
  finish generating + fetch before any audio plays.
- **`stripMarkdownLive` runs at buffer level.** Cheap LLM models love adding
  `## Clinical Summary` / `**bold**` / bullets. We strip them in the buffer
  before sentence extraction.
- **PCM models (Gemini) need a WAV wrapper.** `pcmToWavBlob()` prepends a
  44-byte WAV header to the raw bytes (24kHz mono 16-bit LE) so it plays
  through `<audio>` like an mp3. `pickResponseFormat()` chooses mp3 vs pcm by
  model name. `fetchWithFallback()` retries with the opposite format if the
  provider 400s with `response_format` in the error body.
- **Session counter on `stop()`.** Late-arriving fetches from a previously
  stopped read check `mySession !== session` and bail. Without this, hitting
  Stop and then Read again could replay stale audio from the prior read.

### LLM (`src/llm/*`)

- **OpenRouter, OpenAI-compatible.** `streamChat()` in `src/llm/client.ts`
  uses fetch + SSE parsing. Headers `HTTP-Referer` and `X-Title` are
  required by OpenRouter for ranking.
- **API keys live in `chrome.storage.local`.** Never inject them into the
  page. All LLM/TTS calls originate from the side panel (privileged context).
- **Models are discovered, not hardcoded.** `src/llm/models.ts:fetchModels()`
  hits `GET /models?output_modalities=all` and partitions into LLM (text out)
  and TTS (audio out / `supported_voices`). Cached 24h in
  `chrome.storage.local` under key `ubuddy.models`.
- **DEFAULT_SETTINGS.llmModel and ttsModel are EMPTY strings.** The UI forces
  the user to pick from the live catalog. This is intentional — hardcoded
  slugs go stale (`groq/llama-3.3-70b-versatile` → wrong, real OpenRouter
  slug is `meta-llama/llama-3.3-70b-instruct`).

### Intense mode (`src/llm/prompts.ts:intensePrompt`)

This is the user's "blaze through questions" mode. The prompt is opinionated.
Read carefully before changing it.

- **No answer choices in output.** The student reads them on screen.
- **Restate the actual question verbatim at the end.** We pre-extract the
  last interrogative sentence from the stem (`extractQuestionLine`) and pass
  it as a separate field with explicit instruction to restate it.
- **No units, ever.** `summarizeLabsForLLM()` strips units before the LLM
  sees them, and the prompt forbids the model from re-introducing them. BP
  "80/50" is rendered "80 over 50" preemptively.
- **All temps in Fahrenheit.** `extractLabs()` detects Celsius and converts
  at parse time. The LLM never sees a Celsius value.
- **`sanitizeStemForIntense()` cuts the stem at any spoiler marker** —
  `Explanation:`, `Educational objective:`, `Correct answer`, or
  `This patient (most likely) has` — before showing the LLM. Even if the
  parser leaks explanation, the prompt builder slices it off.
- **Markdown is forbidden in the prompt with a worked example** of the exact
  expected tone. Cheap models imitate examples even when they ignore rules.

### Verbosity types

`Verbosity = 'verbatim' | 'intense'`. Anywhere you see `'intern'` left over,
it's a stale reference and should be `'intense'`.

## State

- **Settings**: `chrome.storage.local` under `ubuddy.settings`. See
  `src/types/index.ts:DEFAULT_SETTINGS`. Watched via
  `src/storage/settings.ts:watchSettings()` so cross-tab edits propagate.
- **Question history + reflections**: IndexedDB via Dexie, schema in
  `src/storage/db.ts`. One table: `questions`. `streakStats()` derives
  `{ total, correct, current }` for the header pill.
- **In-memory app state**: Zustand in `src/state/store.ts`. `setQuestion()`
  resets `selectedLetter`, `explanation`, `intenseSummary`, `reflection`,
  and (if `resetChatOnNewQuestion`) `chat` — by design, opening a new
  question wipes per-question scratch state.

## Logging conventions

Every log line is prefixed with the subsystem: `[ubuddy:content]`,
`[ubuddy:bg]`, `[ubuddy:panel]`, `[ubuddy:llm]`, `[ubuddy:tts]`,
`[ubuddy:models]`. The TTS module additionally logs a per-chunk timing trace:

```
[ubuddy:tts] ⏱ #0 fetch start  +0ms  "<text>"
[ubuddy:tts] ⏱ #0 fetch end    +420ms
[ubuddy:tts] ⏱ #0 play start   +422ms  (waited 240ms for fetch)
[ubuddy:tts] ⏱ #0 play end     +3200ms
```

This is intentionally verbose — when something goes sideways the user
copy-pastes these and we can pinpoint exactly which stage is slow.

## Theme

Color tokens in `src/styles/panel.css` are sampled from UWorld's own dark-mode
CSS vars (verified by inspecting an exported `.mhtml`):

- `--brand: #004976` — UWorld's deep navy toolbar color
- `--accent: #52a6fc` — UWorld's link blue
- `--accent-strong: #94eaff` — UWorld's icon cyan
- `--bg / --bg-elev / --bg-hi: #1e1e1e / #2a2a2a / #3c4150` — matches
  `--docked-window-content-bg`, `--docked-window-header-bg`,
  `--vignette-descriptor` respectively

Don't introduce ad-hoc colors. Reuse these tokens.

## Things to watch out for

- **WXT auto-imports `browser` and `defineBackground` / `defineContentScript`.**
  Don't import them manually.
- **`chrome.sidePanel` is not in the WebExtensions polyfill types.** Either
  declare it locally (see `entrypoints/background.ts`) or `(globalThis as any).chrome`.
- **Stale settings in `chrome.storage.local` survive code changes.** When a
  default value changes (e.g., the LLM model slug), users with prior saves
  still have the old value. Either add a migration or surface a "reset to
  defaults" affordance — currently we don't.
- **OpenRouter SSE error frames.** If the model errors mid-stream, OpenRouter
  sends an SSE event with `{ error: { message: ... } }`. `streamChat` checks
  for `json.error` per frame and reports — make sure new SSE consumers do too.
- **`chrome.storage.local` size limit is 5MB by default.** Models catalog can
  be ~2MB. We're fine but don't pile more in.

## File tour

```
entrypoints/
  background.ts          # tiny shim: panel open, keyboard commands
  content.ts             # MutationObserver host + message handler
  sidepanel/
    index.html
    main.tsx             # React mount
    App.tsx              # ROOT — message routing, read flow, intense streaming

src/
  uworld/
    selectors.ts         # SINGLE source of truth — DOM selectors
    parser.ts            # parseQuestion, parseExplanation, forwardClick, selectorHealth
    observer.ts          # UWorldObserver — MutationObserver wrapper
    labs.ts              # regex extractor + reference range table + C→F conversion
  panel/
    QuestionView.tsx     # stem display (verbatim or intense summary) + abnormal pills
    AnswerList.tsx       # variable-count answer buttons
    TTSControls.tsx      # play/stop + verbosity dropdown
    ChatBox.tsx          # streaming LLM chat with auto-context
    ReflectionForm.tsx   # wrong-answer reflection (dropdown + textarea)
    Celebration.tsx      # canvas-confetti + streak display
    SettingsPanel.tsx    # API key, model picker, voice, etc.
  llm/
    client.ts            # OpenRouter streamChat (SSE)
    models.ts            # GET /models discovery + cache
    prompts.ts           # intensePrompt, chatSystemPrompt, sanitizeStemForIntense
  tts/
    provider.ts          # interface + active-provider singleton
    openrouter.ts        # OpenRouter audio + SentenceStream + format fallback + WAV wrapper
    webSpeech.ts         # free fallback using macOS system voices
  state/
    store.ts             # Zustand
  storage/
    db.ts                # Dexie schema (questions table)
    settings.ts          # chrome.storage wrapper
  messaging/
    types.ts             # discriminated-union RuntimeMessage
    bus.ts               # send / sendToTab / on / onAny helpers
  styles/
    panel.css            # CSS variables + layout
  types/
    index.ts             # AppSettings, ParsedQuestion, AnswerChoice, etc.
```

## Open issues / future work

These are real but deliberately not addressed yet:

- **No tests.** Manual fixture HTML in `/dev` is a future thing; the parser
  badly wants snapshot tests against the captured `.mhtml`.
- **No spaced repetition / review surface.** Reflections persist but there's
  no "show me my recent misses" beyond the small history list in Settings.
- **No keyboard shortcut to pick an answer.** Number keys 1-5 would be ideal
  for blazing-through workflow.
- **Settings migration story.** When a default changes, prior users keep
  their stale value. Add a versioned migration in `loadSettings`.
- **TTS pre-warm.** First TTS request after panel open has higher latency
  than subsequent ones. A silent dummy request on panel open would mask it.
- **Cross-browser.** Currently Chromium-only (uses `chrome.sidePanel`).
  Firefox port would need `sidebarAction` + the WebExtensions polyfill.

## Asking the user vs. assuming

UWorld's DOM is the highest-risk surface. If something doesn't parse, **ask
the user to inspect a real question and paste the relevant DOM** rather than
guessing. The `.mhtml` capture in `/Users/radev/Downloads/UWorld USMLE.mhtml`
(if still present) is ground truth.

For OpenRouter quirks (new providers, format constraints, etc.), the
authoritative reference is the OpenAPI spec the user has at
`/Users/radev/Downloads/openapi.yaml`. Search it before guessing.
