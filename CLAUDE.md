# CLAUDE.md — UBuddy operating notes

For Claude Code sessions in this repo. **Pick this up cold; everything you
need is here.** Read top-to-bottom before non-trivial work.

UBuddy is a Chromium MV3 extension (WXT + React) that reads UWorld questions
aloud, runs a context-aware chat about them, gameifies the answer flow, and
one-click-logs wrong answers to StepBuddy. **Personal-use only — one user, one
machine, local-only repo: no git remote, no CI, no Chrome Web Store listing.**

---

## Who / what

- **User: Rahul** — third-year Stanford med student, USMLE Step 2 CK exam
  **Mon Jun 22, 2026**. He drives you from the **Claude Code agents window**.
  He does **not** run commands or edit code himself. His *one* manual step in
  the entire loop is clicking the refresh icon on the UBuddy card in
  `chrome://extensions`. Design every task so that is genuinely all he has to
  do — anything more is a regression in the workflow.
- **Companion app:** wrong answers log to **StepBuddy v2**
  (`/Users/radev/Developer/stepbuddy-v2`, https://stepbuddy.devathulab.com) via
  the Supabase `log_mistake` RPC. Relevant only for the `src/stepbuddy/*`
  contract below; never edit that repo from here.

---

## Working agreement — read this first

1. **Start every task in a git worktree.** Call `EnterWorktree` before any
   edit. Rahul runs parallel agents; the shared checkout is his — never edit
   it directly.
2. **Finish, then land on `main`. Do not ask "shall I commit / merge?"** Rahul
   only ever tests from `main`, because the loaded extension builds from the
   primary checkout. So the pre-authorized, expected end state of *every* task
   is: work merged to `main` **and** `dist/chrome-mv3` rebuilt there. There is
   no remote and no deploy — "ship" means exactly those two things.
3. **Before landing, both gates must be green:** `bun run compile` (tsc
   typecheck, no JS) **and** `bun run build` (the real WXT prod build that
   produces `dist/chrome-mv3`). `bun run dev` is more forgiving than the prod
   build — trust `build`. Smoke UI changes on `bun run dev` if useful.
4. **End every task by telling Rahul exactly one thing:** *"Reload the UBuddy
   card at `chrome://extensions`."* Never make him remove/re-add the extension
   or re-pick a folder.
5. **Only stop to ask if something actually went wrong** — `build` fails and
   the fix is non-obvious; UWorld's DOM changed and you need a real sample
   (see "Asking the user vs. assuming"); a requirement is genuinely ambiguous;
   a step is destructive with no safe default. Otherwise: act, finish, ship.
6. **One tight question max** when truly blocked. Never surface incidentals
   (worktree branch names, build hashes, file counts, tsc timings).
7. **Default to action over consultation.** Rahul is studying while you work.

### Land-on-main sequence (worktree → `main` → fresh `dist/`)

From the worktree, once `bun run compile` and `bun run build` are both green:

```sh
git add -A
git -c commit.gpgsign=false commit -m "imperative subject

Optional short body explaining the why if non-obvious."
# (append the Co-Authored-By trailer per global instructions)

# Local repo, no remote: land on main in the PRIMARY checkout, then rebuild
# there so the loaded extension picks the change up.
git -C /Users/radev/Developer/UBuddy checkout main
git -C /Users/radev/Developer/UBuddy merge --no-ff worktree-<name>
( cd /Users/radev/Developer/UBuddy && bun run build )
```

- `-c commit.gpgsign=false` — signing can hang the non-interactive shell.
- Then `ExitWorktree` (remove); the work is already on `main`.
- **If the primary checkout has unrelated uncommitted work** that blocks
  `checkout main`, that *is* "something went wrong": surface the exact state
  and stop — never stash or discard Rahul's WIP to force the merge.
- The work is safe on the worktree branch regardless; only the merge + rebuild
  is what makes it testable.

### Build & reload reference

```bash
bun install
bun run dev      # HMR Chromium with the unpacked extension (smoke only)
bun run build    # → dist/chrome-mv3  (THIS is what Chrome loads)
bun run compile  # tsc --noEmit, no JS output (typecheck gate)
```

First-time load only: `chrome://extensions` → Developer mode → **Load
unpacked** → pick `dist/chrome-mv3` (NOT `.output` — `outDir` is `dist` in
`wxt.config.ts`, so the folder is selectable in the Finder dialog without
toggling hidden files). After that, every change is just **rebuild + refresh
icon** — no remove/re-add.

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
- **Exhibits are bare `<a>exhibit</a>` anchors inside `#questionText`** —
  Angular click handlers, no `href`, no class. `textContent` flattens them
  to a plain word so the user (especially in intense mode) blows right past
  them. `extractExhibits()` collects anchor labels from the stem container,
  skipping anchors inside the choice list and the `NON_EXHIBIT_ANCHOR`
  toolbar denylist (Mark Question / Lab Values / Tutorial / nav buttons —
  these only leak in via the rare choice-anchored fallback stem path).
  Verified against the captured `.mhtml`. Result lands in
  `ParsedQuestion.exhibits` and the panel renders a can't-miss flag.

### Labs (`src/uworld/labs.ts`)

- **`REF_RANGES` is the OFFICIAL USMLE/UWorld lab sheet, transcribed exactly**
  from the user's reference screenshots. Do NOT invent or "round" bounds.
  Only labs on the sheet are flagged; everything else the student reads off
  the screen ("parse only these values"). Each entry carries a `reference`
  string shown verbatim in the Objective Data panel.
- **Sex-varying labs use the UNION (broadest) range** for the high/low test
  (we don't know patient sex from a bare token) and keep the per-sex split
  in the `reference` string. False negatives > false positives here.
- **Vitals (BP/pulse/respirations/temp/SpO2) are NOT on the sheet** but are
  kept as objective data with standard physiologic cutoffs. Temperature is
  still always normalized to Fahrenheit — do not regress the C→F invariant.
- **Lipids/troponin/A1c use an open low bound (`-Infinity`)** — only the
  high direction is pathologic. HDL is the exception (low HDL is the
  finding), so it keeps a real low bound.

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

- **OpenRouter is the only TTS provider.** WebSpeech was removed because the
  network-backed Chromium voices silently ignore `utterance.rate`, making the
  speed slider feel broken. `loadSettings()` migrates any stale stored
  `ttsProvider: 'webspeech'` value back to `'openrouter'`.
- **One singleton provider per session.** `setActiveProvider()` is called from
  `App.tsx`'s `useEffect` whenever the API key changes. `speak()` and
  `speakChunk()` use `getActiveProvider()` — they MUST NOT create new providers
  per call. If they do, each gets its own queue and `playing` flag, and 5
  sentences play simultaneously instead of sequentially. This was a real bug.
- **Speed is applied client-side via `audio.playbackRate`.** OpenRouter's
  server-side `speed` param is honored only by OpenAI TTS — Gemini, ElevenLabs,
  etc. ignore it. We set `audio.playbackRate = rate` and `preservesPitch = true`
  on the HTMLAudioElement so the slider behaves identically across every TTS
  model. NEVER also send server-side `speed`: doing both compounds (slider at
  1.5x → 2.25x perceived speed on OpenAI).
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

### StepBuddy mistake-log (`src/stepbuddy/*`)

Pushes a **wrong** answer to the user's StepBuddy via the Supabase
`log_mistake` Postgres RPC **only on an explicit button click** — there is NO
auto-logger. There is NO custom server — calls go straight to Supabase Auth +
REST.

- **No `@supabase/supabase-js` dependency.** `client.ts` is raw `fetch`. The
  SDK's GoTrue client wants `localStorage` + a `setInterval` auto-refresh,
  neither reliable in MV3. We persist `{accessToken, refreshToken, expiresAt}`
  in `chrome.storage.local` under `ubuddy.stepbuddy.session` and refresh
  **lazily, on demand** (`ensureAccessToken` checks expiry right before each
  call) — never on a timer, because the panel/SW can be torn down anytime.
- **The publishable key is public by design** (ships in StepBuddy's web
  client) so it's hardcoded in `client.ts`. The user's email+password live in
  `AppSettings` (same posture as `openrouterApiKey`) so the session can be
  silently re-minted if the refresh token is ever rejected.
- **The RPC has NO upsert — every call inserts a row.** Dedup is mandatory and
  lives ONLY in `log.ts:logWrongAnswer`: guarded by the persisted
  `QuestionRecord.stepbuddyMistakeId` (survives SPA re-emit / panel reopen)
  PLUS an in-memory in-flight `Set` (covers the gap before the id is
  persisted). Never call `logMistake` directly from a component.
- **`stepbuddyMistakeId` is NOT a Dexie index** — it's a plain field, so
  adding it needed no schema version bump. Don't add it to `.stores()`.
- **UWorld exposes no subject taxonomy in anything we parse.** So there's
  nothing to "map" — `classify.ts` asks the configured OpenRouter LLM to read
  the official explanation and emit strict JSON `{system_tag, miss_type,
  rule}`. Every field is hard-coerced against `SYSTEM_TAGS` / `MISS_TYPES`
  (fallback `Misc` / `knowledge`) before send; the RPC validates too but a bad
  value there costs a round-trip + thrown error.
- **One trigger, one dedup.** The ONLY path to StepBuddy is ReflectionForm's
  explicit "Save & log to StepBuddy" button (and its on-error retry). The
  student's `keyLearning` is the rule; the LLM (`classify.ts`) only supplies
  `system_tag` and a *fallback* rule when they leave the textarea blank. There
  is deliberately no auto-log on `explanation:shown` — that race made the LLM
  guess almost always win on a write-once RPC, burying the student's words.
  Single explicit write = their words always land, no update RPC needed. Dedup
  still matters: double-click, retry-after-partial-success, and SPA re-emit /
  panel reopen are all guarded in `log.ts` (persisted id + in-flight set).
- **No-LLM fallback:** with no chat model selected, `classify.ts` can't run, so
  the student's `keyLearning` IS the rule (`whyWrong` → `miss_type` via
  `mapWhyWrong`, system = `Misc`). If they also leave `keyLearning` blank,
  `logWrongAnswer` returns an error (nothing defensible to send) and the
  button surfaces it — local reflection is still saved either way.
- **`SYSTEM_TAGS` / `MISS_TYPES` / `SOURCES` mirror StepBuddy's
  `lib/constants.ts`.** If StepBuddy changes those, update `client.ts` AND the
  `classify.ts` prompt in lockstep — the RPC migration moves with them.
- **Status is one Zustand slice** (`stepbuddy: {status, message}`), reset by
  `setQuestion()` like the other per-question scratch state. App.tsx renders
  it as a banner.

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
  still have the old value. `loadSettings()` has a `migrate()` step for known
  removals (currently just `ttsProvider: 'webspeech' → 'openrouter'`); add to
  it when a field disappears or its semantics change.
- **OpenRouter SSE error frames.** If the model errors mid-stream, OpenRouter
  sends an SSE event with `{ error: { message: ... } }`. `streamChat` checks
  for `json.error` per frame and reports — make sure new SSE consumers do too.
- **`chrome.storage.local` size limit is 5MB by default.** Models catalog can
  be ~2MB. We're fine but don't pile more in.
- **StepBuddy email+password are stored plaintext in `ubuddy.settings`** and
  the live session token under `ubuddy.stepbuddy.session`. Same posture as the
  OpenRouter key (personal-use extension, never injected into the page). If you
  ever add cloud sync of settings, exclude these keys.
- **StepBuddy fetches go from the side panel, not a content script.** The
  panel is a privileged extension page with the Supabase host in
  `host_permissions`, so it's not CORS-blocked (content scripts would be).

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
    labs.ts              # regex extractor + OFFICIAL USMLE reference table + C→F conversion
  panel/
    QuestionView.tsx     # stem display only (verbatim or intense summary)
    ObjectiveData.tsx    # exhibit/image flag + parsed vitals & labs w/ ref ranges
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
  stepbuddy/
    client.ts            # Supabase auth (raw fetch) + log_mistake RPC + enum lists
    classify.ts          # LLM → {system_tag, miss_type, rule}; whyWrong→miss_type map
    log.ts               # logWrongAnswer — the ONLY entry point; owns dedup
  tts/
    provider.ts          # interface + active-provider singleton
    openrouter.ts        # OpenRouter audio + SentenceStream + format fallback + WAV wrapper + client-side playbackRate
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
- **TTS pre-warm.** First TTS request after panel open has higher latency
  than subsequent ones. A silent dummy request on panel open would mask it.
- **Cross-browser.** Currently Chromium-only (uses `chrome.sidePanel`).
  Firefox port would need `sidebarAction` + the WebExtensions polyfill.

## When something feels off

1. **Build fails:** run `bun run compile` first — it isolates type errors from
   WXT bundling. Prod-only breakage that `bun run dev` swallows shows up in
   `bun run build`.
2. **Extension stale / not loading:** confirm `dist/chrome-mv3` was rebuilt
   *on `main`* (working-agreement step 2), then refresh icon. A stale `dist/`
   left by another branch is the usual culprit — not a code bug.
3. **Parser stopped matching:** UWorld changed their DOM. Don't guess —
   `src/uworld/selectors.ts` is the only file to touch, and you need a real
   sample (see below). The `.mhtml` capture is ground truth.
4. **Settings wrong after a code change:** stale `chrome.storage.local`
   survives reloads — check `loadSettings()`'s `migrate()` step.
5. **TTS / LLM 4xx:** an OpenRouter quirk — the OpenAPI spec at
   `/Users/radev/Downloads/openapi.yaml` is authoritative; also check SSE
   error frames (`{ error: { message } }`).
6. **StepBuddy log fails:** auth/session. `src/stepbuddy/log.ts` owns the only
   path and all dedup; the RPC contract mirrors
   `stepbuddy-v2/lib/constants.ts` — they move in lockstep.

## Asking the user vs. assuming

UWorld's DOM is the highest-risk surface. If something doesn't parse, **ask
the user to inspect a real question and paste the relevant DOM** rather than
guessing. The `.mhtml` capture in `/Users/radev/Downloads/UWorld USMLE.mhtml`
(if still present) is ground truth.

For OpenRouter quirks (new providers, format constraints, etc.), the
authoritative reference is the OpenAPI spec the user has at
`/Users/radev/Downloads/openapi.yaml`. Search it before guessing.
