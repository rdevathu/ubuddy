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

import { useEffect, useState } from 'react';
import { streamChat } from '../llm/client';
import { MODEL_ID, MODEL_LABEL } from '../llm/model';
import { draftLearningPrompt } from '../llm/prompts';
import { useStore } from '../state/store';
import { upsertQuestion } from '../storage/db';
import { mapUworldSystem } from '../stepbuddy/classify';
import { MISS_TYPES, MISS_TYPE_LABELS, type MissType } from '../stepbuddy/client';
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

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasCorrect = explanation?.wasCorrect === true;

  // Wrong answer → open the card automatically. Right answer → keep collapsed
  // until the student clicks "Log learning". Default miss type follows the
  // outcome (`pure_learning` for right, `knowledge` for wrong) — they can
  // change it before logging.
  useEffect(() => {
    if (!explanation) return;
    setLogForm({
      open: !wasCorrect,
      missType: wasCorrect ? 'pure_learning' : 'knowledge',
      rule: '',
      drafting: false,
    });
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explanation?.questionHash]);

  if (!question || !explanation) return null;

  const stepbuddyReady = !!settings.stepbuddyEmail && !!settings.stepbuddyPassword;
  const mappedSystem = mapUworldSystem(explanation.system);
  const alreadyLogged = stepbuddy.status === 'logged';

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
        onDelta: (chunk) => appendLogFormRule(chunk),
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
        rule: logForm.rule.trim(),
      });

      setStepbuddy({ status: 'logging' });
      const r = await logToStepBuddy({
        settings,
        question,
        explanation,
        rule: logForm.rule,
        missType: logForm.missType,
      });
      if (r.ok) {
        setStepbuddy({ status: 'logged', message: `${r.system} · ${MISS_TYPE_LABELS[r.miss]}` });
      } else if ('skipped' in r && r.skipped) {
        setStepbuddy(
          r.reason === 'already logged'
            ? { status: 'logged', message: 'already logged' }
            : { status: 'idle' },
        );
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
            UWorld QID {question.questionId}
          </span>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
        Will log as{' '}
        <strong style={{ color: 'var(--fg)' }}>{mappedSystem}</strong>
        {explanation.system && explanation.system.toLowerCase() !== mappedSystem.toLowerCase() && (
          <> <span style={{ opacity: 0.7 }}>(UWorld: {explanation.system})</span></>
        )}
      </div>

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
          placeholder="Two to four sentences in your own words…"
          value={logForm.rule}
          onChange={(e) => setLogForm({ rule: e.target.value })}
          disabled={saving || logForm.drafting}
        />
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
