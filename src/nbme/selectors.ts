/**
 * Single source of truth for NBME DOM selectors.
 *
 * NBME exams run on starttest.com inside a frameset. The TOP page is a shell
 * with toolbar/header; the actual question lives inside an iframe named
 * `ElementDisplayFrame` whose src is `itd.aspx?cmd=item&data=…`. Both parent
 * and iframe are same-origin (starttest.com), so a content script registered
 * with `all_frames: true` runs inside the iframe and can see `.ITSStem`
 * directly. The other iframes on the page (`ExhibitFrame`, `VariableFrame`,
 * `infoPopUpFrame`, `UpToDateFrame`) don't contain the question; the parser
 * bails on them because `.ITSStem` is absent.
 *
 * NBME exams in UBuddy's flow are ALWAYS in review mode — the user reviews
 * one question at a time after submitting the whole exam. There's no
 * pre-answered state, so we treat every parse as graded.
 *
 * Verified against two captures:
 *   - q1 (section 1, question 1, correct answer B)
 *   - q2 (section 1, question 2)
 */

export interface NbmeSelectorSet {
  /** The stem container — `<div id="itmstem1" class="… ITSStem">`. */
  questionStem: string[];
  /** The inner text node holding only the stem prose (no item number, no toolbar). */
  questionStemText: string[];
  /** All answer-choice option tables (one per choice). */
  choiceTables: string[];
  /** The "On" option table is the one whose row is the selected/correct row. */
  /** Letter pill inside an option table — `.ITSMCOptionLabelText[On]`. */
  choiceLetter: string[];
  /** Text body inside an option table — `.ITSMCOptionText[On]`. */
  choiceText: string[];
  /** Solution / explanation div. */
  solution: string[];
}

export const NBME_SELECTORS: NbmeSelectorSet = {
  questionStem: ['.ITSStem', '#itmstem1'],
  questionStemText: ['.ITSStemText', '.ITSStemText > div'],
  choiceTables: ['.ITSMCOptionTable, .ITSMCOptionTableOn'],
  choiceLetter: ['.ITSMCOptionLabelText, .ITSMCOptionLabelTextOn'],
  choiceText: ['.ITSMCOptionText, .ITSMCOptionTextOn'],
  solution: ['.SOLUTION', '.CSOLUTION', '[solution="1"]'],
};

export function queryFirst(root: ParentNode, selectors: string[]): Element | null {
  for (const s of selectors) {
    try {
      const el = root.querySelector(s);
      if (el) return el;
    } catch {
      // ignore
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
      // ignore
    }
  }
  return [];
}
