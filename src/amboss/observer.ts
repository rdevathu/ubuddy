/**
 * MutationObserver wrapper for AMBOSS.
 *
 * Two architectural differences from the UWorld observer:
 *
 *   1. AMBOSS encodes most state via attribute mutations on already-mounted
 *      DOM (`data-e2e-test-id` flips, `aria-label` appears, `style`/`class`
 *      toggles on the explanation animator). A pure `childList` observer
 *      would miss the pre→peri→post transitions, so we observe attributes
 *      too with a tight `attributeFilter`.
 *
 *   2. There's a peri state (first attempt wrong, can keep clicking). We fire
 *      `onExplanation` once when peri is first detected — that's the grade
 *      event we care about — and again when post adds the correct letter.
 *      Identity is keyed on the AMBOSS QID (the notes-editor suffix), so the
 *      same question across state changes is treated as one question.
 */

import type { ParsedExplanation, ParsedQuestion } from '../types';
import { parseExplanation, parseQuestion } from './parser';

type Listener = {
  onQuestion?: (q: ParsedQuestion) => void;
  onExplanation?: (e: ParsedExplanation) => void;
};

export class AmbossObserver {
  private mo: MutationObserver | null = null;
  private currentHash: string | null = null;
  private currentQuestionId: string | null = null;
  private currentQuestion: ParsedQuestion | null = null;
  private lastExplanationKey: string | null = null;
  private listeners: Listener;
  private debounceTimer: number | null = null;

  constructor(listeners: Listener) {
    this.listeners = listeners;
  }

  start(): void {
    this.mo?.disconnect();
    this.mo = new MutationObserver(() => this.scheduleScan());
    this.mo.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-e2e-test-id', 'aria-label', 'aria-controls', 'class', 'style'],
    });
    this.scheduleScan();
  }

  stop(): void {
    this.mo?.disconnect();
    this.mo = null;
  }

  refresh(): { question?: ParsedQuestion; explanation?: ParsedExplanation } {
    const parsed = parseQuestion();
    if (!parsed) return {};
    const explanation = parseExplanation(parsed) ?? undefined;
    return { question: parsed, explanation };
  }

  private scheduleScan(): void {
    if (this.debounceTimer != null) clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => this.scan(), 200);
  }

  private scan(): void {
    const parsed = parseQuestion();
    if (!parsed) return;

    // QID-first identity. AMBOSS's notes-editor id is stable per question
    // across all three states; only when it really changes (new question
    // loaded in the session) do we wipe per-question state. Hash fallback
    // covers the unlikely case where the notes button hasn't mounted yet.
    //
    // Earlier we tried also cross-checking the stem hash here on AMBOSS,
    // but the actual stem text in `section[aria-label="Question Text"]`
    // shifts by a couple of whitespace chars between pre and peri/post
    // (verified against captures), so the hash flips on every grade for
    // the SAME question. Cross-checking made the observer treat every
    // grade as a brand-new question, which wiped `explanation` and
    // suppressed the LogCard. Stick with QID alone.
    const sameQuestion =
      (!!parsed.questionId && parsed.questionId === this.currentQuestionId) ||
      (!parsed.questionId && parsed.questionHash === this.currentHash);

    if (!sameQuestion) {
      this.currentHash = parsed.questionHash;
      this.currentQuestionId = parsed.questionId ?? null;
      this.currentQuestion = parsed;
      this.lastExplanationKey = null;
      this.listeners.onQuestion?.(parsed);
    } else {
      // Same question, but a state transition (pre→peri, peri→post) may have
      // happened — keep the reference fresh so the next parseExplanation
      // sees the updated row themes / explanation expansions.
      this.currentQuestion = parsed;
    }

    if (!this.currentQuestion) return;
    const ex = parseExplanation(this.currentQuestion);
    if (!ex) return;

    // De-dup re-fires: the meaningful change between peri and post is
    // (correctLetter, wasCorrect, explanationText length). Re-emit only when
    // that key actually changes — without this guard, MutationObserver
    // floods on every animator step.
    const key = `${ex.correctLetter}|${ex.wasCorrect}|${ex.explanationText.length}`;
    if (key === this.lastExplanationKey) return;
    this.lastExplanationKey = key;
    this.listeners.onExplanation?.(ex);
  }
}
