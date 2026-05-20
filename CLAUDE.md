# CLAUDE.md — UBuddy operating notes

For Claude Code sessions in this repo. **Pick this up cold; everything you
need is here.** Read top-to-bottom before non-trivial work.

UBuddy is a Chromium MV3 extension (WXT + React) that runs alongside
UWorld, generates an optional tight LLM "blaze-through" summary of the
stem, offers a context-aware chat, and one-click-logs every graded
question — wrong **or** right — to StepBuddy with the student's own
takeaway. (Audio/voice read-aloud existed in v0; it is **fully removed**.
See "Audio/voice — REMOVED".) **Distribution model: a public GitHub repo at
https://github.com/rdevathu/ubuddy that a small handful of friends `git
clone` + `git pull` to update. No Chrome Web Store listing, no CI. The
built `dist/chrome-mv3/` is committed so friends never run `bun`.**

---

## Who / what

- **User: Rahul** — third-year Stanford med student, USMLE Step 2 CK exam
  **Mon Jun 22, 2026**. He drives you from the **Claude Code agents window**.
  He does **not** run commands or edit code himself. His *one* manual step in
  the entire loop is clicking the refresh icon on the UBuddy card in
  `chrome://extensions`. Design every task so that is genuinely all he has to
  do — anything more is a regression in the workflow.
