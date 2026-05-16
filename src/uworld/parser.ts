import type { AnswerChoice, ParsedExplanation, ParsedQuestion } from '../types';
import { extractLabs } from './labs';
import { SELECTORS, queryAll, queryFirst } from './selectors';

function hashStem(stem: string): string {
  let h = 0;
  for (let i = 0; i < stem.length; i++) {
    h = (h * 31 + stem.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Strip UWorld UI noise that ends up in raw textContent: "Mark Question"
 * checkbox label, item counter, ids, post-submit timing, status banners,
 * and the explanation footer artifacts.
 */
function stripStemNoise(text: string): string {
  return text
    .replace(/\bMark Question\b/gi, '')
    .replace(/\bItem:\s*\d+\s*of\s*\d+\b/gi, '')
    .replace(/\bQuestion Id:\s*\d+\b/gi, '')
    .replace(/\bUser Id:\s*\d+\b/gi, '')
    .replace(/\bTime Spent\b/gi, '')
    .replace(/\bAnswered (in)?correctly\b/gi, '')
    .replace(/\bCorrect answer\s+[A-Z]\s*\d*%?/gi, '')
    .replace(/\b\d+\s*mins?,?\s*\d+\s*secs?\b/gi, '')
    .replace(/\bBlock Time Elapsed:\s*[\d:]+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripExplanationNoise(text: string): string {
  return stripStemNoise(text)
    // Drop the trailing metadata/references block that follows "Educational objective:".
    .replace(/(References?|Medical Library|Copyright\s+©\s+UWorld[^]*)$/i, '')
    .trim();
}

/**
 * Collect text from `root`, walking in document order, stopping when we hit
 * `marker`. Skips any subtree whose className mentions "explanation" so we
 * don't leak the right-side panel into the stem.
 */
function collectTextBefore(root: Element, marker: Element): string {
  const parts: string[] = [];
  let stopped = false;
  function walk(node: Node): void {
    if (stopped) return;
    if (node === marker) {
      stopped = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? '').trim();
      if (t) parts.push(t);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const cls = el.className?.toString?.().toLowerCase() ?? '';
      if (cls.includes('explanation')) return;
      for (const child of Array.from(el.childNodes)) walk(child);
    }
  }
  walk(root);
  return parts.join(' ');
}

/**
 * Find the stem text.
 *
 * Strategy in order of preference:
 *   1. UWorld's well-known `#questionText` div (or class-based equivalents).
 *      This is the most reliable when present — it contains ONLY the stem,
 *      no toolbar text, no explanation.
 *   2. If that fails, anchor on the choice list and collect the text that
 *      appears before it in DOM order, scoped to a sensible ancestor.
 *
 * Returns null if neither path produces enough text — the MutationObserver
 * will retry on the next DOM tick, which handles the "panel opened before
 * Angular finished hydrating" case cleanly.
 */
function findStem(): { container: Element; stemText: string } | null {
  // Primary: UWorld's exact stem container.
  const direct = queryFirst(document, SELECTORS.questionContainer);
  if (direct) {
    const text = stripStemNoise(direct.textContent ?? '');
    if (text.length >= 30) return { container: direct, stemText: text };
  }

  // Fallback: anchor on the choice list and walk back.
  const choices = queryFirst(document, SELECTORS.choiceList);
  if (!choices) return null;

  let parent: Element | null = choices.parentElement;
  let depth = 0;
  while (parent && depth < 5) {
    const len = parent.textContent?.length ?? 0;
    if (len > 200 && len < 8000) break;
    if (len >= 8000) {
      parent = null;
      break;
    }
    parent = parent.parentElement;
    depth++;
  }
  if (!parent) return null;

  const raw = collectTextBefore(parent, choices);
  const stemText = stripStemNoise(raw);
  if (stemText.length < 30) return null;
  return { container: parent, stemText };
}

function findChoiceItems(): Element[] {
  const list = queryFirst(document, SELECTORS.choiceList);
  if (list) {
    const items = queryAll(list, SELECTORS.choiceItem);
    if (items.length >= 2) return items;
  }
  // fallback: top-level radios anywhere on the page
  return Array.from(document.querySelectorAll('input[type="radio"]')).map((r) => {
    const label = r.closest('label') || r.parentElement;
    return (label as Element) ?? r;
  });
}

function letterFor(idx: number): string {
  return String.fromCharCode(65 + idx);
}

function extractChoiceText(item: Element): { letter: string; text: string; percentage?: number } {
  // If the matched element is a bare <input type="radio"> or a wrapper that
  // doesn't carry the label text, walk up to the closest ancestor that does.
  let probe: Element | null = item;
  let raw = clean(probe.textContent);
  let depth = 0;
  while (raw.length < 3 && probe?.parentElement && depth < 4) {
    probe = probe.parentElement;
    raw = clean(probe.textContent);
    depth++;
  }
  // common: "A.  Antiemetics and serial examinations  (7%)"
  const letterMatch = raw.match(/^([A-Z])[\.\)]\s*/);
  const pctMatch = raw.match(/\((\d+)\s*%\)/);
  let text = raw;
  let letter = '';
  if (letterMatch) {
    letter = letterMatch[1];
    text = text.replace(letterMatch[0], '');
  }
  if (pctMatch) text = text.replace(pctMatch[0], '');
  // post-submit DOM embeds "Incorrect" / "Correct" badge text inside the choice
  // element — strip so the choice text is just the answer itself.
  text = text.replace(/\b(Incorrect|Correct(\s+answer)?)\b/gi, '').trim();
  return {
    letter,
    text: text.replace(/\s+/g, ' ').trim(),
    percentage: pctMatch ? parseInt(pctMatch[1], 10) : undefined,
  };
}

function detectMarker(item: Element, kind: 'correct' | 'incorrect'): boolean {
  const sel = kind === 'correct' ? SELECTORS.correctMarker : SELECTORS.incorrectMarker;
  if (queryFirst(item, sel)) return true;
  // last-ditch: visual class names on the row itself
  const cls = item.className?.toString().toLowerCase() ?? '';
  if (kind === 'correct' && cls.includes('correct') && !cls.includes('incorrect')) return true;
  if (kind === 'incorrect' && (cls.includes('incorrect') || cls.includes('wrong'))) return true;
  return false;
}

function detectUserPick(item: Element): boolean {
  const radio = item.querySelector<HTMLInputElement>('input[type="radio"]');
  if (radio?.checked) return true;
  const aria = item.getAttribute('aria-checked');
  if (aria === 'true') return true;
  return false;
}

// UWorld toolbar / nav controls are also <a> elements. When the stem falls
// back to a broad ancestor container these can leak in, so we filter them out
// of exhibit detection by their (case-insensitive) label.
const NON_EXHIBIT_ANCHOR = [
  'mark question',
  'full screen',
  'tutorial',
  'lab values',
  'open lab values',
  'notes',
  'open notes dialog',
  'calculator',
  'calc',
  'feedback',
  'suspend',
  'end block',
  'previous',
  'next',
  'submit',
  'flag',
  'reverse color',
  'settings',
  'help',
];

/**
 * UWorld embeds exhibits / media / images as bare `<a>exhibit</a>` anchors in
 * the stem (Angular click handlers, no href). `textContent` flattens them to a
 * plain word, so the student easily misses that there's something to open.
 * Collect the link labels so the panel can surface a can't-miss flag.
 */
function extractExhibits(container: Element): string[] {
  const choiceList = queryFirst(document, SELECTORS.choiceList);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of Array.from(container.querySelectorAll('a'))) {
    if (choiceList && choiceList.contains(a)) continue; // skip choice-row anchors
    const label = clean(a.textContent);
    if (!label || label.length > 80) continue;
    if (NON_EXHIBIT_ANCHOR.some((t) => label.toLowerCase().includes(t))) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= 6) break;
  }
  return out;
}

export function parseQuestion(): ParsedQuestion | null {
  const found = findStem();
  if (!found) return null;
  const stem = found.stemText;
  if (stem.length < 30) return null;

  const items = findChoiceItems();
  // Need real choices, not a half-rendered page. A UWorld question always
  // has at least two answer choices.
  if (items.length < 2) return null;

  const choices: AnswerChoice[] = items.map((item, idx) => {
    const { letter, text, percentage } = extractChoiceText(item);
    return {
      letter: letter || letterFor(idx),
      text,
      percentage,
      isCorrect: detectMarker(item, 'correct'),
      isUserPick: detectUserPick(item),
    };
  });

  // If every choice text is empty, the parser hasn't found the real labels yet.
  // Bail so the observer can retry on the next mutation.
  const hasAnyText = choices.some((c) => c.text.length > 1);
  if (!hasAnyText) return null;

  const labs = extractLabs(stem);
  const exhibits = extractExhibits(found.container);
  const idEl = queryFirst(document, SELECTORS.questionIdContainer);
  const idText = clean(idEl?.textContent);
  const idMatch = idText.match(/(\d{3,})/);

  return {
    questionHash: hashStem(stem),
    stem,
    vitals: [],
    labs,
    choices,
    exhibits,
    questionId: idMatch?.[1],
    questionNumber: idText || undefined,
  };
}

export function parseExplanation(question: ParsedQuestion): ParsedExplanation | null {
  const exEl = queryFirst(document, SELECTORS.explanationContainer);
  if (!exEl) return null;
  const explanationText = stripExplanationNoise(clean(exEl.textContent));
  if (explanationText.length < 50) return null;

  const items = findChoiceItems();
  let correctLetter = '';
  let userLetter: string | undefined;
  items.forEach((item, idx) => {
    const letter = question.choices[idx]?.letter ?? letterFor(idx);
    if (detectMarker(item, 'correct')) correctLetter = letter;
    if (detectUserPick(item) || detectMarker(item, 'incorrect')) userLetter = userLetter ?? letter;
  });
  if (!correctLetter) return null;

  return {
    questionHash: question.questionHash,
    explanationText,
    correctLetter,
    userLetter,
    wasCorrect: !!userLetter && userLetter === correctLetter,
  };
}

/**
 * Click the radio for a given letter. Returns true if a click was dispatched.
 */
export function forwardClick(letter: string): boolean {
  const items = findChoiceItems();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { letter: extracted } = extractChoiceText(item);
    const itemLetter = extracted || letterFor(i);
    if (itemLetter.toUpperCase() !== letter.toUpperCase()) continue;
    const radio = item.querySelector<HTMLInputElement>('input[type="radio"]');
    const target: HTMLElement = radio ?? (item as HTMLElement);
    target.click();
    return true;
  }
  return false;
}

/**
 * Health check used by the side panel — surfaces broken selectors immediately.
 */
export function selectorHealth(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!findStem()) missing.push('questionStem');
  if (findChoiceItems().length < 2) missing.push('choiceList/choiceItem');
  return { ok: missing.length === 0, missing };
}
