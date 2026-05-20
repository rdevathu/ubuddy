/**
 * Parser regression suite against captured UWorld pages.
 *
 * The selectors in `src/uworld/selectors.ts` are the most fragile surface in
 * the codebase — UWorld can ship a CSS rename any week. These tests assert
 * that the parser still recovers the facts a real student would need:
 *
 *   - stem text (with UI noise stripped)
 *   - QID and item counter
 *   - choice list (count + letters)
 *   - graded-state detection (so we never read post-grade markers on a
 *     pre-grade DOM and vice versa)
 *   - correct row, user's pick row, wasCorrect
 *   - the `.standards` Subject / System / Topic block
 *
 * If a test starts failing, the captured DOM is ground truth — either
 * UWorld changed (update the selector) or the parser regressed.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import {
  parseExplanation,
  parseQuestion,
  selectorHealth,
} from '../src/uworld/parser';
import { FIXTURES, POST_FIXTURES, PRE_FIXTURES } from './fixtureMetadata';
import { fixturePath, loadFixture, type LoadedFixture } from './fixtures';

// The MHTML captures are local-only and gitignored. Skip the whole suite
// gracefully if a fresh checkout doesn't have them — better than red Xs the
// reader can't act on.
const HAS_FIXTURES = FIXTURES.every((f) => existsSync(fixturePath(f.file)));
const maybeDescribe = HAS_FIXTURES ? describe : describe.skip;

if (!HAS_FIXTURES) {
  console.warn(
    '[parser.test] skipping fixture suite — `Example Pages/` missing. ' +
      'Save a UWorld page as MHTML to populate it.',
  );
}

maybeDescribe('parseQuestion', () => {
  let loaded: LoadedFixture | null = null;
  afterEach(() => {
    loaded?.dispose();
    loaded = null;
  });

  for (const fx of FIXTURES) {
    test(`${fx.file} — extracts stem + choices + QID`, () => {
      loaded = loadFixture(fx.file);
      const q = parseQuestion();
      expect(q).not.toBeNull();
      if (!q) return;

      expect(q.questionId).toBe(fx.qid);
      // questionNumber holds the raw `div.question-details` text, which includes
      // both "Item: X of Y" and "Question Id: …" — we only assert containment.
      expect(q.questionNumber).toContain(fx.itemNumber);
      expect(q.questionNumber).toContain(fx.qid);

      expect(q.choices.length).toBe(fx.choiceCount);
      const letters = q.choices.map((c) => c.letter);
      expect(letters).toEqual(['A', 'B', 'C', 'D', 'E']);
      // Every choice should have non-empty text after noise stripping — a
      // blank choice means our text extractor is matching the wrong element.
      for (const c of q.choices) {
        expect(c.text.length).toBeGreaterThan(0);
      }

      expect(q.stem.startsWith(fx.stemPrefix)).toBe(true);
      // Noise scrubber should remove the UI chrome strings.
      expect(q.stem).not.toContain('Mark Question');
      expect(q.stem).not.toContain('Question Id:');
      expect(q.stem).not.toContain('Item:');

      // questionHash is content-derived; same stem → same hash. Use it as a
      // smoke check that hashing is deterministic.
      const again = parseQuestion();
      expect(again).not.toBeNull();
      expect(q.questionHash).toBe(again!.questionHash);
    });
  }

  test('selectorHealth reports ok on a real fixture', () => {
    loaded = loadFixture(FIXTURES[0].file);
    const h = selectorHealth();
    expect(h.ok).toBe(true);
    expect(h.missing).toEqual([]);
  });
});

maybeDescribe('parseQuestion — pre-grade vs post-grade marker behavior', () => {
  let loaded: LoadedFixture | null = null;
  afterEach(() => {
    loaded?.dispose();
    loaded = null;
  });

  for (const fx of PRE_FIXTURES) {
    test(`${fx.file} — no choice is flagged isCorrect (ungraded DOM)`, () => {
      loaded = loadFixture(fx.file);
      const q = parseQuestion();
      expect(q).not.toBeNull();
      if (!q) return;
      // isCorrect must NEVER be true on an ungraded page — that's the bug
      // the gradedFlag selector exists to prevent.
      expect(q.choices.some((c) => c.isCorrect)).toBe(false);
    });
  }

  for (const fx of POST_FIXTURES) {
    test(`${fx.file} — exactly one choice is flagged isCorrect`, () => {
      loaded = loadFixture(fx.file);
      const q = parseQuestion();
      expect(q).not.toBeNull();
      if (!q) return;
      const correctChoices = q.choices.filter((c) => c.isCorrect);
      expect(correctChoices.length).toBe(1);
      expect(correctChoices[0]!.letter).toBe(fx.correctLetter!);

      if (fx.userLetter) {
        const userChoices = q.choices.filter((c) => c.isUserPick);
        expect(userChoices.length).toBe(1);
        expect(userChoices[0]!.letter).toBe(fx.userLetter);
      }
    });
  }
});

maybeDescribe('parseExplanation', () => {
  let loaded: LoadedFixture | null = null;
  afterEach(() => {
    loaded?.dispose();
    loaded = null;
  });

  for (const fx of PRE_FIXTURES) {
    test(`${fx.file} — returns null pre-grade`, () => {
      loaded = loadFixture(fx.file);
      const q = parseQuestion();
      expect(q).not.toBeNull();
      if (!q) return;
      // No `#explanation` element + no graded flag → must return null.
      expect(parseExplanation(q)).toBeNull();
    });
  }

  for (const fx of POST_FIXTURES) {
    test(`${fx.file} — recovers correctLetter / userLetter / wasCorrect`, () => {
      loaded = loadFixture(fx.file);
      const q = parseQuestion();
      expect(q).not.toBeNull();
      if (!q) return;
      const ex = parseExplanation(q);
      expect(ex).not.toBeNull();
      if (!ex) return;

      expect(ex.correctLetter).toBe(fx.correctLetter!);
      if (fx.userLetter) expect(ex.userLetter).toBe(fx.userLetter);
      expect(ex.wasCorrect).toBe(fx.wasCorrect!);

      // Explanation text should be substantial and free of trailing
      // references / copyright noise.
      expect(ex.explanationText.length).toBeGreaterThan(100);
      expect(ex.explanationText).not.toMatch(/Copyright\s+©\s+UWorld/i);
      expect(ex.explanationText).not.toMatch(/^References:/i);
    });

    test(`${fx.file} — extracts Subject / System / Topic from .standards`, () => {
      loaded = loadFixture(fx.file);
      const q = parseQuestion();
      expect(q).not.toBeNull();
      if (!q) return;
      const ex = parseExplanation(q);
      expect(ex).not.toBeNull();
      if (!ex) return;

      expect(ex.subject).toBe(fx.standards!.subject);
      expect(ex.system).toBe(fx.standards!.system);
      expect(ex.topic).toBe(fx.standards!.topic);
    });
  }
});
