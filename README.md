# UBuddy

A Chrome side-panel extension for [UWorld](https://www.uworld.com) that
generates a tight clinical summary of each question, lets you chat about it,
and one-click-logs every graded question — wrong **or** right — to
[StepBuddy](https://stepbuddy.devathulab.com) with your own takeaway.

Built for a few friends. Not on the Chrome Web Store. Install instructions
below.

## Requirements

- **Google Chrome** (or another Chromium browser — Edge, Brave, Arc). UBuddy
  uses Chrome's side-panel API and **does not work in Firefox or Safari.**
- A **[StepBuddy](https://stepbuddy.devathulab.com) account**, if you want the
  "log this question" button to do anything. If you don't have one, message
  Rahul.
- **`git`** installed (recommended — makes updating a one-liner). Or just
  download the repo as a ZIP if you prefer.

## Install

### Option A — with `git` (recommended)

```sh
cd ~/Downloads        # or wherever you want UBuddy to live
git clone https://github.com/rdevathu/ubuddy.git
```

### Option B — download ZIP

1. Go to https://github.com/rdevathu/ubuddy
2. Click the green **Code** button → **Download ZIP**
3. Unzip it somewhere you'll remember (e.g. `~/Downloads/ubuddy`)

### Load it into Chrome (both options)

1. Open `chrome://extensions` in Chrome.
2. Toggle **Developer mode** on (top-right corner).
3. Click **Load unpacked**.
4. Pick the **`dist/chrome-mv3`** folder inside the `ubuddy` folder you just
   cloned/downloaded. (Not the top-level `ubuddy` folder — go one level
   deeper into `dist/chrome-mv3`.)
5. UBuddy should now appear in your extensions list.
6. Click the puzzle-piece icon in Chrome's toolbar and **pin** UBuddy so its
   icon stays visible.

That's it. Open a UWorld question, click the UBuddy icon (or press
`Cmd+Shift+U` on Mac / `Ctrl+Shift+U` on Windows), and the side panel opens.

## First-time setup

Open the side panel, click **Settings**, and fill in:

- **StepBuddy email + password** — the account you use at
  stepbuddy.devathulab.com. Click **Sign in**. The "Logging to StepBuddy"
  banner should turn green.
- **OpenRouter API key** — *optional.* See the [OpenRouter section](#openrouter-optional)
  below.

Settings save automatically. Close the panel and you're done.

## How to use it

When you open a UWorld question:

1. The side panel shows the question stem.
2. Click **Summarize** to get a tight, blaze-through clinical summary.
3. **Chat box** at the bottom — ask anything about this question. UBuddy
   already knows the stem, the choices, and (after you submit) the
   explanation, so you don't have to copy-paste anything.
4. **After you submit** the question on UWorld:
   - **Wrong answer** → the "Log this miss" card opens automatically.
     Pick why you got it wrong (knowledge gap, careless, etc.) and write
     a one- or two-sentence takeaway. **Auto-draft** writes a draft for
     you if you have an OpenRouter key; otherwise just type it. Hit
     **Log to StepBuddy**.
   - **Right answer** → click **Log learning** if it taught you something
     worth remembering. Same form, same flow.

Every graded question (wrong or right, if you chose to log) is pushed to
StepBuddy. UBuddy figures out the system tag (cardiology, renal, etc.)
automatically from UWorld's own labels — you don't pick it.

## Updating

When Rahul ships a new version, you'll know — and updating is one step:

**If you cloned with `git`:**

```sh
cd ~/Downloads/ubuddy        # wherever you cloned it
git pull
```

**If you downloaded the ZIP:** re-download the ZIP and replace your old
`ubuddy` folder with the new one (same path).

Then in Chrome:

1. Go to `chrome://extensions`.
2. Find the UBuddy card and click the **refresh / reload icon** (↻) on it.

Done. New version is live. You **do not** need to remove and re-add the
extension.

## StepBuddy integration

UBuddy is a companion to [StepBuddy](https://stepbuddy.devathulab.com), a
Step 2 mistake tracker. Every question you log from UBuddy lands in
StepBuddy as a row with:

- The question's **system** (cardiovascular, renal, GI, etc.) — auto-mapped
  from UWorld's own category, no guessing.
- A **miss type** you pick (e.g. *knowledge gap*, *misread the stem*,
  *guessed wrong*, or *pure learning* for things you got right but want to
  remember).
- A **rule** — the one- or two-sentence takeaway you wrote. This is the
  whole point; rules are what you'll review.
- The UWorld question ID, so duplicates don't pile up if you re-open the
  same question.

You can then review your rules in StepBuddy (Anki export, spaced
repetition, etc. — that's StepBuddy's job, not UBuddy's).

If logging fails, the banner at the top of the side panel will say why
(usually "sign in to StepBuddy in Settings"). Nothing is ever sent without
you clicking the log button — UBuddy does not auto-push.

## OpenRouter (optional)

UBuddy uses an LLM for three things: the **clinical summary**, the **chat
box**, and **auto-drafting** your takeaway when logging. All three require
an [OpenRouter](https://openrouter.ai) API key in Settings.

**You do not need a key to log questions to StepBuddy.** Logging works
fine without it — you just write your own takeaway instead of getting an
auto-draft.

If you'd like the LLM features but aren't sure how to set up an OpenRouter
key, message Rahul.

## Privacy

- Your StepBuddy email + password and your OpenRouter API key live in
  Chrome's local storage on your machine. They are never sent anywhere
  except StepBuddy and OpenRouter, respectively, and are never injected
  into the UWorld page.
- Question history and your written takeaways live locally in your
  browser's IndexedDB.
- No telemetry. No analytics. No "phone home."

## Troubleshooting

**The panel says "Parser can't find: …"**
UWorld changed its page layout. Send Rahul a screenshot — the fix is
usually a one-line update.

**The summary or chat says I need an OpenRouter key**
Add one in Settings, or just use UBuddy without the LLM features (logging
still works).

**StepBuddy banner says "Sign in to StepBuddy"**
Open Settings, paste your StepBuddy email + password, click Sign in.

**Chrome shows a "Developer mode extensions" warning**
This is expected for any extension not installed from the Chrome Web Store.
It's not a virus warning — it's Chrome reminding you the extension wasn't
reviewed by Google. Click "Keep" / dismiss it.

**It doesn't work on Firefox / Safari**
Yep — UBuddy is Chromium-only for now (Edge, Brave, Arc, Chrome all work).

## License

MIT. See [LICENSE](LICENSE).
