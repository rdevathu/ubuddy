/**
 * The single entry point for "push this question to StepBuddy". Handles both
 * wrong-answer mistakes and right-answer "pure_learning" entries — they're
 * the same RPC; only `miss_type` differs.
 *
 * The student's `rule` and `miss_type` come from the caller (the inline log
 * card). The `system_tag` is mapped deterministically from UWorld's own
 * `.standards` "System" label (see classify.ts:mapUworldSystem). No LLM call
 * is needed at log time — the LLM only ever runs when the student clicks
 * "Auto-draft" earlier to seed the rule field.
 *
 * Dedup lives here, not at the call site, because the RPC has no upsert: a
 * double-click / SPA re-emit / panel reopen would otherwise duplicate the
 * row. Guards: the persisted `stepbuddyMistakeId` (survives panel reopen)
 * plus an in-memory in-flight set (covers the gap before id is persisted).
 */

import type { AppSettings, ParsedExplanation, ParsedQuestion } from '../types';
import { getQuestionByHash, setStepbuddyMistakeId } from '../storage/db';
import { mapUworldSystem } from './classify';
import { getSession, logMistake, type MissType, type SystemTag } from './client';

export type LogResult =
  | { ok: true; id: string; system: string; miss: MissType }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; error: string };

const inFlight = new Set<string>();

/** Local YYYY-MM-DD (not UTC — avoids logging "yesterday" near midnight). */
function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface LogOpts {
  settings: AppSettings;
  question: ParsedQuestion;
  explanation: ParsedExplanation;
  /** The student's takeaway. Required — the RPC rejects an empty rule. */
  rule: string;
  /**
   * Hashtags the student typed (`#foo`) parsed out of the raw textarea
   * before it was trimmed to `rule`. Forwarded to the RPC as `p_tags`.
   * Optional — empty/missing means no tags. The AI-draft path never emits
   * these (LogCard strips `#` from streamed deltas), so any tag here came
   * from a human keystroke.
   */
  tags?: string[];
  /** How they want this categorized. `pure_learning` for right-answer logs. */
  missType: MissType;
  /**
   * Manual system_tag override. When provided, wins over the deterministic
   * mapping from UWorld's `.standards` label — escape hatch for when the
   * student disagrees with UWorld or UWorld renames a category we don't know.
   */
  systemOverride?: SystemTag | null;
}

export async function logToStepBuddy(opts: LogOpts): Promise<LogResult> {
  const { question, explanation, rule, tags, missType, systemOverride } = opts;
  const hash = question.questionHash;

  const trimmedRule = rule.trim();
  if (!trimmedRule) {
    return { ok: false, error: 'Write a takeaway before logging — the rule field can\'t be empty.' };
  }

  const existing = await getQuestionByHash(hash);
  if (existing?.stepbuddyMistakeId) {
    return { ok: false, skipped: true, reason: 'already logged' };
  }
  if (!(await getSession())) {
    return { ok: false, error: 'Not signed in to StepBuddy — sign in under Settings.' };
  }
  if (inFlight.has(hash)) return { ok: false, skipped: true, reason: 'in progress' };
  inFlight.add(hash);

  try {
    const system_tag = systemOverride ?? mapUworldSystem(explanation.system);
    const id = await logMistake({
      p_date: todayLocal(),
      p_source: 'UWorld',
      p_system_tag: system_tag,
      p_rule: trimmedRule,
      p_miss_type: missType,
      p_identifier: question.questionId?.slice(0, 80),
      p_source_other: null,
      p_tags: tags && tags.length ? tags.slice(0, 20) : [],
      p_anki_card_made: false,
    });

    await setStepbuddyMistakeId(hash, id);
    return { ok: true, id, system: system_tag, miss: missType };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    inFlight.delete(hash);
  }
}
