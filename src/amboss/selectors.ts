/**
 * Single source of truth for AMBOSS DOM selectors.
 *
 * AMBOSS exposes Cypress-style `data-e2e-test-id` attributes on every
 * surface that matters (stem, choices, state badges, toolbar). These are by
 * far the most stable selectors — the obfuscated CSS-module class hashes
 * (e.g. `_981f8b48b6542a07--container`) rotate on every build, so we lean
 * on `data-e2e-test-id` and `aria-label` first.
 *
 * Verified against three captures of the same question:
 *   - AMBOSS 5 pre.html   (no answer picked)
 *   - AMBOSS 5 peri.html  (first attempt wrong; can keep clicking)
 *   - AMBOSS 5 post.html  (correct answer eventually picked; full reveal)
 *
 * AMBOSS lets the student keep clicking until they hit the right answer,
 * so we have a 3-state model unlike UWorld's binary pre/graded:
 *   pre   : all rows are `answer-theme-unanswered`
 *   peri  : at least one `Incorrect option` badge, no `Correct option` yet
 *   post  : one `Correct option` badge present
 */

export interface AmbossSelectorSet {
  /** The whole stem section (innerText is clean — no toolbar bleed). */
  questionStem: string[];
  /** Container that wraps the answer-choice list. */
  choiceList: string[];
  /** Each individual answer-choice row (queried under choiceList). */
  choiceItem: string[];
  /** The letter pill inside a choice row ("A".."G"). */
  choiceLetter: string[];
  /** The clickable button inside a choice row. */
  choiceButton: string[];
  /** Per-choice explanation block (collapsed pre, expanded after click). */
  choiceExplanation: string[];
  /**
   * "Correct option" badge inside the post-state correct row. Cleanest
   * single signal that we're in post.
   */
  correctBadge: string[];
  /**
   * "Incorrect option" badge inside any revealed-wrong row. Present in peri
   * and post.
   */
  incorrectBadge: string[];
  /** Outer wrapper carrying the per-row theme (state-encoded). */
  themeUnanswered: string[];
  themeUserFirstAttemptIncorrect: string[];
  themeAnswerOptionIncorrect: string[];
  themeAnswerOptionCorrect: string[];
  /**
   * Notes-button that carries `aria-controls="notes-editor-{ID}"`. The ID
   * suffix is the AMBOSS public question identifier (the same code the
   * student can filter on in Anki). Survives pre/peri/post for the same
   * question.
   */
  notesEditorButton: string[];
}

export const AMBOSS_SELECTORS: AmbossSelectorSet = {
  questionStem: [
    'section[aria-label="Question Text"]',
    'section[aria-label="Question text"]',
    'article[class*="--questionContent"]',
  ],
  choiceList: [
    'section[aria-label="Answer Options"]',
    'section[aria-label="Answer options"]',
  ],
  choiceItem: ['[data-e2e-test-id="answer-row"]'],
  choiceLetter: ['[data-testid="answer-letter"]'],
  // Filtering to /^answer-[a-z]$/ happens in the parser — the prefix selector
  // would otherwise also pick up `answer-row` / `answer-letter` siblings.
  choiceButton: ['button[data-e2e-test-id^="answer-"]'],
  choiceExplanation: ['[data-e2e-test-id="answerExplanation"]'],
  correctBadge: ['[aria-label="Correct option"]'],
  incorrectBadge: ['[aria-label="Incorrect option"]'],
  themeUnanswered: ['[data-e2e-test-id="answer-theme-unanswered"]'],
  themeUserFirstAttemptIncorrect: [
    '[data-e2e-test-id="answer-theme-userFirstAttemptIncorrect"]',
  ],
  themeAnswerOptionIncorrect: [
    '[data-e2e-test-id="answer-theme-answerOptionIncorrect"]',
  ],
  themeAnswerOptionCorrect: [
    '[data-e2e-test-id="answer-theme-answerOptionCorrect"]',
  ],
  notesEditorButton: ['[aria-controls^="notes-editor-"]'],
};

export function queryFirst(root: ParentNode, selectors: string[]): Element | null {
  for (const s of selectors) {
    try {
      const el = root.querySelector(s);
      if (el) return el;
    } catch {
      // ignore — some selectors may be rejected by the engine
    }
  }
  return null;
}

export function queryAll(root: ParentNode, selectors: string[]): Element[] {
  for (const s of selectors) {
    try {
      const els = Array.from(root.querySelectorAll(s));
      if (els.length > 0) return els;
    } catch {
      // skip
    }
  }
  return [];
}
