/**
 * The single entry point for "this answer was wrong → push it to StepBuddy".
 *
 * There is NO auto-logger. The ONLY caller is ReflectionForm's explicit
 * "Save & log to StepBuddy" button (and its retry on failure), so the row
 * always carries the student's own words — no race, no update RPC needed.
 * Dedup still lives here, not at the call site, because:
 *
 *   - the RPC has no upsert — every call inserts a row, so a double-click,
 *     a retry after a *partial* success, or an SPA re-emit / panel reopen
 *     would duplicate the mistake. We guard on the persisted
 *     `stepbuddyMistakeId` (survives panel reopen / SPA re-emit) AND an
 *     in-memory in-flight set (guards the gap before the id is persisted).
 *
 * Result is a plain discriminated union — callers turn it into UI, this never
 * throws for an expected condition (disabled, correct, already logged, no
 * credentials, no way to produce a rule).
 */

import type { AppSettings, ParsedExplanation, ParsedQuestion, WhyWrong } from '../types';
import { getQuestionByHash, setStepbuddyMistakeId } from '../storage/db';
import { classifyMistake, mapWhyWrong } from './classify';
import { getSession, logMistake } from './client';

export type LogResult =
  | { ok: true; id: string; system: string; miss: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; error: string };

const inFlight = new Set<string>();

/** Local YYYY-MM-DD (not UTC — avoids logging "yesterday" near midnight). */
function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function logWrongAnswer(opts: {
  settings: AppSettings;
  question: ParsedQuestion;
  explanation: ParsedExplanation;
  /** Present when triggered from the reflection form — the student's own words win. */
  reflection?: { whyWrong?: WhyWrong; keyLearning?: string };
}): Promise<LogResult> {
  const { settings, question, explanation, reflection } = opts;
  const hash = question.questionHash;

  if (!settings.stepbuddyEnabled) return { ok: false, skipped: true, reason: 'disabled' };
  if (explanation.wasCorrect) return { ok: false, skipped: true, reason: 'not a miss' };

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
    const hasLLM = !!settings.openrouterApiKey && !!settings.llmModel;
    let system_tag: import('./client').SystemTag = 'Misc';
    let miss_type: import('./client').MissType = mapWhyWrong(reflection?.whyWrong);
    let rule = (reflection?.keyLearning ?? '').trim();

    if (hasLLM) {
      const c = await classifyMistake({
        apiKey: settings.openrouterApiKey,
        model: settings.llmModel,
        question,
        explanation,
      });
      system_tag = c.system_tag;
      // The student's explicit reflection beats the model's guess.
      rule = rule || c.rule;
      miss_type = reflection?.whyWrong ? mapWhyWrong(reflection.whyWrong) : c.miss_type;
    } else if (!rule) {
      // No LLM and no reflection → we have no defensible rule. The RPC requires
      // a non-empty one, so don't send junk; tell the caller why.
      return {
        ok: false,
        error:
          'Pick a chat model in Settings (for an auto-written rule) or save a reflection first.',
      };
    }

    const id = await logMistake({
      p_date: todayLocal(),
      p_source: 'UWorld',
      p_system_tag: system_tag,
      p_rule: rule,
      p_miss_type: miss_type,
      p_identifier: question.questionId?.slice(0, 80),
      p_source_other: null,
      p_tags: [],
      p_anki_card_made: false,
    });

    await setStepbuddyMistakeId(hash, id);
    return { ok: true, id, system: system_tag, miss: miss_type };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    inFlight.delete(hash);
  }
}
