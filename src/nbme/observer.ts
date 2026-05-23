/**
 * MutationObserver wrapper for NBME review pages.
 *
 * NBME review is a static-ish DOM: the stem + choices + solution are all
 * rendered server-side and the page reloads (full nav) between questions —
 * unlike UWorld's SPA-style re-render and AMBOSS's attribute-flip state
 * transitions. So this observer is the simplest of the three:
 *
 *   - A single `childList`+`subtree` watch on `document.body` to catch the
 *     first paint (NBME hides the body until scripts populate it) and any
 *     in-place updates if the user navigates between questions inside the
 *     same iframe load.
 *   - Identity is keyed on the NBME composite id ({section}-{question}); the
 *     stem hash is the fallback if the bootstrap script hasn't been read
 *     yet.
 *   - `parseExplanation` is fired exactly once per question once we have a
 *     correct letter — there is no peri-to-post transition to coalesce.
 *
 * Read-only DOM access only. We do not click, focus, or dispatch synthetic
 * events on the page — NBME's review session has its own server-side
 * activity tracker, and the safest posture is to look without touching.
 */

import type { ParsedExplanation, ParsedQuestion } from '../types';
import { parseExplanation, parseQuestion } from './parser';

type Listener = {
  onQuestion?: (q: ParsedQuestion) => void;
  onExplanation?: (e: ParsedExplanation) => void;
};

export class NbmeObserver {
  private mo: MutationObserver | null = null;
  private currentHash: string | null = null;
  private currentQuestionId: string | null = null;
  private currentQuestion: ParsedQuestion | null = null;
  private explanationFired = false;
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

    const sameQuestion =
      (!!parsed.questionId && parsed.questionId === this.currentQuestionId) ||
      (!parsed.questionId && parsed.questionHash === this.currentHash);

    if (!sameQuestion) {
      this.currentHash = parsed.questionHash;
      this.currentQuestionId = parsed.questionId ?? null;
      this.currentQuestion = parsed;
      this.explanationFired = false;
      this.listeners.onQuestion?.(parsed);
    } else {
      this.currentQuestion = parsed;
    }

    if (this.explanationFired) return;
    if (!this.currentQuestion) return;
    const ex = parseExplanation(this.currentQuestion);
    if (!ex) return;
    this.explanationFired = true;
    this.listeners.onExplanation?.(ex);
  }
}
