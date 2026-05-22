/**
 * AMBOSS parser smoke tests against the three captured states (pre / peri /
 * post) of the same question.
 *
 * The capture files are plain HTML (not MHTML like the UWorld fixtures), so
 * this file loads them with a tiny inline helper instead of going through
 * `fixtures.ts:loadFixture`. Same global-swap pattern though.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';
import {
  detectState,
  parseExplanation,
  parseQuestion,
  selectorHealth,
} from '../src/amboss/parser';

function ambossFixtureDir(): string | null {
  let dir = path.resolve(import.meta.dir, '..');
  for (let i = 0; i < 8; i++) {
    const cand = path.join(dir, 'Example Pages', 'AMBOSS');
    if (existsSync(cand)) return cand;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

const FIX_DIR = ambossFixtureDir();
const has = FIX_DIR !== null;

function load(filename: string) {
  const html = readFileSync(path.join(FIX_DIR!, filename), 'utf8');
  const window = new Window({ url: 'https://next.amboss.com/' });
  window.document.documentElement.innerHTML = html.replace(/^<!DOCTYPE[^>]*>/i, '');
  const prev = {
    document: (globalThis as any).document,
    Node: (globalThis as any).Node,
    Element: (globalThis as any).Element,
    HTMLElement: (globalThis as any).HTMLElement,
    window: (globalThis as any).window,
  };
  (globalThis as any).document = window.document;
  (globalThis as any).Node = window.Node;
  (globalThis as any).Element = window.Element;
  (globalThis as any).HTMLElement = window.HTMLElement;
  (globalThis as any).window = window;
  return {
    dispose() {
      (globalThis as any).document = prev.document;
      (globalThis as any).Node = prev.Node;
      (globalThis as any).Element = prev.Element;
      (globalThis as any).HTMLElement = prev.HTMLElement;
      (globalThis as any).window = prev.window;
      try {
        (window as any).happyDOM?.close?.();
      } catch {
        /* ignore */
      }
    },
  };
}

const maybe = has ? describe : describe.skip;

maybe('amboss parser', () => {
  let loaded: { dispose: () => void } | null = null;
  afterEach(() => {
    loaded?.dispose();
    loaded = null;
  });

  test('pre: parses stem + 7 choices, no grading, state=pre', () => {
    loaded = load('AMBOSS 5 pre.html');
    const q = parseQuestion();
    expect(q).not.toBeNull();
    if (!q) return;
    expect(q.source).toBe('amboss');
    expect(q.stem.length).toBeGreaterThan(50);
    expect(q.choices.length).toBe(7);
    expect(q.choices.map((c) => c.letter)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(q.choices.every((c) => c.text.length > 0)).toBe(true);
    expect(q.choices.every((c) => !c.isCorrect && !c.isUserPick)).toBe(true);
    expect(detectState()).toBe('pre');
    // QID hook (`aria-controls="notes-editor-{ID}"`).
    expect(q.questionId).toBe('5s0ivh');
    // Explanation parse should return null pre-grade.
    expect(parseExplanation(q)).toBeNull();
    expect(selectorHealth().ok).toBe(true);
  });

  test('peri: detects state=peri, fires explanation with wasCorrect=false', () => {
    loaded = load('AMBOSS 5 peri.html');
    const q = parseQuestion();
    expect(q).not.toBeNull();
    if (!q) return;
    expect(detectState()).toBe('peri');
    // First-attempt-wrong row should be flagged as the user pick.
    const userPick = q.choices.find((c) => c.isUserPick);
    expect(userPick).toBeDefined();
    expect(userPick?.letter).toBe('A');
    // No correct flagged yet in peri.
    expect(q.choices.some((c) => c.isCorrect)).toBe(false);

    const ex = parseExplanation(q);
    expect(ex).not.toBeNull();
    if (!ex) return;
    expect(ex.wasCorrect).toBe(false);
    expect(ex.userLetter).toBe('A');
    // Correct letter not yet revealed in peri — should be empty string.
    expect(ex.correctLetter).toBe('');
    // At least the wrong-pick rationale should be in there.
    expect(ex.explanationText.length).toBeGreaterThan(20);
  });

  test('post: detects state=post, surfaces correct letter, wasCorrect=false', () => {
    loaded = load('AMBOSS 5 post.html');
    const q = parseQuestion();
    expect(q).not.toBeNull();
    if (!q) return;
    expect(detectState()).toBe('post');

    // The captured sample is "first wrong (A), eventually right (G)".
    const correct = q.choices.find((c) => c.isCorrect);
    expect(correct?.letter).toBe('G');
    const userPick = q.choices.find((c) => c.isUserPick);
    expect(userPick?.letter).toBe('A');

    const ex = parseExplanation(q);
    expect(ex).not.toBeNull();
    if (!ex) return;
    expect(ex.correctLetter).toBe('G');
    expect(ex.userLetter).toBe('A');
    expect(ex.wasCorrect).toBe(false);
    // Multiple per-row rationales should be concatenated.
    expect(ex.explanationText.length).toBeGreaterThan(100);
    // AMBOSS exposes no system metadata — must be undefined.
    expect(ex.system).toBeUndefined();
    expect(ex.subject).toBeUndefined();
    expect(ex.topic).toBeUndefined();
  });

  test('QID is stable across pre/peri/post for the same question', () => {
    loaded = load('AMBOSS 5 pre.html');
    const a = parseQuestion()?.questionId;
    loaded.dispose();
    loaded = load('AMBOSS 5 peri.html');
    const b = parseQuestion()?.questionId;
    loaded.dispose();
    loaded = load('AMBOSS 5 post.html');
    const c = parseQuestion()?.questionId;
    expect(a).toBe('5s0ivh');
    expect(b).toBe('5s0ivh');
    expect(c).toBe('5s0ivh');
  });
});
