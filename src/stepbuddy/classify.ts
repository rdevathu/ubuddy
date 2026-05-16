/**
 * Turn a wrong UWorld answer + its official explanation into the three fields
 * StepBuddy can't infer for us: `p_system_tag`, `p_miss_type`, `p_rule`.
 *
 * UWorld's DOM does NOT expose its subject taxonomy in anything we parse, so
 * there is nothing to "map" — the explanation text is the only signal. We let
 * the already-configured OpenRouter LLM read the explanation and emit strict
 * JSON, then hard-validate every field against the allowed enums (the RPC
 * validates too, but a bad value there costs a round-trip + a thrown error).
 */

import { completeChat } from '../llm/client';
import type { ParsedExplanation, ParsedQuestion, WhyWrong } from '../types';
import { MISS_TYPES, SYSTEM_TAGS, type MissType, type SystemTag } from './client';

export interface ClassifiedMistake {
  system_tag: SystemTag;
  miss_type: MissType;
  rule: string;
}

/**
 * Map the panel's local reflection reason onto a StepBuddy miss_type. Used for
 * the no-LLM fallback path (logging straight off the reflection form) and to
 * let an explicit reflection override the LLM's guess.
 */
export function mapWhyWrong(why: WhyWrong | undefined): MissType {
  switch (why) {
    case 'knowledge_gap':
      return 'knowledge';
    case 'forgot_value':
      return 'knowledge';
    case 'misread':
      return 'stem_error';
    case 'wrong_ddx':
      return 'framework';
    case 'test_strategy':
      return 'framework';
    case 'other':
      return 'other';
    default:
      return 'knowledge';
  }
}

function clampRule(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 2000 ? t.slice(0, 1997).trimEnd() + '…' : t;
}

/** Cheap fallback rule if the LLM gives nothing usable: first explanation sentence. */
function ruleFromExplanation(explanation: ParsedExplanation): string {
  const objective = explanation.explanationText.match(
    /Educational objective:?\s*([^]*?)(?:References?|Medical Library|$)/i,
  );
  const base = (objective?.[1] ?? explanation.explanationText).trim();
  const firstSentence = base.match(/[^.?!]+[.?!]/)?.[0]?.trim();
  return clampRule(firstSentence || base.slice(0, 240));
}

function coerceSystemTag(v: unknown): SystemTag {
  const s = String(v ?? '').trim();
  const hit = SYSTEM_TAGS.find((t) => t.toLowerCase() === s.toLowerCase());
  return hit ?? 'Misc';
}

function coerceMissType(v: unknown): MissType {
  const s = String(v ?? '').trim().toLowerCase();
  const hit = MISS_TYPES.find((t) => t === s);
  return hit ?? 'knowledge';
}

/** Pull the first balanced-ish JSON object out of a model response. */
function extractJson(text: string): any | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = [
  'You categorize a med student\'s missed board-style question for their mistake log.',
  'You are given the question, the choices (with which the student picked and which is correct), and the OFFICIAL explanation.',
  'Return ONLY a single minified JSON object, no markdown, no prose, with exactly these keys:',
  '  "system_tag": one of ' + SYSTEM_TAGS.join(', '),
  '  "miss_type": one of ' + MISS_TYPES.join(', '),
  '  "rule": a single crisp, generalizable takeaway the student should remember next time.',
  '',
  'system_tag = the organ system / discipline the question primarily tests (use Misc only if truly none fit).',
  'miss_type guidance:',
  '  knowledge          — didn\'t know the fact/association.',
  '  framework          — knew the facts but applied the wrong approach/algorithm.',
  '  stem_error         — misread or missed a detail in the stem.',
  '  right_wrong_reason — got it right-ish but for a flawed reason, or eliminated the right answer wrongly.',
  '  confused           — two choices looked equivalent; couldn\'t discriminate.',
  '  silly_mistake      — knew it, fat-fingered / careless.',
  '  got_lucky          — guessed.',
  '  other              — none of the above.',
  'When unsure between knowledge and framework, prefer knowledge.',
  '',
  'rule rules: ONE or TWO sentences, ≤240 chars, imperative/declarative principle the student can reuse',
  '(e.g. "Beta-blockers blunt hypoglycemia awareness — watch in diabetics."). No "the answer is", no choice letters, no preamble.',
].join('\n');

/**
 * Ask the LLM to classify the miss. Throws only on a hard LLM/network failure;
 * any malformed field is coerced to a safe default rather than thrown.
 */
export async function classifyMistake(opts: {
  apiKey: string;
  model: string;
  question: ParsedQuestion;
  explanation: ParsedExplanation;
}): Promise<ClassifiedMistake> {
  const { question, explanation } = opts;
  const choices = question.choices
    .map(
      (c) =>
        `${c.letter}. ${c.text}` +
        (c.letter === explanation.correctLetter ? '  [correct]' : '') +
        (c.letter === explanation.userLetter ? '  [student picked]' : ''),
    )
    .join('\n');

  const user = [
    'QUESTION:',
    question.stem.slice(0, 6000),
    '',
    'CHOICES:',
    choices,
    '',
    `Student picked ${explanation.userLetter ?? '(unknown)'}; correct is ${explanation.correctLetter}.`,
    '',
    'OFFICIAL EXPLANATION:',
    explanation.explanationText.slice(0, 8000),
    '',
    'Return the JSON now.',
  ].join('\n');

  const raw = await completeChat({
    apiKey: opts.apiKey,
    model: opts.model,
    temperature: 0,
    messages: [
      { id: 'sys', role: 'system', content: SYSTEM_PROMPT },
      { id: 'u', role: 'user', content: user },
    ],
  });

  const parsed = extractJson(raw);
  const rule = clampRule(String(parsed?.rule ?? '').trim()) || ruleFromExplanation(explanation);
  return {
    system_tag: coerceSystemTag(parsed?.system_tag),
    miss_type: coerceMissType(parsed?.miss_type),
    rule,
  };
}
