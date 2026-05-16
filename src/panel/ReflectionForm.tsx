import { useState } from 'react';
import { useStore } from '../state/store';
import { type WhyWrong, WHY_WRONG_LABELS } from '../types';
import { upsertQuestion } from '../storage/db';
import { logWrongAnswer } from '../stepbuddy/log';

export function ReflectionForm() {
  const question = useStore((s) => s.question);
  const explanation = useStore((s) => s.explanation);
  const reflection = useStore((s) => s.reflection);
  const setReflection = useStore((s) => s.setReflection);
  const settings = useStore((s) => s.settings);
  const stepbuddy = useStore((s) => s.stepbuddy);
  const setStepbuddy = useStore((s) => s.setStepbuddy);
  const [saving, setSaving] = useState(false);

  if (!question || !explanation) return null;

  // The student's own takeaway, pushed on an explicit click. There is no
  // auto-logger — this is the ONE and only write to StepBuddy, so their
  // words always win and no update RPC is needed. Safe to call again on
  // failure: logWrongAnswer dedups on the persisted id (set only on success).
  async function pushToStepBuddy() {
    if (!question || !explanation || !settings.stepbuddyEnabled) return;
    setStepbuddy({ status: 'logging' });
    const r = await logWrongAnswer({
      settings,
      question,
      explanation,
      reflection: { whyWrong: reflection.whyWrong, keyLearning: reflection.keyLearning },
    });
    if (r.ok) setStepbuddy({ status: 'logged', message: `${r.system} · ${r.miss}` });
    else if ('skipped' in r && r.skipped)
      setStepbuddy(
        r.reason === 'already logged'
          ? { status: 'logged', message: 'already logged' }
          : { status: 'idle' },
      );
    else setStepbuddy({ status: 'error', message: r.error });
  }

  async function save() {
    if (!question || !explanation) return;
    setSaving(true);
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
        whyWrong: reflection.whyWrong,
        keyLearning: reflection.keyLearning,
      });
      setReflection({ saved: true });
      await pushToStepBuddy();
    } finally {
      setSaving(false);
    }
  }

  async function retry() {
    setSaving(true);
    try {
      await pushToStepBuddy();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h3>Reflection</h3>
      <label>
        Why did this miss?
        <select
          value={reflection.whyWrong ?? ''}
          onChange={(e) =>
            setReflection({ whyWrong: (e.target.value || undefined) as WhyWrong | undefined })
          }
        >
          <option value="">Select…</option>
          {(Object.keys(WHY_WRONG_LABELS) as WhyWrong[]).map((k) => (
            <option key={k} value={k}>
              {WHY_WRONG_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Key learning point
        <textarea
          rows={3}
          placeholder="One or two sentences in your own words — this is what gets logged to StepBuddy…"
          value={reflection.keyLearning ?? ''}
          onChange={(e) => setReflection({ keyLearning: e.target.value })}
        />
      </label>
      <div className="row row--end">
        {!reflection.saved ? (
          <button className="btn btn--primary" disabled={saving} onClick={save}>
            {saving
              ? 'Saving…'
              : settings.stepbuddyEnabled
                ? 'Save & log to StepBuddy'
                : 'Save reflection'}
          </button>
        ) : settings.stepbuddyEnabled && stepbuddy.status === 'error' ? (
          <>
            <span className="banner banner--err">Saved locally — StepBuddy push failed.</span>
            <button className="btn btn--primary" disabled={saving} onClick={retry}>
              {saving ? 'Retrying…' : 'Retry StepBuddy log'}
            </button>
          </>
        ) : (
          <span className="banner banner--ok">Saved.</span>
        )}
      </div>
    </div>
  );
}
