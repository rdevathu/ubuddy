import { useEffect, useState } from 'react';
import { MODEL_ID, MODEL_LABEL } from '../llm/model';
import { useStore } from '../state/store';
import { clearSession, getSession, signIn } from '../stepbuddy/client';
import { recentQuestions } from '../storage/db';
import { saveSettings } from '../storage/settings';
import type { AppSettings, QuestionRecord } from '../types';

export function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [history, setHistory] = useState<QuestionRecord[]>([]);

  const [sbSignedInAs, setSbSignedInAs] = useState<string | null>(null);
  const [sbBusy, setSbBusy] = useState(false);
  const [sbError, setSbError] = useState<string | null>(null);

  useEffect(() => setDraft(settings), [settings]);

  useEffect(() => {
    getSession().then((s) => setSbSignedInAs(s?.email ?? null));
  }, []);

  useEffect(() => {
    recentQuestions(20).then(setHistory);
  }, [savedAt]);

  async function save() {
    const next = await saveSettings(draft);
    setSettings(next);
    setSavedAt(Date.now());
  }

  function update<K extends keyof AppSettings>(key: K, val: AppSettings[K]) {
    setDraft({ ...draft, [key]: val });
  }

  async function stepbuddySignIn() {
    setSbBusy(true);
    setSbError(null);
    try {
      // Persist creds first so the session can be silently re-minted later.
      const next = await saveSettings(draft);
      setSettings(next);
      const session = await signIn(draft.stepbuddyEmail.trim(), draft.stepbuddyPassword);
      setSbSignedInAs(session.email);
    } catch (e) {
      setSbError(e instanceof Error ? e.message : String(e));
      setSbSignedInAs(null);
    } finally {
      setSbBusy(false);
    }
  }

  async function stepbuddySignOut() {
    await clearSession();
    setSbSignedInAs(null);
    setSbError(null);
  }

  return (
    <div className="body">
      <div className="card">
        <h3>OpenRouter</h3>
        <label>
          API key
          <input
            type="password"
            value={draft.openrouterApiKey}
            onChange={(e) => update('openrouterApiKey', e.target.value)}
            placeholder="sk-or-..."
          />
        </label>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
          Model: <strong style={{ color: 'var(--fg)' }}>{MODEL_LABEL}</strong>{' '}
          <span style={{ opacity: 0.7 }}>({MODEL_ID})</span>
        </div>
      </div>

      <div className="card">
        <h3>NBME</h3>
        <label>
          Current exam #
          <input
            type="text"
            inputMode="numeric"
            value={draft.nbmeExam}
            onChange={(e) => update('nbmeExam', e.target.value)}
            placeholder="e.g. 11"
          />
        </label>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
          Sticky — UBuddy prepends this to <code>{'{section}-{question}'}</code>{' '}
          when logging NBME items (e.g. <code>11-2-5</code>). Change it when you
          switch to a different NBME form. NBME pages don't expose the exam #
          themselves.
        </div>
      </div>

      <div className="card">
        <h3>StepBuddy</h3>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            value={draft.stepbuddyEmail}
            onChange={(e) => update('stepbuddyEmail', e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={draft.stepbuddyPassword}
            onChange={(e) => update('stepbuddyPassword', e.target.value)}
            placeholder="StepBuddy password"
          />
        </label>
        <div className="row">
          <button
            className="btn btn--small"
            onClick={stepbuddySignIn}
            disabled={sbBusy || !draft.stepbuddyEmail || !draft.stepbuddyPassword}
          >
            {sbBusy ? 'Signing in…' : sbSignedInAs ? 'Re-sign in' : 'Sign in'}
          </button>
          {sbSignedInAs && (
            <button className="btn btn--small" onClick={stepbuddySignOut} disabled={sbBusy}>
              Sign out
            </button>
          )}
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
            {sbSignedInAs ? `Signed in as ${sbSignedInAs}` : 'Not signed in'}
          </span>
        </div>
        {sbError && <div className="banner banner--err">{sbError}</div>}
      </div>

      <div className="row row--end">
        <button className="btn btn--primary" onClick={save}>
          Save
        </button>
      </div>
      {savedAt && <div className="banner banner--ok">Saved.</div>}

      <div className="card">
        <h3>Recent</h3>
        {history.length === 0 ? (
          <div className="empty">No saved questions yet.</div>
        ) : (
          <div className="history">
            {history.map((h) => (
              <div key={h.id} className="history__row">
                <div>
                  {new Date(h.timestamp).toLocaleDateString()} · {h.wasCorrect ? '✓' : '✗'}{' '}
                  {h.userPick} → {h.correctAnswer}
                  {h.stepbuddyMistakeId && <span style={{ color: 'var(--green)' }}> · logged</span>}
                </div>
                {h.rule && <div style={{ color: 'var(--fg)' }}>{h.rule}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
