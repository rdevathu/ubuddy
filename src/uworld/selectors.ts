/**
 * Single source of truth for UWorld DOM selectors.
 *
 * Each entry has multiple candidate selectors tried in order. UWorld occasionally
 * tweaks class names, so we lean on stable class fragments and ARIA roles before
 * specific class names. When everything breaks, this is the only file to edit.
 *
 * Post-grade selectors were verified against a captured `.mhtml`. The icons
 * (`fa-check` / `fa-times`) and `mat-radio-checked` class are what UWorld
 * actually paints — `[class*="correct"]` matches never hit on the real DOM.
 */
export interface SelectorSet {
  /** Container that wraps the question stem text. */
  questionContainer: string[];
  /** Container that wraps the question id / number indicator. */
  questionIdContainer: string[];
  /** Container that wraps the answer choice list. */
  choiceList: string[];
  /** Each individual answer-choice row (must be queried under choiceList). */
  choiceItem: string[];
  /** The radio input within a choice row (for forwarded clicks). */
  choiceRadio: string[];
  /**
   * Element inside a row when the row IS the correct answer (post-grade).
   * UWorld renders a `fa-check` icon in the left `<td>`; absent on every
   * other row and absent on every row pre-grade.
   */
  correctMarker: string[];
  /**
   * Element inside a row when the row is the user's WRONG pick (post-grade).
   * UWorld renders `fa-times` in the left `<td>` on the picked row when the
   * pick was wrong; absent on the correct row even if the user picked it,
   * and absent on every row pre-grade.
   */
  incorrectMarker: string[];
  /**
   * Element inside a row when the row's radio is checked (i.e. the row the
   * user picked, irrespective of correctness). Combine with `correctMarker`
   * to detect "picked AND correct".
   */
  userPickMarker: string[];
  /**
   * Single-query check that flips from absent (ungraded) to present (graded).
   * Every choice's radio becomes `mat-radio-disabled` the instant the
   * question is graded; none are disabled pre-submit.
   */
  gradedFlag: string[];
  /** Container that holds the explanation panel once submitted. */
  explanationContainer: string[];
  /**
   * UWorld's "standards" block at the bottom of the explanation: a row of
   * `.standard` columns, each with a `.standard-description` (value) and a
   * `.standard-header` (label — "Subject" / "System" / "Topic"). Only renders
   * post-grade and is what we use to deterministically map onto StepBuddy's
   * SystemTag instead of guessing with the LLM.
   */
  metadataField: string[];
}

export const SELECTORS: SelectorSet = {
  questionContainer: [
    '#questionText',
    '[class*="QuestionStem"]',
    '[data-testid*="question-stem"]',
    '[class*="question-stem"]',
    '[class*="question-content"] > p',
    'div[class*="stem"]',
  ],
  // QID + "Item: X of Y" both live in `div.question-details`. Parse the
  // parent's text — the inner span only carries the label, not the number.
  questionIdContainer: [
    'div.question-details',
    '[class*="question-details"]',
    '[class*="QuestionId"]',
    '[class*="question-id"]',
    '[data-testid*="question-id"]',
    '.questionindex',
  ],
  choiceList: [
    '#answerContainer',
    '.answer-container',
    '[role="radiogroup"]',
    '[class*="AnswerChoices"]',
    '[class*="answer-choices"]',
  ],
  choiceItem: [
    'tr.answer-choice-background',
    '.answer-choice-background',
    '[class*="AnswerChoice"]',
    '[class*="answer-choice"]',
    'label',
  ],
  choiceRadio: ['input[type="radio"]', '[role="radio"]'],
  // Scope to `td.left-td` so we can't accidentally match an icon inside the
  // answer text itself.
  correctMarker: [
    'td.left-td i.fa-check',
    'td.left-td .fa-check',
    'i.fa-check',
    '.fa-check',
  ],
  incorrectMarker: [
    'td.left-td i.fa-times',
    'td.left-td .fa-times',
    'i.fa-times',
    '.fa-times',
  ],
  userPickMarker: [
    'mat-radio-button.mat-radio-checked',
    '.mat-radio-checked',
    'input[type="radio"]:checked',
  ],
  gradedFlag: [
    '#answerContainer mat-radio-button.mat-radio-disabled',
    '#answerContainer .mat-radio-disabled',
    '#answerContainer [aria-disabled="true"][role="radio"]',
  ],
  explanationContainer: [
    '#explanation',
    '.explanation #explanation',
    '[class*="Explanation"]',
    '[class*="explanation"]:not(.explanation-placeholder)',
    '[data-testid*="explanation"]',
  ],
  metadataField: [
    '.standards .standard',
    '[class*="standards"] [class*="standard"]:not([class*="standard-"])',
  ],
};

export function queryFirst(root: ParentNode, selectors: string[]): Element | null {
  for (const s of selectors) {
    try {
      const el = root.querySelector(s);
      if (el) return el;
    } catch {
      // some selectors may be rejected by the engine — skip
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
      // skip selectors the engine rejects
    }
  }
  return [];
}
