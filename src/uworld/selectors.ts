/**
 * Single source of truth for UWorld DOM selectors.
 *
 * Each entry has multiple candidate selectors tried in order. UWorld occasionally
 * tweaks class names, so we lean on stable class fragments and ARIA roles before
 * specific class names. When everything breaks, this is the only file to edit.
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
  /** Marker shown next to the correct answer (e.g. green check). */
  correctMarker: string[];
  /** Marker shown next to the user's wrong pick (e.g. red X). */
  incorrectMarker: string[];
  /** Container that holds the explanation panel once submitted. */
  explanationContainer: string[];
}

export const SELECTORS: SelectorSet = {
  // UWorld's actual stem container is `#questionText` (Angular app id). Class
  // fallbacks cover other UWorld surfaces (USMLE, Step 2/3, NBME, etc.).
  questionContainer: [
    '#questionText',
    '[class*="QuestionStem"]',
    '[data-testid*="question-stem"]',
    '[class*="question-stem"]',
    '[class*="question-content"] > p',
    'div[class*="stem"]',
  ],
  questionIdContainer: [
    '[class*="QuestionId"]',
    '[class*="question-id"]',
    '[data-testid*="question-id"]',
    '.questionindex',
  ],
  // UWorld puts every choice in a single `<table id="answerContainer" class="answer-container">`.
  // Each `mat-radio-group` only wraps one choice, so the table itself is our list anchor.
  choiceList: [
    '#answerContainer',
    '.answer-container',
    '[role="radiogroup"]',
    '[class*="AnswerChoices"]',
    '[class*="answer-choices"]',
  ],
  // Each choice is a `<tr class="...answer-choice-background...">` containing
  // a letter span, a radio, and an answer-choice-content cell.
  choiceItem: [
    'tr.answer-choice-background',
    '.answer-choice-background',
    '[class*="AnswerChoice"]',
    '[class*="answer-choice"]',
    'label',
  ],
  choiceRadio: ['input[type="radio"]', '[role="radio"]'],
  correctMarker: [
    '[class*="correct"]:not([class*="incorrect"])',
    '[class*="Correct"]:not([class*="Incorrect"])',
    'svg[aria-label*="correct" i]',
    '[data-correct="true"]',
  ],
  incorrectMarker: [
    '[class*="incorrect"]',
    '[class*="Incorrect"]',
    '[class*="wrong"]',
    'svg[aria-label*="incorrect" i]',
  ],
  // UWorld renders the explanation into `<div id="explanation">` once submitted.
  explanationContainer: [
    '#explanation',
    '.explanation #explanation',
    '[class*="Explanation"]',
    '[class*="explanation"]:not(.explanation-placeholder)',
    '[data-testid*="explanation"]',
  ],
};

export function queryFirst(root: ParentNode, selectors: string[]): Element | null {
  for (const s of selectors) {
    const el = root.querySelector(s);
    if (el) return el;
  }
  return null;
}

export function queryAll(root: ParentNode, selectors: string[]): Element[] {
  for (const s of selectors) {
    const els = Array.from(root.querySelectorAll(s));
    if (els.length > 0) return els;
  }
  return [];
}