- **Companion app:** every graded UWorld question logs to **StepBuddy v2**
  (`/Users/radev/Developer/stepbuddy-v2`, https://stepbuddy.devathulab.com) via
  the Supabase `log_mistake` RPC. Relevant only for the `src/stepbuddy/*`
  contract below; never edit that repo from here. Read its CLAUDE.md when
  you need the RPC's full schema or the canonical enum lists.

---

## Working agreement — read this first

1. **Start every task in a git worktree.** Call `EnterWorktree` before any
   edit. Rahul runs parallel agents; the shared checkout is his — never edit
   it directly.
2. **Finish, then land on `main`, then push. Do not ask "shall I commit /
   merge / push?"** Rahul only ever tests from `main`, because the loaded
   extension builds from the primary checkout. So the pre-authorized, expected
   end state of *every* task is: work merged to `main`, `dist/chrome-mv3/`
   rebuilt **and committed** there, and `git push origin main` so friends can
   `git pull` the update. "Ship" means exactly those three things — without the
   push, the friends' copies go stale.
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

### Land-on-main sequence (worktree → `main` → fresh `dist/` → `git push`)

From the worktree, once `bun run compile` and `bun run build` are both green:

```sh
# Bump version in package.json per semver (see "Versioning" below) BEFORE
# committing — fixes = patch, features = minor, breaking parser/state = major.
# WXT reads the version from package.json into the built manifest.

git add -A
git -c commit.gpgsign=false commit -m "imperative subject

Optional short body explaining the why if non-obvious."
# (append the Co-Authored-By trailer per global instructions)

# Land on main in the PRIMARY checkout, rebuild there so the committed
# dist/chrome-mv3/ tracks the new version, then push so friends can pull.
git -C /Users/radev/Developer/UBuddy checkout main
git -C /Users/radev/Developer/UBuddy merge --no-ff worktree-<name>
( cd /Users/radev/Developer/UBuddy && bun run build )
git -C /Users/radev/Developer/UBuddy add dist/chrome-mv3
git -C /Users/radev/Developer/UBuddy -c commit.gpgsign=false commit -m "build: dist for vX.Y.Z" --allow-empty
git -C /Users/radev/Developer/UBuddy push origin main
```

- `-c commit.gpgsign=false` — signing can hang the non-interactive shell.
- The `--allow-empty` on the dist commit is a safety net for tasks that
  don't change emitted bundle bytes (rare — version stamp alone changes the
  manifest, so it's almost always a real commit). Skip the commit step
  entirely if `git status` shows `dist/chrome-mv3` clean after `bun run build`.
- Then `ExitWorktree` (remove); the work is already on `main` and pushed.
- **If the primary checkout has unrelated uncommitted work** that blocks
  `checkout main`, that *is* "something went wrong": surface the exact state
  and stop — never stash or discard Rahul's WIP to force the merge.
- **If `git push` fails on auth**, surface the exact error and stop. Don't
  retry, don't `--force`, don't change remotes.
- The work is safe on the worktree branch regardless; only the merge +
  rebuild + push is what makes it testable for Rahul and his friends.

### Versioning

- **`package.json` `version` is the single source of truth.** WXT reads it
  into `manifest.json`. `wxt.config.ts` no longer hardcodes a version.
- **Bump per task, semver:** patch for bug fixes / parser tweaks / copy
  changes, minor for new user-visible features, major for breaking changes
  to state shape, the StepBuddy contract, or anything that requires friends
  to do more than just refresh the extension.
- Chrome's only hard rule is that the manifest version must strictly
  increase between loads of the same extension — once shipped, never lower
  the version, never re-use a number.

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

---

## Stack

| | |
|--|--|
| Extension framework | WXT 0.20 (MV3, TypeScript, HMR) + `@wxt-dev/module-react` |
| UI                  | React 19 + plain CSS (one file: `src/styles/panel.css`) — no Tailwind |
| App state           | Zustand (`src/state/store.ts`) |
| Local persistence   | Dexie / IndexedDB (`src/storage/db.ts`, one `questions` table) + `chrome.storage.local` for settings + the StepBuddy session |
| LLM                 | OpenRouter chat completions, raw `fetch` + SSE parsing (`src/llm/client.ts`). **Model pinned** in `src/llm/model.ts` — no discovery, no picker |
| StepBuddy I/O       | Supabase Auth (raw `fetch`) + the `log_mistake` Postgres RPC. **No `@supabase/supabase-js`** (its GoTrue client wants `localStorage` + a timer, both unreliable in MV3) |
| Runtime targets     | Chromium-only today (uses `chrome.sidePanel`). WXT can build Firefox but the `sidebarAction` work hasn't been done |

Why: zero ops, no server, no API key Rahul has to share. Every privileged
call (LLM, Supabase) originates from the side panel, never injected into
the page.

---

## Architecture in one screen

```
┌─ uworld.com tab ─┐    ┌─ Background SW ─┐    ┌─ Side Panel ─────┐
│ entrypoints/     │    │ entrypoints/     │    │ entrypoints/     │
│   content.ts     │◀──▶│   background.ts  │◀──▶│   sidepanel/     │
│                  │    │                  │    │     App.tsx      │
│ src/uworld/      │    │ - opens panel    │    │ src/panel/*      │
│   selectors.ts   │    │   on icon click  │    │ src/llm/*        │
│   parser.ts      │    │                  │    │ src/state/*      │
│   observer.ts    │    │                  │    │ src/storage/*    │
│   labs.ts (data) │    │                  │    │ src/stepbuddy/*  │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

- **Content script** (`entrypoints/content.ts`) runs on `*.uworld.com`. It owns
  the `UWorldObserver` (MutationObserver wrapper) and broadcasts question /
  explanation events as DOM changes settle. It also handles `panel:requestParse`
  pull requests from the side panel.
- **Background SW** (`entrypoints/background.ts`) is a thin shim: configures
  `chrome.sidePanel` to open on action-icon click. No keyboard commands —
  the user opens the panel by clicking the pinned toolbar icon. (Chrome's
  keyboard-shortcut support for `chrome.commands` is flaky in MV3 side
  panels — `chrome.sidePanel.open()` requires a user gesture and command
  invocations don't reliably qualify, so the shortcut was removed.)
- **Side panel** (`entrypoints/sidepanel/App.tsx` + `src/panel/*`) is where
  all the user-facing work happens — summary, chat, log card, settings,
  history.
- **Messaging** (`src/messaging/*`) is a small typed wrapper over
  `browser.runtime.sendMessage` / `onMessage`. Use the typed `RuntimeMessage`
  union; never send untyped messages.

---

## Panel surfaces (what the student actually sees)

| Surface | What |
|---|---|
| Header                  | Brand + a `Streak` pill showing current correct streak, total seen, and accuracy %. |
| Parser-health banner    | Renders only when `selectorHealth()` fails — names the missing selectors so it's obvious which `selectors.ts` entry to fix. |
| StepBuddy banner        | "Logging to StepBuddy…" / "StepBuddy: <error>" pulled from the `stepbuddy` slice. |
| `LogCard`               | The headline action whenever a question is graded. **Wrong** → opens automatically with `knowledge` pre-selected as miss type. **Right** → collapsed to a single "Log learning" button; click expands with `pure_learning` pre-selected. Both flow through `logToStepBuddy`. Stays on top so it can't be missed. |
| `SummaryControls`       | One button — generates / re-generates the intense blaze-through summary. |
| `QuestionView`          | Raw stem by default; once `intenseSummary` has any text, the view flips to "Summary" and stays there through grading. |
| `ChatBox`               | Auto-prefixed with stem + choices + (post-grade) explanation. Streams. |
| `SettingsPanel`         | OpenRouter key, StepBuddy email + password + sign-in, and a "Recent" list pulled from Dexie. Shows the pinned model id read-only. **No model picker.** |

There is no AnswerList (the student clicks the choice on the UWorld page),
no Celebration confetti, no ObjectiveData panel, no separate ReflectionForm
— those v0 surfaces were folded into LogCard or removed outright.

---

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
  half-rendered skeleton parse that gets dedup-locked.
- **`stripStemNoise()` cleans the stem.** Regex blacklist for UWorld UI
  artifacts: "Mark Question", "Item: 1 of 28", "Question Id: …",
  "Time Spent", "Answered (in)?correctly", "Block Time Elapsed: …", etc.
- **`stripExplanationNoise()` additionally cuts the trailing references /
  Medical Library / Copyright block.**
- **Exhibits are bare `<a>exhibit</a>` anchors inside `#questionText`** —
  Angular click handlers, no `href`, no class. `textContent` flattens them
  to a plain word so a student blowing through questions will miss them.
  `extractExhibits()` collects anchor labels from the stem container,
  skipping anchors inside the choice list and the `NON_EXHIBIT_ANCHOR`
  toolbar denylist (Mark Question / Lab Values / Tutorial / nav buttons —
  these only leak in via the rare choice-anchored fallback stem path).
  Verified against a captured `.mhtml`. Result lands in
  `ParsedQuestion.exhibits` — the field is populated but currently has no
  UI surface; rendering a flag is a one-liner in `QuestionView` when you
  want it back.
- **Post-grade markers are icon-based, not class-based.** Correct =
  `td.left-td i.fa-check`, wrong pick = `td.left-td i.fa-times`, user pick =
  `mat-radio-button.mat-radio-checked`. `[class*="correct"]` matches never
  hit on the real DOM — that was a v0 bug.
- **`extractStandards()` reads UWorld's `.standards` block** at the bottom of
  the explanation (post-grade only) and returns `{ subject, system, topic }`.
  Keyed by `.standard-header` label (not column index), so a UWorld
  reshuffle won't break it. `system` is what `mapUworldSystem()` turns into
  a StepBuddy SystemTag — that mapping is the *whole reason* we no longer
  need an LLM to guess the system.

### Observer (`src/uworld/observer.ts`)

- **Identity is QID-first, hash-fallback.** Submitting an answer re-renders
  the page (badges, "Correct answer", explanation panel) and shifts the
  stem's `textContent` slightly, flipping the content hash. That used to
  fire a bogus second `onQuestion` → `setQuestion()` → the generated
  summary got wiped. Fix: treat a parse as the **same** question if
  `questionId` matches the prior id (preferred), or — only when no id is
  available — if the content hash matches. On a same-question scan we
  still refresh `currentQuestion` so explanation parsing sees the
  post-grade markers.
- `refresh()` MUST NOT broadcast. It returns the parsed payload directly. If
  it broadcasts, the side panel re-receives `question:loaded`, calls
  `requestParse` again, which calls `refresh()` again, → infinite loop. The
  only place `onQuestion` fires is inside `scan()` when the identity check
  above says "different question".
- The MutationObserver is on `document.body` with `childList: true,
  subtree: true, characterData: true`. Debounced 200ms.

### Labs (`src/uworld/labs.ts`) — STATIC DATA ONLY

- **There is no runtime extractor anymore.** v0 had `extractLabs()` that
  regex-scanned the stem, converted Celsius → Fahrenheit, and surfaced
  abnormals in an `ObjectiveData` panel. The extractor and the panel were
  both removed — too many false positives / negatives on a parser this
  unconstrained, and the abnormals it flagged didn't change what the
  student did. **Do not "restore" them without an explicit ask.**
- **What's left is `LAB_REFERENCES`** — the OFFICIAL USMLE/UWorld lab sheet
  transcribed exactly from the user's reference screenshots, kept as static
  data because the table itself is hard-won and may be useful later as a
  lookup surface (e.g. "what's the official reference range for ALT?"). It
  is **not imported anywhere right now**.
- **The intense prompt still tells the LLM to use Fahrenheit and skip units**
  (see `prompts.ts:intensePrompt`). That used to be belt-and-suspenders
  alongside parse-time conversion; now the prompt is the only guarantee. If
  the LLM regresses on units / Celsius, tighten the prompt — don't add a
  conversion pass back to `parser.ts`.

### Audio/voice — REMOVED

There is no TTS / read-aloud / audio path. No speed slider, no voice picker,
no `autoReadOnQuestion`, no `read-question` keyboard command, no
`tts:*` / `shortcut:read` messages. Do not re-introduce a "read it aloud"
feature without an explicit request. `loadSettings()`'s `migrate()` strips
stale `tts*` / `autoReadOnQuestion` keys still sitting in
`chrome.storage.local`. `canvas-confetti` is still in `package.json` from
the removed `Celebration` component — harmless dead dependency; leave it
unless you're doing a dependency sweep.

### LLM (`src/llm/*`)

- **OpenRouter, OpenAI-compatible.** `streamChat()` in `src/llm/client.ts`
  uses `fetch` + SSE parsing. Headers `HTTP-Referer` and `X-Title` are
  required by OpenRouter for ranking. `completeChat()` is a thin
  `streamChat` → accumulated string wrapper for non-streaming callers.
- **The model is pinned in `src/llm/model.ts`** — one constant (`MODEL_ID`,
  `MODEL_LABEL`), used everywhere (summary, chat, auto-draft). Currently
  `google/gemini-3-flash-preview` (label "Gemini 3 Flash Preview"). Pinned
  on purpose: UWorld's blaze-through workflow has zero tolerance for a
  stale dropdown, and picking the wrong slug silently breaks every LLM
  call. To change models, edit `model.ts` — that's the whole change, no
  settings migration, no UI work. Verified live against
  `GET https://openrouter.ai/api/v1/models`.
- **No catalog discovery, no cache, no picker.** The old `src/llm/models.ts`
  (`fetchModels`, `ModelCatalog`, `ubuddy.models` storage key) is gone.
  Settings reads `MODEL_LABEL` for display only.
- **API key lives in `chrome.storage.local`** under `ubuddy.settings`. Never
  injected into the page. All LLM calls originate from the side panel
  (privileged context).

### Intense mode (`src/llm/prompts.ts:intensePrompt`)

This is the user's "blaze through questions" mode. The prompt is opinionated.
Read carefully before changing it.

- **No answer choices in output.** The student reads them on screen.
- **Restate the actual question verbatim at the end.** We pre-extract the
  last interrogative sentence from the stem (`extractQuestionLine`) and pass
  it as a separate field with explicit instruction to restate it.
- **No units, ever.** The prompt forbids the model from emitting them. BP
  rendered as "80 over 50" preemptively in the example.
- **All temps in Fahrenheit** — enforced by prompt only (see labs note).
- **`sanitizeStemForIntense()` cuts the stem at any spoiler marker** —
  `Explanation:`, `Educational objective:`, `Correct answer`, or
  `This patient (most likely) has` — before showing the LLM. Even if the
  parser leaks explanation, the prompt builder slices it off.
- **Markdown is forbidden with a worked example** of the exact expected
  tone. Cheap models imitate examples even when they ignore rules.

### StepBuddy log card + RPC (`src/stepbuddy/*` + `src/panel/LogCard.tsx`)

The headline write path. Pushes every graded question — wrong **or** right —
to StepBuddy via the Supabase `log_mistake` Postgres RPC on an explicit
button click. There is NO custom server — calls go straight to Supabase
Auth + REST.

- **One unified entry surface: `LogCard.tsx`.** Wrong answers open the card
  automatically with `knowledge` as the default miss type; right answers
  collapse to "Log learning" and expand on click with `pure_learning`
  pre-selected. Same form, same submit path. There is NO separate
  ReflectionForm anymore.
- **The rule (takeaway) is the student's words, every time.** The textarea
  starts empty. Clicking **Auto-draft** streams a 2–4 sentence draft from
  the LLM via `draftLearningPrompt`; the student then edits before saving.
  We deliberately don't auto-populate on render — it would burn tokens
  every question and bias the student away from writing their own.
- **`system_tag` is DETERMINISTIC, not LLM-classified.** `mapUworldSystem()`
  in `classify.ts` is a fixed lookup table from UWorld's `.standards`
  "System" label onto StepBuddy's `SystemTag`. Comparison is
  lowercased + whitespace-collapsed. Unknown / missing system →
  `Miscellaneous (MISC)`. This replaced the v0 LLM-classify-with-fallback
  approach, which was slow and occasionally wrong on JSON shape; now
  there is no LLM call at log time at all.
- **`miss_type` is chosen by the student** in the dropdown. Wrong-answer
  picker is the 8 wrong-flavored types; right-answer picker leads with
  `pure_learning`. UBuddy adds `pure_learning` to the enum that StepBuddy
  expects — keep both ends in sync if the enum ever moves.
- **No `@supabase/supabase-js` dependency.** `client.ts` is raw `fetch`. The
  SDK's GoTrue client wants `localStorage` + a `setInterval` auto-refresh,
  neither reliable in MV3. We persist `{accessToken, refreshToken,
  expiresAt, email}` in `chrome.storage.local` under
  `ubuddy.stepbuddy.session` and refresh **lazily, on demand** —
  `ensureAccessToken` checks expiry right before each call, and a 401 on
  the actual RPC triggers exactly one forced refresh + retry (clock-skew
  defense). Concurrent refreshes are coalesced through a module-level
  `refreshing: Promise<string>` so several quick logs don't stampede.
- **The publishable key is public by design** (already ships in StepBuddy's
  web client) so it's hardcoded in `client.ts`. The user's email + password
  live in `AppSettings` so the session can be silently re-minted if the
  refresh token is ever rejected.
- **The RPC has NO upsert — every call inserts a row.** Dedup is mandatory
  and lives ONLY in `log.ts:logToStepBuddy`: guarded by the persisted
  `QuestionRecord.stepbuddyMistakeId` (survives SPA re-emit / panel
  reopen) PLUS an in-memory in-flight `Set` (covers the gap before the id
  is persisted). Never call `logMistake` directly from a component.
- **`stepbuddyMistakeId` is NOT a Dexie index** — it's a plain field, so
  adding it needed no schema version bump. Don't add it to `.stores()`.
- **`SYSTEM_TAGS` / `MISS_TYPES` / `SOURCES` mirror StepBuddy's
  `lib/constants.ts`.** If StepBuddy changes those, update `client.ts` AND
  the `UWORLD_SYSTEM_MAP` in `classify.ts` in lockstep — the RPC migration
  moves with them.
- **No-LLM fallback path:** with no OpenRouter key, auto-draft is disabled
  but logging still works — the student writes the rule themselves. With
  an empty rule, `logToStepBuddy` returns a friendly error and the card
  surfaces it instead of sending an empty row.
- **Status is one Zustand slice** (`stepbuddy: {status, message}`), reset
  by `setQuestion()` like the other per-question scratch state. App.tsx
  renders it as a banner; LogCard reads it for the "already logged"
  short-circuit.

### Question display

`QuestionView` shows the raw stem by default; pressing **Summarize**
(`SummaryControls`) streams the intense summary into `intenseSummary`, and
the view switches to that. Text-only, no audio. The summary survives
answer submission because observer identity is QID-based — the post-grade
re-render doesn't fire `setQuestion()` and therefore doesn't wipe the
slice.

---

## State

- **Settings**: `chrome.storage.local` under `ubuddy.settings`.
  `AppSettings` is now just three fields:
  ```ts
  { openrouterApiKey, stepbuddyEmail, stepbuddyPassword }
  ```
  See `src/types/index.ts:DEFAULT_SETTINGS`. Watched via
  `src/storage/settings.ts:watchSettings()` so cross-tab edits propagate.
  `migrate()` strips dropped keys: `tts*`, `autoReadOnQuestion`,
  `llmModel`, `resetChatOnNewQuestion`, `stepbuddyEnabled`.
- **StepBuddy session**: `chrome.storage.local` under
  `ubuddy.stepbuddy.session` (see the StepBuddy section above for the
  shape and refresh model).
- **Question history + reflections**: IndexedDB via Dexie, schema in
  `src/storage/db.ts`. One table: `questions`. `QuestionRecord` now
  carries the student's `rule` (the takeaway sent to StepBuddy) and
  `stepbuddyMistakeId` (the dedup guard). `streakStats()` derives
  `{ total, correct, current }` for the header pill. The schema string
  still lists a `whyWrong` index from v0 — harmless (the field no longer
  exists in `QuestionRecord`), but don't rely on it.
- **In-memory app state**: Zustand in `src/state/store.ts`. `setQuestion()`
  resets `selectedLetter`, `explanation`, `intenseSummary`, `logForm`,
  `stepbuddy`, and `chat` — by design, opening a new question wipes
  per-question scratch state. `LogFormState` carries
  `{ open, rule, missType, drafting }`.

---

## Logging conventions

Every log line is prefixed with the subsystem: `[ubuddy:content]`,
`[ubuddy:bg]`, `[ubuddy:panel]`, `[ubuddy:llm]`, `[ubuddy:stepbuddy]`,
`[ubuddy:chat]`.

---

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

---

## Things to watch out for

- **WXT auto-imports `browser` and `defineBackground` / `defineContentScript`.**
  Don't import them manually.
- **`chrome.sidePanel` is not in the WebExtensions polyfill types.** Either
  declare it locally (see `entrypoints/background.ts`) or
  `(globalThis as any).chrome`.
- **Stale settings in `chrome.storage.local` survive code changes.** When a
  field disappears (e.g., `llmModel`, the `tts*` keys), `loadSettings()`'s
  `migrate()` strips them. Add to that list whenever a field is removed or
  its semantics change.
- **OpenRouter SSE error frames.** If the model errors mid-stream, OpenRouter
  sends an SSE event with `{ error: { message: ... } }`. `streamChat`
  checks for `json.error` per frame and reports — make sure new SSE
  consumers do too.
- **`chrome.storage.local` size limit is 5MB by default.** We don't store
  the models catalog anymore, so we're nowhere near it.
- **StepBuddy email + password are stored plaintext in `ubuddy.settings`**
  and the live session token under `ubuddy.stepbuddy.session`. Same posture
  as the OpenRouter key — each friend's creds live in *their* browser, never
  injected into the page, never sent anywhere except Supabase Auth. The
  public repo contains zero per-user secrets. If cloud sync of settings is
  ever added, exclude these keys.
- **StepBuddy fetches go from the side panel, not a content script.** The
  panel is a privileged extension page with the Supabase host in
  `host_permissions`, so it's not CORS-blocked (content scripts would be).
- **The model is pinned at code level.** Don't re-introduce a settings
  field for it just because adding a picker feels like the obvious move —
  the whole point of the pin is that the student can't accidentally pick
  a broken slug. If a new model is better, edit `src/llm/model.ts` and
  ship.

---

## File tour

```
entrypoints/
  background.ts          # tiny shim: configures side panel to open on icon click
  content.ts             # MutationObserver host + message handler
  sidepanel/
    index.html
    main.tsx             # React mount
    App.tsx              # ROOT — message routing, intense summary streaming

src/
  uworld/
    selectors.ts         # SINGLE source of truth — DOM selectors + queryFirst/queryAll
    parser.ts            # parseQuestion, parseExplanation, extractStandards,
                         #   extractExhibits, forwardClick, selectorHealth
    observer.ts          # UWorldObserver — MutationObserver wrapper, QID-keyed identity
    labs.ts              # STATIC DATA ONLY — LAB_REFERENCES table, no extractor
  panel/
    QuestionView.tsx     # raw stem ↔ intense summary
    SummaryControls.tsx  # single "Summarize" button (text only)
    LogCard.tsx          # inline mistake / learning logger — the headline UI
    ChatBox.tsx          # streaming LLM chat with auto-context
    SettingsPanel.tsx    # API key, StepBuddy creds + sign-in, recent history
  llm/
    client.ts            # streamChat (SSE) + completeChat wrapper
    model.ts             # MODEL_ID + MODEL_LABEL — the single pinned model
    prompts.ts           # intensePrompt, chatSystemPrompt, draftLearningPrompt,
                         #   sanitizeStemForIntense, extractQuestionLine
  stepbuddy/
    client.ts            # Supabase auth (raw fetch) + log_mistake RPC + enum lists
    classify.ts          # mapUworldSystem (deterministic lookup) + draftLearningRule
    log.ts               # logToStepBuddy — the ONLY entry point; owns dedup
  state/
    store.ts             # Zustand (settings, question, explanation, intenseSummary,
                         #   logForm, chat, streak, stepbuddy)
  storage/
    db.ts                # Dexie schema (questions table) + streakStats
    settings.ts          # chrome.storage wrapper + migrate()
  messaging/
    types.ts             # discriminated-union RuntimeMessage
    bus.ts               # send / sendToTab / on / onAny helpers
  styles/
    panel.css            # CSS variables + layout
  types/
    index.ts             # AppSettings, ParsedQuestion, ParsedExplanation,
                         #   QuestionRecord, ChatMessage
```

---

## Out of scope / anti-goals

Intentionally not built. **Don't add these on your own initiative — ask
Rahul first**, and prefer "no" by default; the point of UBuddy is to stay
tiny:

- **A model picker / settings field for the LLM.** Pinned in `model.ts` on
  purpose. If a new model is better, edit the constant.
- **OpenRouter `/models` discovery / cache.** Removed deliberately along
  with the picker; the catalog UI was dead weight.
- **An in-panel answer selector.** The student picks on UWorld's page. The
  observer reads back the pick from `mat-radio-checked`.
- **Audio / TTS / read-aloud / "verbatim" mode.** All of v0's audio path is
  gone; do not reintroduce. See "Audio/voice — REMOVED".
- **A custom server, REST API, or background worker beyond the MV3 SW.**
  Everything talks straight to OpenRouter or to Supabase from the side
  panel.
- **An auto-logger that pushes to StepBuddy on `explanation:shown`.**
  Deliberately user-triggered: the LogCard button is the only path. An
  auto-push race was tried earlier and buried the student's own words.
- **Per-extension auth / accounts / cross-device sync.** Single user,
  local IndexedDB + `chrome.storage.local`. If sync ever becomes a goal,
  exclude `stepbuddyPassword` and the OpenRouter key from anything that
  leaves the device.
- **Cross-browser support today.** Chromium-only; Firefox would need
  `sidebarAction` and a browser-polyfill pass.

---

## Open issues / future work

Real but deliberately not addressed:

- **No tests.** Manual fixture HTML in `/dev` is a future thing; the
  parser badly wants snapshot tests against the captured `.mhtml`.
- **No spaced repetition / review surface.** StepBuddy owns that (and
  Anki, via StepBuddy's cloze export). UBuddy never schedules.
- **No keyboard shortcut to pick an answer.** Number keys 1-5 would be
  ideal for blazing-through workflow.
- **`ParsedQuestion.exhibits` has no UI surface.** The field is populated;
  rendering a flag is a one-liner in `QuestionView`.
- **`canvas-confetti` is an unused dependency** left from the removed
  Celebration component. Safe to drop on the next dep sweep.
- **No CHANGELOG yet.** Friends discover what changed by reading commit
  messages on the GitHub repo. Worth adding if the friend-count ever grows.

---

## When something feels off

1. **Build fails:** run `bun run compile` first — it isolates type errors
   from WXT bundling. Prod-only breakage that `bun run dev` swallows shows
   up in `bun run build`.
2. **Extension stale / not loading:** confirm `dist/chrome-mv3` was rebuilt
   *on `main`* (working-agreement step 2), then refresh icon. A stale
   `dist/` left by another branch is the usual culprit — not a code bug.
3. **Parser stopped matching:** UWorld changed their DOM. Don't guess —
   `src/uworld/selectors.ts` is the only file to touch, and you need a
   real sample (see below). The `.mhtml` capture is ground truth.
4. **Summary got wiped on submit:** observer identity logic — confirm
   `questionId` is being parsed (look at
   `[ubuddy:content] question:loaded <hash> N choices` in the console).
   If `questionId` is empty, the hash fallback is being used and the
   post-grade re-render flipped it.
5. **Settings wrong after a code change:** stale `chrome.storage.local`
   survives reloads — check `loadSettings()`'s `migrate()` step.
6. **LLM 4xx:** an OpenRouter quirk — the OpenAPI spec at
   `/Users/radev/Downloads/openapi.yaml` is authoritative; also check SSE
   error frames (`{ error: { message } }`). If the request 404s on the
   model id, the pin in `model.ts` has gone stale — refresh it against
   `GET /models`.
7. **StepBuddy log fails:** auth / session. `src/stepbuddy/log.ts` owns
   the only path and all dedup; the RPC contract mirrors
   `stepbuddy-v2/lib/constants.ts` — they move in lockstep.

---

## Asking the user vs. assuming

UWorld's DOM is the highest-risk surface. If something doesn't parse, **ask
the user to inspect a real question and paste the relevant DOM** rather than
guessing. The `.mhtml` capture in `/Users/radev/Downloads/UWorld USMLE.mhtml`
(if still present) is ground truth.

For OpenRouter quirks (new providers, format constraints, etc.), the
authoritative reference is the OpenAPI spec the user has at
`/Users/radev/Downloads/openapi.yaml`. Search it before guessing.
