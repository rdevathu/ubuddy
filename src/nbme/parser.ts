/**
 * NBME DOM → ParsedQuestion / ParsedExplanation.
 *
 * NBME questions are always review-mode in UBuddy's flow: the student has
 * already submitted the whole exam, and they review one question at a time.
 * There is no "pre" state — every parse is graded. So:
 *
 *   - `parseQuestion()` succeeds whenever `.ITSStem` is mounted with ≥2
 *     `.ITSMCOptionTable[On]` rows.
 *   - `parseExplanation()` reads:
 *       * the correct letter from the `correctOption` table (NBME's class flag
 *         on the right-answer row) — confirmed against the "Correct Answer: X"
 *         line at the top of `.SOLUTION`
 *       * the user's pick from the radio input with `checked="checked"` (or
 *         `aria-checked="true"` on the parallel keyboard widget)
 *       * the full rationale text from `.SOLUTION`
 *
 * Section + question number come from the inline script that the NBME engine
 * emits at the top of the iframe (`var vCurrentSection = …`,
 * `var vCurrentNumber = "…"`). Content scripts run in an isolated world and
 * can't read those globals directly, but the script text itself is in the
 * DOM — we read the matching `<script>` element and pull the numbers out via
 * regex. The full `{exam}-{section}-{question}` identifier is assembled in
 * the log path (the panel knows the exam # from settings).
 *
 * No subject / system metadata is exposed in the NBME DOM, so the LLM has to
 * classify the system at log time (same path AMBOSS uses).
 *
 * No `forwardClick`: review pages are read-only. The function is a no-op so
 * the provider abstraction stays uniform.
 */

import type {
  AnswerChoice,
  ParsedExplanation,
  ParsedQuestion,
} from '../types';
import { NBME_SELECTORS, queryAll, queryFirst } from './selectors';

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

function readInnerText(el: Element): string {
  const html = el as HTMLElement;
  return clean(typeof html.innerText === 'string' ? html.innerText : el.textContent);
}

/**
 * Pull `vCurrentSection` and `vCurrentNumber` from the NBME bootstrap script
 * that sits at the top of every itd.aspx page. We can't read JS globals
 * across the isolated-world boundary, so we read the script's text node and
 * regex it out. Both numbers are stable strings ("1", "2", …, sometimes
 * decodeURIComponent-wrapped); we just want the inner literal.
 */
export function readNbmePageNumbers(): { section?: string; question?: string } {
  let combined = '';
  // Cap how much we scan — the NBME bootstrap block is small (~150 lines) and
  // it sits before any of the rangy/highlighting/page scripts. Scanning every
  // <script> on the page (including jQuery's 88k minified blob) is wasteful.
  const scripts = document.querySelectorAll('script');
  for (let i = 0; i < scripts.length && i < 6; i++) {
    const s = scripts[i] as HTMLScriptElement;
    if (s.src) continue; // external script — text is unavailable
    combined += '\n' + (s.textContent || '');
    if (combined.length > 20000) break;
  }
  if (!combined) return {};
  const section =
    combined.match(/var\s+vCurrentSection\s*=\s*decodeURIComponent\(["']([^"']+)["']\)/)?.[1] ??
    combined.match(/var\s+vCurrentSection\s*=\s*["']([^"']+)["']/)?.[1];
  const question =
    combined.match(/var\s+vCurrentNumber\s*=\s*["']([^"']+)["']/)?.[1] ??
    combined.match(/var\s+vCurrentNumber\s*=\s*decodeURIComponent\(["']([^"']+)["']\)/)?.[1];
  return {
    section: section ? decodeURIComponent(section) : undefined,
    question: question ? decodeURIComponent(question) : undefined,
  };
}

function findStemContainer(): Element | null {
  return queryFirst(document, NBME_SELECTORS.questionStem);
}

function readStemText(stemEl: Element): string {
  // Prefer the .ITSStemText inner div — it contains only the prose, not the
  // leading item number. Falls back to the whole stem container.
  const inner = queryFirst(stemEl, NBME_SELECTORS.questionStemText);
  if (inner) return readInnerText(inner);
  return readInnerText(stemEl);
}

function findChoiceTables(): Element[] {
  return queryAll(document, NBME_SELECTORS.choiceTables);
}

function letterOfTable(tbl: Element): string {
  const el = queryFirst(tbl, NBME_SELECTORS.choiceLetter);
  const raw = clean(el?.textContent).toUpperCase();
  if (/^[A-Z]$/.test(raw)) return raw;
  return '';
}

function textOfTable(tbl: Element): string {
  const el = queryFirst(tbl, NBME_SELECTORS.choiceText);
  if (!el) return '';
  return readInnerText(el);
}

