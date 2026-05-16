import type { ParsedExplanation, ParsedQuestion } from '../types';
import { parseExplanation, parseQuestion } from './parser';

type Listener = {
  onQuestion?: (q: ParsedQuestion) => void;
  onExplanation?: (e: ParsedExplanation) => void;
};

export class UWorldObserver {
  private mo: MutationObserver | null = null;
  private currentHash: string | null = null;
  private currentQuestionId: string | null = null;
  private currentQuestion: ParsedQuestion | null = null;
  private explanationDelivered = false;
  private listeners: Listener;
  private debounceTimer: number | null = null;

  constructor(listeners: Listener) {
    this.listeners = listeners;
  }

  start(): void {
    this.mo?.disconnect();
    this.mo = new MutationObserver(() => this.scheduleScan());
    this.mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    this.scheduleScan();
  }

  stop(): void {
    this.mo?.disconnect();
    this.mo = null;
  }

  /**
   * Pull the current parsed state without broadcasting. Used by the side panel
   * to populate state on open. Never re-emits — only the natural change-detection
   * scan fires the listeners.
   */
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

    // Identity is keyed on UWorld's stable numeric Question Id when present.
    // The stem hash alone is NOT enough: submitting an answer re-renders the
    // page (badges, "Correct answer", explanation panel) and the stem's
    // textContent shifts slightly, flipping the hash. That used to fire a
    // bogus onQuestion → setQuestion → the generated summary got wiped. We
    // only treat it as a new question when the Question Id actually changes;
    // hash is the fallback for the rare case the id can't be parsed.
    const sameQuestion =
      (!!parsed.questionId && parsed.questionId === this.currentQuestionId) ||
      (!parsed.questionId && parsed.questionHash === this.currentHash);

    if (!sameQuestion) {
      this.currentHash = parsed.questionHash;
      this.currentQuestionId = parsed.questionId ?? null;
      this.currentQuestion = parsed;
      this.explanationDelivered = false;
      this.listeners.onQuestion?.(parsed);
    } else {
      // Same question, but the post-submit DOM now carries answer markers —
      // keep the reference fresh so explanation parsing sees them.
      this.currentQuestion = parsed;
    }

    if (this.currentQuestion && !this.explanationDelivered) {
      const ex = parseExplanation(this.currentQuestion);
      if (ex) {
        this.explanationDelivered = true;
        this.listeners.onExplanation?.(ex);
      }
    }
  }
}
