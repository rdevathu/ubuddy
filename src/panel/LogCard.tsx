/**
 * Inline mistake / learning logger.
 *
 * Lives at the TOP of the side panel as a prominent card whenever the question
 * has been graded. Behavior:
 *
 *   - Wrong answer  → the card auto-opens immediately. All fields the RPC
 *                     needs are pre-filled (date = today, source = UWorld,
 *                     identifier = QID, system_tag = mapped from UWorld's own
 *                     System label). The student picks a miss type and writes
 *                     the rule (or clicks "Auto-draft" to seed it from the
 *                     explanation), then hits "Log to StepBuddy".
 *   - Right answer  → the card is collapsed to a single "Log learning"
 *                     button. Click expands the same form with miss_type
 *                     pre-set to `pure_learning`.
 *
 * The rule textarea NEVER auto-fills on its own (avoids spending tokens when
 * the student already knows what they want to write). The LLM is only invoked
 * on an explicit "Auto-draft" click.
 *
 * Submitting goes through `logToStepBuddy`, which owns dedup — so a misclick
 * / retry / SPA re-emit can't double-log.
 */

import { useEffect, useMemo, useState } from 'react';
import { streamChat } from '../llm/client';
import { MODEL_ID, MODEL_LABEL } from '../llm/model';
import { draftLearningPrompt } from '../llm/prompts';
import { useStore } from '../state/store';
import { getQuestionByHash, upsertQuestion } from '../storage/db';
import { mapUworldSystem } from '../stepbuddy/classify';
import { parseRule } from '../stepbuddy/parseRule';
import {
  DEFAULT_SYSTEM_TAG,
  MISS_TYPES,
  MISS_TYPE_LABELS,
  SYSTEM_TAGS,
  type MissType,
  type SystemTag,
} from '../stepbuddy/client';
import { logToStepBuddy } from '../stepbuddy/log';

const WRONG_MISS_TYPES: MissType[] = [
  'knowledge',
  'framework',
  'stem_error',
  'right_wrong_reason',
  'confused',
  'silly_mistake',
  'got_lucky',
  'other',
];

