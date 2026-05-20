/**
 * Ground truth for each `Example Pages/*.mhtml` fixture.
 *
 * Extracted by hand from the captured DOM (see scripts/extract_fixtures.py-
 * style work in the test history). These are the facts the parser is
 * supposed to recover; tests compare its output against this table.
 *
 * Heads-up: the filenames are NOT a guarantee of pre/post pairing. Match by
 * `qid` if you need a pre+post pair:
 *   - 15174  → "1 - pre" + "1 post"     (correct: D, picked: D)
 *   - 12130  → "2 - post" only          (correct: C, picked: C)
 *   - 3725   → "2 - pre"  + "3 post"    (correct: C, picked: A) ← misnamed!
 *   - 107283 → "4 pre"   + "4 post"     (correct: A, picked: C)
 *   - 12267  → "5 pre"   + "5 post"     (correct: E, picked: C)
 */

import type { SystemTag } from '../src/stepbuddy/client';

export interface FixtureFacts {
  /** Filename under `Example Pages/`. */
  file: string;
  /** UWorld question id (any-length integer). */
  qid: string;
  itemNumber: string;
  /** Always 5 in these captures, but checked anyway. */
  choiceCount: number;
  /** Whether the question has been submitted (radios disabled). */
  graded: boolean;
  /** First ~100 chars of the cleaned stem — substring match. */
  stemPrefix: string;
  /** Only populated when `graded` is true. */
  correctLetter?: string;
  /** Letter of the row whose radio is `mat-radio-checked`. May exist pre-grade if the student picked but didn't submit. */
  userLetter?: string;
  /** `userLetter === correctLetter` — only meaningful when graded. */
  wasCorrect?: boolean;
  hasExplanation: boolean;
  /** From the `.standards` block at the bottom of the explanation. */
  standards?: { subject: string; system: string; topic: string };
  /** Expected StepBuddy SystemTag after mapping. Only when graded. */
  mappedSystem?: SystemTag;
}

export const FIXTURES: FixtureFacts[] = [
  {
    file: '1 - pre.mhtml',
    qid: '15174',
    itemNumber: '1 of 5',
    choiceCount: 5,
    graded: false,
    stemPrefix: 'A 17-year-old nulligravid girl comes to the office due to 2 months of colicky',
    hasExplanation: false,
  },
  {
    file: '1 post.mhtml',
    qid: '15174',
    itemNumber: '1 of 5',
    choiceCount: 5,
    graded: true,
    correctLetter: 'D',
    userLetter: 'D',
    wasCorrect: true,
    stemPrefix: 'A 17-year-old nulligravid girl comes to the office due to 2 months of colicky',
    hasExplanation: true,
    standards: {
      subject: 'OBGYN',
      system: 'Female Reproductive System & Breast',
      topic: 'Ovarian cancer',
    },
    mappedSystem: 'Gynecology (GYN)',
  },
  {
    file: '2 - pre.mhtml',
    qid: '3725',
    itemNumber: '3 of 5',
    choiceCount: 5,
    graded: false,
    stemPrefix: 'A 45-year-old man comes to the office due to a 4-month history of headaches',
    hasExplanation: false,
  },
  {
    file: '2 - post.mhtml',
    qid: '12130',
    itemNumber: '2 of 5',
    choiceCount: 5,
    graded: true,
    correctLetter: 'C',
    userLetter: 'C',
    wasCorrect: true,
    stemPrefix:
      'A 31-year-old woman, gravida 3 aborta 3, comes to the office for an annual examination',
    hasExplanation: true,
    standards: {
      subject: 'Ambulatory Medicine',
      system: 'Female Reproductive System & Breast',
      topic: 'Contraception',
    },
    mappedSystem: 'Gynecology (GYN)',
  },
  {
    file: '3 post.mhtml',
    qid: '3725',
    itemNumber: '3 of 5',
    choiceCount: 5,
    graded: true,
    correctLetter: 'C',
    userLetter: 'A',
    wasCorrect: false,
    stemPrefix: 'A 45-year-old man comes to the office due to a 4-month history of headaches',
    hasExplanation: true,
    standards: {
      subject: 'Clinical Neurology',
      system: 'Nervous System',
      topic: 'Brain tumors',
    },
    mappedSystem: 'Nervous System (NEURO)',
  },
  {
    file: '4 pre.mhtml',
    qid: '107283',
    itemNumber: '4 of 5',
    choiceCount: 5,
    graded: false,
    stemPrefix: 'A 27-year-old woman was found alone and unconscious at the scene of a house fire',
    hasExplanation: false,
  },
  {
    file: '4 post.mhtml',
    qid: '107283',
    itemNumber: '4 of 5',
    choiceCount: 5,
    graded: true,
    correctLetter: 'A',
    userLetter: 'C',
    wasCorrect: false,
    stemPrefix: 'A 27-year-old woman was found alone and unconscious at the scene of a house fire',
    hasExplanation: true,
    standards: {
      subject: 'Emergency Medicine',
      system: 'Poisoning & Environmental Exposure',
      topic: 'Cyanide poisoning',
    },
    mappedSystem: 'Poisoning & Environmental Exposure',
  },
  {
    file: '5 pre.mhtml',
    qid: '12267',
    itemNumber: '5 of 5',
    choiceCount: 5,
    graded: false,
    stemPrefix: 'A 1-year-old boy is brought to the office for evaluation of fever and rash',
    hasExplanation: false,
  },
  {
    file: '5 post.mhtml',
    qid: '12267',
    itemNumber: '5 of 5',
    choiceCount: 5,
    graded: true,
    correctLetter: 'E',
    userLetter: 'C',
    wasCorrect: false,
    stemPrefix: 'A 1-year-old boy is brought to the office for evaluation of fever and rash',
    hasExplanation: true,
    standards: {
      subject: 'Family Medicine',
      system: 'Infectious Diseases',
      topic: 'Immunizations',
    },
    mappedSystem: 'Infectious Diseases (ID)',
  },
];

export const PRE_FIXTURES = FIXTURES.filter((f) => !f.graded);
export const POST_FIXTURES = FIXTURES.filter((f) => f.graded);
