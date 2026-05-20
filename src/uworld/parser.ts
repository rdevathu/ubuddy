import type { AnswerChoice, ParsedExplanation, ParsedQuestion } from '../types';
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
 * checkbox label, item counter, ids, post-submit timing, status banners.
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
    .replace(/(References?|Medical Library|Copyright\s+©\s+UWorld[^]*)$/i, '')
    .trim();
}

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

function findStem(): { container: Element; stemText: string } | null {
  const direct = queryFirst(document, SELECTORS.questionContainer);
  if (direct) {
    const text = stripStemNoise(direct.textContent ?? '');
    if (text.length >= 30) return { container: direct, stemText: text };
  }

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
  return Array.from(document.querySelectorAll('input[type="radio"]')).map((r) => {
    const label = r.closest('label') || r.parentElement;
    return (label as Element) ?? r;
  });
}

function letterFor(idx: number): string {
  return String.fromCharCode(65 + idx);
}

function extractChoiceText(item: Element): { letter: string; text: string; percentage?: number } {
  let probe: Element | null = item;
  let raw = clean(probe.textContent);
  let depth = 0;
  while (raw.length < 3 && probe?.parentElement && depth < 4) {
    probe = probe.parentElement;
    raw = clean(probe.textContent);
    depth++;
  }
  const letterMatch = raw.match(/^([A-Z])[\.\)]\s*/);
  const pctMatch = raw.match(/\((\d+)\s*%\)/);
  let text = raw;
  let letter = '';
  if (letterMatch) {
    letter = letterMatch[1];
    text = text.replace(letterMatch[0], '');
  }
  if (pctMatch) text = text.replace(pctMatch[0], '');
  text = text.replace(/\b(Incorrect|Correct(\s+answer)?)\b/gi, '').trim();
  return {
    letter,
    text: text.replace(/\s+/g, ' ').trim(),
    percentage: pctMatch ? parseInt(pctMatch[1], 10) : undefined,
  };
}

function hasMarker(item: Element, kind: 'correct' | 'incorrect' | 'userPick'): boolean {
  const sel =
    kind === 'correct'
      ? SELECTORS.correctMarker
      : kind === 'incorrect'
        ? SELECTORS.incorrectMarker
        : SELECTORS.userPickMarker;
  return !!queryFirst(item, sel);
}

/** True when the choice list is in its post-grade state (radios disabled). */
function isGraded(): boolean {
  return !!queryFirst(document, SELECTORS.gradedFlag);
}

/**
 * Extract the QID from `div.question-details` text, which looks like
 *   "Item: 3 of 20 Question Id: 19996"
 * QID is any run of digits (no fixed width).
 */
function extractQuestionId(): { questionId?: string; questionNumber?: string } {
  const el = queryFirst(document, SELECTORS.questionIdContainer);
  if (!el) return {};
  const text = clean(el.textContent);
  const qid = text.match(/Question Id:\s*(\d+)/i)?.[1];
  return { questionId: qid, questionNumber: text || undefined };
}

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

function extractExhibits(container: Element): string[] {
  const choiceList = queryFirst(document, SELECTORS.choiceList);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of Array.from(container.querySelectorAll('a'))) {
    if (choiceList && choiceList.contains(a)) continue;
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
  if (items.length < 2) return null;

  const graded = isGraded();
  const choices: AnswerChoice[] = items.map((item, idx) => {
    const { letter, text, percentage } = extractChoiceText(item);
    return {
      letter: letter || letterFor(idx),
      text,
      percentage,
      // Markers only make sense post-grade.
      isCorrect: graded ? hasMarker(item, 'correct') : false,
      isUserPick: hasMarker(item, 'userPick'),
    };
  });

  const hasAnyText = choices.some((c) => c.text.length > 1);
  if (!hasAnyText) return null;

  const exhibits = extractExhibits(found.container);
  const { questionId, questionNumber } = extractQuestionId();

  return {
    questionHash: hashStem(stem),
    stem,
    choices,
    exhibits,
    questionId,
    questionNumber,
  };
}

/**
 * Read UWorld's `.standards` block at the bottom of the explanation. Each
 * column has a `.standard-description` (value) and a `.standard-header`
 * (label — "Subject" / "System" / "Topic"). We key by label, not column
 * order, in case UWorld ever reshuffles.
 */
function extractStandards(): { subject?: string; system?: string; topic?: string } {
  const fields = queryAll(document, SELECTORS.metadataField);
  const out: Record<string, string> = {};
  for (const f of fields) {
    const label = clean(f.querySelector('.standard-header')?.textContent).toLowerCase();
    const value = clean(f.querySelector('.standard-description')?.textContent);
    if (label && value) out[label] = value;
  }
  return { subject: out.subject, system: out.system, topic: out.topic };
}

export function parseExplanation(question: ParsedQuestion): ParsedExplanation | null {
  const exEl = queryFirst(document, SELECTORS.explanationContainer);
  if (!exEl) return null;
  if (!isGraded()) return null;

  const explanationText = stripExplanationNoise(clean(exEl.textContent));
  if (explanationText.length < 50) return null;

  const items = findChoiceItems();
  let correctLetter = '';
  let userLetter: string | undefined;
  items.forEach((item, idx) => {
    const letter = question.choices[idx]?.letter ?? letterFor(idx);
    if (hasMarker(item, 'correct')) correctLetter = letter;
    // User's pick = whichever row has the checked radio. The wrong-pick icon
    // is a secondary signal in case the radio class is ever cleared.
    if (hasMarker(item, 'userPick') || hasMarker(item, 'incorrect')) {
      userLetter = userLetter ?? letter;
    }
  });
  if (!correctLetter) return null;

  const { subject, system, topic } = extractStandards();

  return {
    questionHash: question.questionHash,
    explanationText,
    correctLetter,
    userLetter,
    wasCorrect: !!userLetter && userLetter === correctLetter,
    subject,
    system,
    topic,
  };
}

/** Click the radio for a given letter. Returns true if a click was dispatched. */
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

export function selectorHealth(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!findStem()) missing.push('questionStem');
  if (findChoiceItems().length < 2) missing.push('choiceList/choiceItem');
  return { ok: missing.length === 0, missing };
}
