/**
 * Turn a UWorld question + its explanation into the fields StepBuddy needs
 * (`p_system_tag`, `p_miss_type`, `p_rule`).
 *
 * The system tag is DETERMINISTIC, not LLM-guessed: UWorld renders its own
 * "System" label in the post-grade DOM (the `.standards` block at the bottom
 * of the explanation — see parser.ts:extractStandards), and we map that
 * directly onto StepBuddy's `SystemTag`. The LLM is only needed for the rule
 * draft (which is offered to the student as a starting point, not auto-sent).
 *
 * `miss_type` is chosen by the caller (the inline log card has a dropdown)
 * and defaults to `knowledge` for wrong answers / `pure_learning` for right
 * answers when no other signal is available.
 */

import { completeChat } from '../llm/client';
import { MODEL_ID } from '../llm/model';
import { classifySystemPrompt, draftLearningPrompt } from '../llm/prompts';
import type { ParsedExplanation, ParsedQuestion } from '../types';
import { DEFAULT_SYSTEM_TAG, SYSTEM_TAGS, type SystemTag } from './client';

/**
 * UWorld's "System" labels → StepBuddy's `SystemTag` enum. Every UWorld
 * system in their canonical list has a mapping; anything outside that list
 * (rare — UWorld occasionally renames a category) falls through to
 * `Miscellaneous (MISC)`.
 *
 * Update both lists in lockstep with the source of truth:
 *   - UWorld:    user-visible category names on the live site
 *   - StepBuddy: `stepbuddy-v2/lib/constants.ts:SYSTEM_TAGS`
 */
const UWORLD_SYSTEM_MAP: Record<string, SystemTag> = {
  'allergy & immunology': 'Allergy & Immunology',
  'biostatistics & epidemiology': 'Biostatistics & Epidemiology',
  'cardiovascular system': 'Cardiovascular System (CV)',
  'dermatology': 'Dermatology (DERM)',
  'ear, nose & throat (ent)': 'Ear, Nose & Throat (ENT)',
  'endocrine, diabetes & metabolism': 'Endocrine (ENDO)',
  'female reproductive system & breast': 'Gynecology (GYN)',
  'gastrointestinal & nutrition': 'Gastrointestinal (GI)',
  'general principles': 'Miscellaneous (MISC)',
  'hematology & oncology': 'Hematology & Oncology (HEME-ONC)',
  'infectious diseases': 'Infectious Diseases (ID)',
  'male reproductive system': 'Male Reproductive System (URO)',
  'miscellaneous (multisystem)': 'Miscellaneous (MISC)',
  'nervous system': 'Nervous System (NEURO)',
  'ophthalmology': 'Ophthalmology (OPHTHO)',
  'poisoning & environmental exposure': 'Poisoning & Environmental Exposure',
  'pregnancy, childbirth & puerperium': 'Obstetrics (OB)',
  'psychiatric/behavioral & substance use disorder': 'Psychiatric/Behavioral (PSYCH)',
  'pulmonary & critical care': 'Pulmonary & Critical Care (PULM)',
  'renal, urinary systems & electrolytes': 'Nephrology (RENAL)',
  'rheumatology/orthopedics & sports': 'MSK & Orthopedics',
  'social sciences (ethics/legal/professional)': 'Social Sciences (Ethics/Legal/QI)',
};

/**
 * Map a UWorld "System" label (read from `.standards .standard`) onto a
 * StepBuddy SystemTag. Returns `Miscellaneous (MISC)` when:
 *   - the label is absent (older question / parser miss)
 *   - the label doesn't appear in the mapping table (UWorld renamed it)
 *
 * Comparison is lowercased + whitespace-collapsed, so trivial formatting
 * drift (extra spaces, capitalization) doesn't kick us to fallback.
 */
export function mapUworldSystem(uworldSystem: string | undefined | null): SystemTag {
  if (!uworldSystem) return DEFAULT_SYSTEM_TAG;
  const key = uworldSystem.replace(/\s+/g, ' ').trim().toLowerCase();
  return UWORLD_SYSTEM_MAP[key] ?? DEFAULT_SYSTEM_TAG;
}

/**
 * Coerce an arbitrary LLM response into a valid `SystemTag`. The classify
 * prompt instructs the model to return exactly one tag verbatim, but cheap
 * models occasionally wrap it in quotes / add punctuation / prefix with a
 * label. We strip those, then exact-match (case-insensitive) against the
 * allowed list. Falls back to `Miscellaneous (MISC)` on any miss so we never
 * push an invalid value to the RPC (which rejects unknown tags hard).
 */
function coerceSystemTag(raw: string): SystemTag {
  const cleaned = raw.replace(/[`"'*_]/g, '').replace(/\s+/g, ' ').trim();
  const lc = cleaned.toLowerCase();
  for (const t of SYSTEM_TAGS) {
    if (t.toLowerCase() === lc) return t;
  }
  // Tolerate a leading "Tag:" prefix or wrapping fluff — try to find any
  // allowed tag as a substring (longest match first to avoid e.g. catching
  // "Genetics" inside "Pediatric Genetics" hypotheticals).
  const byLen = [...SYSTEM_TAGS].sort((a, b) => b.length - a.length);
  for (const t of byLen) {
    if (lc.includes(t.toLowerCase())) return t;
  }
  return DEFAULT_SYSTEM_TAG;
}

/**
 * One-shot LLM classify of a question into a StepBuddy `SystemTag`. Used for
 * AMBOSS (and any future provider that doesn't expose system metadata in the
 * DOM). The caller is responsible for caching the result on the
 * `QuestionRecord` so we don't reclassify on every panel open.
 */
export async function classifySystemViaLLM(opts: {
  apiKey: string;
  question: ParsedQuestion;
}): Promise<SystemTag> {
  const { system, user } = classifySystemPrompt(opts.question, SYSTEM_TAGS);
  const raw = await completeChat({
    apiKey: opts.apiKey,
    model: MODEL_ID,
    temperature: 0,
    messages: [
      { id: 'sys', role: 'system', content: system },
      { id: 'u', role: 'user', content: user },
    ],
  });
  return coerceSystemTag(raw);
}

function clampRule(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 2000 ? t.slice(0, 1997).trimEnd() + '…' : t;
}

/**
 * Ask the LLM to draft a 2-4 sentence learning takeaway. Returns the raw
 * string the student then edits. Throws on a hard LLM/network failure —
 * callers should surface the error in-line.
 */
export async function draftLearningRule(opts: {
  apiKey: string;
  question: ParsedQuestion;
  explanation: ParsedExplanation;
}): Promise<string> {
  const { system, user } = draftLearningPrompt(opts.question, opts.explanation);
  const raw = await completeChat({
    apiKey: opts.apiKey,
    model: MODEL_ID,
    temperature: 0.2,
    messages: [
      { id: 'sys', role: 'system', content: system },
      { id: 'u', role: 'user', content: user },
    ],
  });
  return clampRule(raw);
}
