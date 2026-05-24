/**
 * AMBOSS DOM → ParsedQuestion / ParsedExplanation.
 *
 * Three notable differences from the UWorld parser:
 *
 *   1. AMBOSS has a 3-state model (pre / peri / post). We treat both peri and
 *      post as "graded" — the first wrong pick is the grade event we care
 *      about (the user asked for the log card to open the moment they miss,
 *      even if they keep clicking until they get it right). `wasCorrect` is
 *      false whenever any `userFirstAttemptIncorrect` row exists.
 *
 *   2. AMBOSS exposes no system / subject / topic metadata in the DOM. The
 *      LLM has to classify the system at log time. `parseExplanation` leaves
 *      `system` undefined for AMBOSS; the classify step happens in the panel.
 *
 *   3. AMBOSS has a stable public question identifier — the suffix of
 *      `aria-controls="notes-editor-{ID}"` (the same code the user can filter
 *      on in Anki). This goes into `questionId` and ultimately
 *      StepBuddy's `p_identifier`.
 */

import type {
  AnswerChoice,
  ParsedExplanation,
  ParsedQuestion,
} from '../types';
import { AMBOSS_SELECTORS, queryAll, queryFirst } from './selectors';

function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function hashStem(stem: string): string {
  let h = 0;
  for (let i = 0; i < stem.length; i++) {
    h = (h * 31 + stem.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/**
 * AMBOSS embeds a tiny `<style>` block inside the question article and
 * `<span class="ScreenReaderText">` nodes inside choice buttons. `innerText`
 * skips both correctly; `textContent` does not. Prefer `innerText` here.
 */
function readInnerText(el: Element): string {
  // `innerText` exists on HTMLElement but not the abstract Element type.
  const html = el as HTMLElement;
  return clean(typeof html.innerText === 'string' ? html.innerText : el.textContent);
}

function findStemContainer(): Element | null {
  return queryFirst(document, AMBOSS_SELECTORS.questionStem);
}

function findChoiceList(): Element | null {
  return queryFirst(document, AMBOSS_SELECTORS.choiceList);
}

function findChoiceRows(): Element[] {
  const list = findChoiceList();
  if (!list) return [];
  return queryAll(list, AMBOSS_SELECTORS.choiceItem);
}

/** Parse the AMBOSS QID out of any `aria-controls="notes-editor-{ID}"`. */
function extractQuestionId(): string | undefined {
  const el = queryFirst(document, AMBOSS_SELECTORS.notesEditorButton);
  if (!el) return undefined;
  const v = el.getAttribute('aria-controls');
  const m = v?.match(/^notes-editor-(.+)$/);
  return m?.[1];
}

function letterOfRow(row: Element): string {
  const pill = queryFirst(row, AMBOSS_SELECTORS.choiceLetter);
  const raw = clean(pill?.textContent).toUpperCase();
  if (/^[A-Z]$/.test(raw)) return raw;
  // Fallback: the button's data-e2e-test-id is "answer-{letter}".
  const btn = queryFirst(row, AMBOSS_SELECTORS.choiceButton);
  const id = btn?.getAttribute('data-e2e-test-id') ?? '';
  const m = id.match(/^answer-([a-z])$/);
  return m ? m[1].toUpperCase() : '';
}

function textOfRow(row: Element): string {
  const btn = queryFirst(row, AMBOSS_SELECTORS.choiceButton);
  if (!btn) return readInnerText(row);
  // The button contains the letter pill + the screen-reader label + the
  // actual answer text. innerText drops the SR span; we then strip the
  // single-letter prefix if it leaks through.
  let raw = readInnerText(btn);
  raw = raw.replace(/^Option [A-Za-z]:\s*/i, '');
  raw = raw.replace(/^[A-Z]\s+/, '');
  return raw;
}

function rowTheme(row: Element):
  | 'unanswered'
  | 'userFirstAttemptIncorrect'
  | 'answerOptionIncorrect'
  | 'answerOptionCorrect'
  | 'unknown' {
  // The theme wrapper is the row's parent in the captured DOM (the wrapper
  // div carries `answer-theme-*`; the inner div carries `answer-row`). Walk
  // up at most a couple steps to find it — AMBOSS may insert another layer
  // later.
  let p: Element | null = row.parentElement;
  for (let i = 0; p && i < 3; i++, p = p.parentElement) {
    const v = p.getAttribute('data-e2e-test-id') ?? '';
    if (v === 'answer-theme-unanswered') return 'unanswered';
    if (v === 'answer-theme-userFirstAttemptIncorrect') return 'userFirstAttemptIncorrect';
    if (v === 'answer-theme-answerOptionIncorrect') return 'answerOptionIncorrect';
    if (v === 'answer-theme-answerOptionCorrect') return 'answerOptionCorrect';
  }
  return 'unknown';
}

export type AmbossState = 'pre' | 'peri' | 'post';

export function detectState(): AmbossState {
  // Scope to the live choice list — querying the whole document let stale
  // badges from the previous question's DOM (still mounted during AMBOSS's
  // question transition) make us misread a brand-new unanswered question as
  // 'post'. That fired a junk parseExplanation, which set the panel's
  // `explanation` for the new question and re-triggered LogCard's "already
  // logged" lookup against whatever record happened to share the hash.
  const choiceList = findChoiceList();
  if (!choiceList) return 'pre';
  if (queryFirst(choiceList, AMBOSS_SELECTORS.correctBadge)) return 'post';
  if (queryFirst(choiceList, AMBOSS_SELECTORS.incorrectBadge)) return 'peri';
  return 'pre';
}

export function parseQuestion(): ParsedQuestion | null {
  const stemEl = findStemContainer();
  if (!stemEl) return null;
  const stem = readInnerText(stemEl);
  if (stem.length < 30) return null;

  const rows = findChoiceRows();
  if (rows.length < 2) return null;

  const state = detectState();
  const isGraded = state !== 'pre';

  const choices: AnswerChoice[] = rows.map((row) => {
    const letter = letterOfRow(row);
    const text = textOfRow(row);
    const theme = rowTheme(row);
    return {
      letter,
      text,
      isCorrect: isGraded ? theme === 'answerOptionCorrect' : false,
      // "Picked" = first attempt wrong OR the correct one when the student
      // got it right on first try. In peri/post we surface the user's first
      // attempt; mid-question picks beyond the first aren't recoverable from
      // the post DOM and aren't useful for logging.
      isUserPick:
        theme === 'userFirstAttemptIncorrect' ||
        (state === 'post' && theme === 'answerOptionCorrect' && !hasAnyFirstAttemptWrong()),
    };
  });

  const hasAnyText = choices.some((c) => c.text.length > 1);
  if (!hasAnyText) return null;

  const questionId = extractQuestionId();

  return {
    source: 'amboss',
    questionHash: hashStem(stem),
    stem,
    choices,
    exhibits: [],
    questionId,
  };
}

function hasAnyFirstAttemptWrong(): boolean {
  return !!queryFirst(document, AMBOSS_SELECTORS.themeUserFirstAttemptIncorrect);
}

/**
 * Resolve and read the per-row explanation. AMBOSS keeps the rationale block
 * in a sibling animator panel linked via the choice button's
 * `aria-controls`. Returns the cleaned text only if the panel is expanded
 * (`rah-static--height-auto` / `aria-hidden="false"`); otherwise an empty
 * string. `textContent` is safe here because the gating already excludes
 * collapsed panels — happy-dom's `innerText` visibility is unreliable.
 */
function readExplanationFor(row: Element): string {
  const btn = queryFirst(row, AMBOSS_SELECTORS.choiceButton);
  const panelId = btn?.getAttribute('aria-controls');
  if (!panelId) return '';
  const panel = document.getElementById(panelId);
  if (!panel) return '';
  const cls = panel.className?.toString?.() ?? '';
  const ariaHidden = panel.getAttribute('aria-hidden');
  const expanded =
    cls.includes('rah-static--height-auto') ||
    ariaHidden === 'false' ||
    // Fallback: if no animator wrapper at all, assume it's visible.
    (!cls.includes('rah-static') && ariaHidden !== 'true');
  if (!expanded) return '';
  const exEl = panel.querySelector('[data-e2e-test-id="answerExplanation"]');
  if (!exEl) return '';
  return clean(exEl.textContent);
}

/**
 * Build a ParsedExplanation from whatever state the page is in.
 *
 * - pre  → returns null (nothing graded yet)
 * - peri → wasCorrect=false; userLetter=first wrong pick; correctLetter='' (not yet revealed).
 *          explanationText is whichever wrong-pick rationale is currently open.
 *          This is what fires the LogCard immediately on first miss.
 * - post → wasCorrect=true iff there was no first-attempt-wrong row;
 *          userLetter=first wrong pick OR the correct row (if right first try);
 *          correctLetter=the row marked `answerOptionCorrect`.
 *          explanationText concatenates every revealed per-choice rationale.
 */
export function parseExplanation(
  question: ParsedQuestion,
): ParsedExplanation | null {
  const state = detectState();
  if (state === 'pre') return null;

  const rows = findChoiceRows();
  if (rows.length === 0) return null;

  let correctLetter = '';
  let firstWrongLetter: string | undefined;
  let firstTryCorrectLetter: string | undefined;

  const explainPieces: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const letter = letterOfRow(row) || question.choices[i]?.letter || '';
    const theme = rowTheme(row);

    if (theme === 'answerOptionCorrect') {
      correctLetter = letter;
      if (!hasAnyFirstAttemptWrong()) firstTryCorrectLetter = letter;
    }
    if (theme === 'userFirstAttemptIncorrect') {
      firstWrongLetter = firstWrongLetter ?? letter;
    }

    // Each row's per-choice explanation lives in a SIBLING wrapper (the
    // react-animate-height panel), linked via the button's `aria-controls`.
    // We can't just queryFirst inside the row — the explanation node is
    // outside it. Resolve the panel by id, then read its inner explanation
    // text only if it's expanded.
    const exText = readExplanationFor(row);
    if (exText && exText.length > 20) explainPieces.push(`(${letter}) ${exText}`);
  }

  // In peri the AMBOSS DOM has not revealed the correct answer yet. We still
  // want to fire — the student knows they missed and wants the LogCard. The
  // correct letter will be filled in on a later scan when they hit post.
  if (state === 'peri' && !firstWrongLetter) return null;

  const userLetter = firstWrongLetter ?? firstTryCorrectLetter;
  const wasCorrect = state === 'post' && !firstWrongLetter && !!firstTryCorrectLetter;

  return {
    questionHash: question.questionHash,
    explanationText: explainPieces.join('\n\n'),
    correctLetter,
    userLetter,
    wasCorrect,
    // AMBOSS does not expose subject/system/topic in the DOM; an LLM classify
    // step (in the side panel) fills the system tag at log time.
    subject: undefined,
    system: undefined,
    topic: undefined,
  };
}

export function selectorHealth(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!findStemContainer()) missing.push('questionStem');
  if (findChoiceRows().length < 2) missing.push('choiceList/choiceItem');
  return { ok: missing.length === 0, missing };
}

/** Click the button for a given letter. Mostly for forwarded keyboard picks. */
export function forwardClick(letter: string): boolean {
  const rows = findChoiceRows();
  for (const row of rows) {
    if (letterOfRow(row).toUpperCase() !== letter.toUpperCase()) continue;
    const btn = queryFirst(row, AMBOSS_SELECTORS.choiceButton) as HTMLElement | null;
    if (!btn) continue;
    btn.click();
    return true;
  }
  return false;
}