export function LogCard() {
  const question = useStore((s) => s.question);
  const explanation = useStore((s) => s.explanation);
  const settings = useStore((s) => s.settings);
  const logForm = useStore((s) => s.logForm);
  const setLogForm = useStore((s) => s.setLogForm);
  const appendLogFormRule = useStore((s) => s.appendLogFormRule);
  const stepbuddy = useStore((s) => s.stepbuddy);
  const setStepbuddy = useStore((s) => s.setStepbuddy);
  const classifiedSystem = useStore((s) => s.classifiedSystem);
  const classifying = useStore((s) => s.classifying);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasCorrect = explanation?.wasCorrect === true;

  // Wrong answer → open the card automatically. Right answer → keep collapsed
  // until the student clicks "Log learning". Default miss type follows the
  // outcome (`pure_learning` for right, `knowledge` for wrong) — they can
  // change it before logging.
  //
  // Re-visit case: if this question already has a persisted `stepbuddyMistakeId`
  // in Dexie from an earlier panel session, restore the "logged" banner instead
  // of re-opening the form. Without this lookup, navigating away and back to a
  // graded question would re-show the empty log card as if nothing happened.
  useEffect(() => {
    if (!explanation || !question) return;
    let cancelled = false;
    setError(null);
    (async () => {
      const existing = await getQuestionByHash(question.questionHash);
      if (cancelled) return;
      if (existing?.stepbuddyMistakeId) {
        setStepbuddy({ status: 'logged', message: 'already logged' });
        setLogForm({
          open: false,
          missType: wasCorrect ? 'pure_learning' : 'knowledge',
          rule: '',
          systemOverride: null,
          drafting: false,
        });
      } else {
        setLogForm({
          open: !wasCorrect,
          missType: wasCorrect ? 'pure_learning' : 'knowledge',
          rule: '',
          systemOverride: null,
          drafting: false,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explanation?.questionHash]);

  // Live preview of `#tags` the student has typed into the takeaway. Recomputed
  // on every keystroke so the chip row matches exactly what `save` will send.
  // Must sit above the null-guard return so hook order stays stable across the
  // pre-grade → graded transition (otherwise React #310).
  const parsedTags = useMemo(() => parseRule(logForm.rule).tags, [logForm.rule]);

  if (!question || !explanation) return null;

  const stepbuddyReady = !!settings.stepbuddyEmail && !!settings.stepbuddyPassword;
  const isAmboss = question.source === 'amboss';
  // For AMBOSS the auto-pick is the LLM classification (defaulting to MISC
  // while the classify call is still in flight or when no API key is set).
  // For UWorld it's the deterministic mapping from the `.standards` block.
  const mappedSystem: SystemTag = isAmboss
    ? (classifiedSystem ?? DEFAULT_SYSTEM_TAG)
    : mapUworldSystem(explanation.system);
  const effectiveSystem: SystemTag = logForm.systemOverride ?? mappedSystem;
  const isOverridden = logForm.systemOverride !== null && logForm.systemOverride !== mappedSystem;
  const alreadyLogged = stepbuddy.status === 'logged';
  const sourceLabel = isAmboss ? 'AMBOSS' : 'UWorld';

  const allowedMissTypes = wasCorrect
    ? (['pure_learning', ...WRONG_MISS_TYPES.filter((m) => m !== 'pure_learning')] as MissType[])
    : WRONG_MISS_TYPES;

  async function autoDraft() {
    if (!question || !explanation) return;
    if (!settings.openrouterApiKey) {
      setError('Add your OpenRouter API key in Settings to auto-draft.');
      return;
    }
    setError(null);
    setLogForm({ rule: '', drafting: true });
    const { system, user } = draftLearningPrompt(question, explanation);
    streamChat(
      {
        apiKey: settings.openrouterApiKey,
        model: MODEL_ID,
        temperature: 0.2,
        messages: [
          { id: 'sys', role: 'system', content: system },
          { id: 'u', role: 'user', content: user },
        ],
      },
      {
        // Strip every `#` from streamed deltas. The takeaway textarea uses
        // `#tag` to mark user-typed tags (see parseRule); the AI must never
        // be able to inject one, even if the system prompt slips.
        onDelta: (chunk) => appendLogFormRule(chunk.replace(/#/g, '')),
        onDone: () => setLogForm({ drafting: false }),
        onError: (err) => {
          setLogForm({ drafting: false });
          setError(`[${MODEL_LABEL}] ${err.message}`);
        },
      },
    );
  }

  async function save() {
    if (!question || !explanation) return;
    setSaving(true);
    setError(null);
    try {
      // Pull `#tag` tokens the student typed out of the rule body. The
      // cleaned `rule` (no hashtag substrings) is what gets persisted and
      // sent — the tags ride along as `p_tags`.
      const { rule: cleanedRule, tags } = parseRule(logForm.rule);

      await upsertQuestion({
        questionHash: question.questionHash,
        questionId: question.questionId,
        timestamp: Date.now(),
        stem: question.stem,
        choices: question.choices.map((c) => ({ letter: c.letter, text: c.text })),
        userPick: explanation.userLetter ?? '',
        correctAnswer: explanation.correctLetter,
        wasCorrect: explanation.wasCorrect,
        explanationText: explanation.explanationText,
        rule: cleanedRule,
      });

      setStepbuddy({ status: 'logging' });
      const r = await logToStepBuddy({
        settings,
        question,
        explanation,
        rule: cleanedRule,
        tags,
        missType: logForm.missType,
        systemOverride: logForm.systemOverride,
        classifiedSystem,
      });
      if (r.ok) {
        setStepbuddy({ status: 'logged', message: `${r.system} · ${MISS_TYPE_LABELS[r.miss]}` });
        setLogForm({ open: false });
      } else if ('skipped' in r && r.skipped) {
        if (r.reason === 'already logged') {
          setStepbuddy({ status: 'logged', message: 'already logged' });
          setLogForm({ open: false });
        } else {
          setStepbuddy({ status: 'idle' });
        }
      } else {
        setStepbuddy({ status: 'error', message: r.error });
        setError(r.error);
      }
    } finally {
      setSaving(false);
    }
  }

  // Right-answer collapsed state: a single button to expand the form.
  if (wasCorrect && !logForm.open && !alreadyLogged) {
    return (
      <div className="card">
        <div className="row">
          <div style={{ flex: 1 }}>
            <strong style={{ color: 'var(--green)' }}>Correct.</strong>{' '}
            <span style={{ color: 'var(--fg-dim)' }}>
              Want to save the takeaway?
            </span>
          </div>
          <button
            className="btn btn--primary btn--small"
            onClick={() => setLogForm({ open: true })}
          >
            Log learning
          </button>
        </div>
      </div>
    );
  }

  if (alreadyLogged && !logForm.open) {
    return (
      <div className="card">
        <div className="banner banner--ok">
          Logged to StepBuddy{stepbuddy.message ? ` · ${stepbuddy.message}` : ''}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row">
        <h3 style={{ flex: 1, margin: 0 }}>
          {wasCorrect ? 'Log learning' : 'Log this miss'}
        </h3>
        {question.questionId && (
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
            {sourceLabel} QID {question.questionId}
          </span>
        )}
      </div>

      <label>
        System
        <select
          value={effectiveSystem}
          onChange={(e) => {
            const picked = e.target.value as SystemTag;
            setLogForm({ systemOverride: picked === mappedSystem ? null : picked });
          }}
          disabled={saving}
        >
          {SYSTEM_TAGS.map((s) => (
            <option key={s} value={s}>
              {s}
              {s === mappedSystem
                ? isAmboss
                  ? classifiedSystem
                    ? ' (AI pick)'
                    : ''
                  : ' (from UWorld)'
                : ''}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
          {isOverridden ? (
            <>
              Overriding{' '}
              {isAmboss ? 'AI pick' : 'UWorld’s'}{' '}
              <strong style={{ color: 'var(--fg)' }}>{mappedSystem}</strong>
              {!isAmboss && explanation.system && (
                <> <span style={{ opacity: 0.7 }}>(label: {explanation.system})</span></>
              )}
              {' · '}
              <button
                type="button"
                className="btn--link"
                onClick={() => setLogForm({ systemOverride: null })}
                disabled={saving}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                reset
              </button>
            </>
          ) : isAmboss ? (
            classifying ? (
              <>Classifying system with AI…</>
            ) : classifiedSystem ? (
              <>Auto-picked by AI (AMBOSS doesn’t expose a system label).</>
            ) : settings.openrouterApiKey ? (
              <>No classification yet — pick a system manually.</>
            ) : (
              <>Add an OpenRouter key in Settings for AI classification.</>
            )
          ) : (
            <>Auto-picked from UWorld’s System label.</>
          )}
        </div>
      </label>

      <label>
        Miss type
        <select
          value={logForm.missType}
          onChange={(e) => setLogForm({ missType: e.target.value as MissType })}
          disabled={saving}
        >
          {allowedMissTypes
            .filter((m) => MISS_TYPES.includes(m))
            .map((m) => (
              <option key={m} value={m}>
                {MISS_TYPE_LABELS[m]}
              </option>
            ))}
        </select>
      </label>

      <label>
        Takeaway (this is what gets logged)
        <textarea
          rows={4}
          placeholder="Two to four sentences in your own words. Add #tags inline to categorize…"
          value={logForm.rule}
          onChange={(e) => setLogForm({ rule: e.target.value })}
          disabled={saving || logForm.drafting}
        />
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4, minHeight: 16 }}>
          {parsedTags.length > 0 ? (
            <span>
              Tags:{' '}
              {parsedTags.map((t, i) => (
                <span key={t}>
                  <span style={{ color: 'var(--accent)' }}>#{t}</span>
                  {i < parsedTags.length - 1 ? ' ' : ''}
                </span>
              ))}
            </span>
          ) : (
            <span>Type <code>#tagname</code> anywhere to add a tag. Auto-draft never adds tags.</span>
          )}
        </div>
      </label>

      {error && <div className="banner banner--err">{error}</div>}
      {!stepbuddyReady && (
        <div className="banner banner--warn">
          Add your StepBuddy email + password in Settings to enable logging.
        </div>
      )}

      <div className="row row--end">
        <button
          className="btn btn--small"
          onClick={autoDraft}
          disabled={saving || logForm.drafting || !settings.openrouterApiKey}
          title="Use the LLM to draft a 2-4 sentence takeaway from the explanation"
        >
          {logForm.drafting ? 'Drafting…' : 'Auto-draft'}
        </button>
        {wasCorrect && (
          <button
            className="btn btn--small"
            onClick={() => setLogForm({ open: false })}
            disabled={saving}
          >
            Cancel
          </button>
        )}
        <button
          className="btn btn--primary"
          onClick={save}
          disabled={
            saving || logForm.drafting || !logForm.rule.trim() || !stepbuddyReady
          }
        >
          {saving ? 'Logging…' : 'Log to StepBuddy'}
        </button>
      </div>
    </div>
  );
}