function isCorrectTable(tbl: Element): boolean {
  // NBME flags the correct row by adding `correctOption` to the option table
  // div. Verified in the q1 capture: `<div … class="… correctOption">` is
  // ONLY the right answer; every other choice has the plain class.
  return tbl.classList.contains('correctOption');
}

function isUserPickTable(tbl: Element): boolean {
  // The user's selected radio is the one whose `<input>` carries
  // `checked="checked"`. Parallel ARIA widget has aria-checked="true" on a
  // sibling div — either signal is reliable.
  const radio = tbl.querySelector('input[type="radio"]') as HTMLInputElement | null;
  if (radio && (radio.checked || radio.getAttribute('checked') !== null)) return true;
  const aria = tbl.querySelector('[role="option"][aria-checked="true"]');
  return !!aria;
}

/**
 * Strip NBME's leading "Correct Answer: X." sentence + the trailing
 * "Educational Objective" anchor IF the student doesn't want it doubled up.
 * The full text is still useful for the LLM, so we keep it as-is and only
 * trim leading whitespace — drop noise rules can live in the prompt instead.
 */
function readSolutionText(): string {
  const el = queryFirst(document, NBME_SELECTORS.solution);
  if (!el) return '';
  return readInnerText(el);
}

/**
 * Parse the correct letter out of the solution body's "Correct Answer: X."
 * preamble. Used as a fallback when the `correctOption` class is missing
 * (rare — historically NBME emits both signals on every reviewed item).
 */
function correctLetterFromSolution(): string {
  const text = readSolutionText();
  // Anchor at start so an in-explanation reference like "Choice B" doesn't
  // win — NBME always opens with "Correct Answer: X." (and historically the
  // capital "C" is reliable).
  const m = text.match(/Correct Answer:\s*([A-Z])\b/);
  return m?.[1] ?? '';
}

export function parseQuestion(): ParsedQuestion | null {
  const stemEl = findStemContainer();
  if (!stemEl) return null;
  const stem = readStemText(stemEl);
  if (stem.length < 30) return null;

  const tables = findChoiceTables();
  if (tables.length < 2) return null;

  const correctLetterHint = correctLetterFromSolution();

  const choices: AnswerChoice[] = tables.map((tbl) => {
    const letter = letterOfTable(tbl);
    const text = textOfTable(tbl);
    const flaggedCorrect = isCorrectTable(tbl);
    const isCorrect = flaggedCorrect || (!!correctLetterHint && letter === correctLetterHint);
    return {
      letter,
      text,
      isCorrect,
      isUserPick: isUserPickTable(tbl),
    };
  });

  const hasAnyText = choices.some((c) => c.text.length > 1);
  if (!hasAnyText) return null;

  // Section + question number → composite identifier (without the exam #,
  // which is sticky in settings and gets prepended in the log path).
  const { section, question } = readNbmePageNumbers();
  const questionId =
    section && question ? `${section}-${question}` : section ?? question;
  const questionNumber = question;

  return {
    source: 'nbme',
    questionHash: hashStem(stem),
    stem,
    choices,
    exhibits: [],
    questionId,
    questionNumber,
  };
}

export function parseExplanation(
  question: ParsedQuestion,
): ParsedExplanation | null {
  const tables = findChoiceTables();
  if (tables.length === 0) return null;

  let correctLetter = '';
  let userLetter: string | undefined;

  for (let i = 0; i < tables.length; i++) {
    const tbl = tables[i];
    const letter = letterOfTable(tbl) || question.choices[i]?.letter || '';
    if (isCorrectTable(tbl)) correctLetter = letter;
    if (isUserPickTable(tbl)) userLetter = userLetter ?? letter;
  }

  if (!correctLetter) correctLetter = correctLetterFromSolution();

  // No reliable correct letter and no solution → not a graded item yet. Bail.
  if (!correctLetter) return null;

  const explanationText = readSolutionText();
  const wasCorrect = !!userLetter && !!correctLetter && userLetter === correctLetter;

  return {
    questionHash: question.questionHash,
    explanationText,
    correctLetter,
    userLetter,
    wasCorrect,
    // NBME exposes no subject/system/topic; LLM classifies at panel time
    // (same path as AMBOSS).
    subject: undefined,
    system: undefined,
    topic: undefined,
  };
}

export function selectorHealth(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!findStemContainer()) missing.push('questionStem');
  if (findChoiceTables().length < 2) missing.push('choiceTables');
  return { ok: missing.length === 0, missing };
}

/** NBME review is read-only — no answer selection from the panel. */
export function forwardClick(_letter: string): boolean {
  return false;
}
