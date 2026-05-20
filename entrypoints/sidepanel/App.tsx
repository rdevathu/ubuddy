import { useCallback, useEffect, useRef, useState } from 'react';
import { onAny, sendToTab } from '../../src/messaging/bus';
import { streamChat } from '../../src/llm/client';
import { MODEL_ID, MODEL_LABEL } from '../../src/llm/model';
import { intensePrompt } from '../../src/llm/prompts';
import { ChatBox } from '../../src/panel/ChatBox';
import { LogCard } from '../../src/panel/LogCard';
import { QuestionView } from '../../src/panel/QuestionView';
import { SettingsPanel } from '../../src/panel/SettingsPanel';
import { SummaryControls } from '../../src/panel/SummaryControls';
import { useStore } from '../../src/state/store';
import { streakStats, upsertQuestion } from '../../src/storage/db';
import { loadSettings, watchSettings } from '../../src/storage/settings';

type Tab = 'study' | 'settings';

export function App() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const question = useStore((s) => s.question);
  const setQuestion = useStore((s) => s.setQuestion);
  const setExplanation = useStore((s) => s.setExplanation);
  const setSelectedLetter = useStore((s) => s.setSelectedLetter);
  const setIsSummarizing = useStore((s) => s.setIsSummarizing);
  const appendIntenseSummary = useStore((s) => s.appendIntenseSummary);
  const setIntenseSummary = useStore((s) => s.setIntenseSummary);
  const parserHealth = useStore((s) => s.parserHealth);
  const setParserHealth = useStore((s) => s.setParserHealth);
  const setStreak = useStore((s) => s.setStreak);
  const stepbuddy = useStore((s) => s.stepbuddy);

  const [tab, setTab] = useState<Tab>('study');
  const [error, setError] = useState<string | null>(null);
  const summaryAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    console.log('[ubuddy:panel] mount');
    loadSettings().then((s) => {
      console.log('[ubuddy:panel] settings loaded:', { hasKey: !!s.openrouterApiKey });
      setSettings(s);
    });
    streakStats().then(setStreak);
    return watchSettings((s) => {
      console.log('[ubuddy:panel] settings changed');
      setSettings(s);
    });
  }, [setSettings, setStreak]);

  // Listen to runtime messages from content script + background.
  useEffect(() => {
    const off = onAny(async (msg) => {
      console.log('[ubuddy:panel] msg:', msg.type);
      if (msg.type === 'question:loaded') {
        setQuestion(msg.payload);
        setError(null);
      }
      if (msg.type === 'explanation:shown') {
        setExplanation(msg.payload);
        setSelectedLetter(msg.payload.userLetter ?? null);
        try {
          const q = useStore.getState().question;
          if (q) {
            await upsertQuestion({
              questionHash: q.questionHash,
              questionId: q.questionId,
              timestamp: Date.now(),
              stem: q.stem,
              choices: q.choices.map((c) => ({ letter: c.letter, text: c.text })),
              userPick: msg.payload.userLetter ?? '',
              correctAnswer: msg.payload.correctLetter,
              wasCorrect: msg.payload.wasCorrect,
              explanationText: msg.payload.explanationText,
            });
            const next = await streakStats();
            setStreak(next);
          }
        } catch (e) {
          console.warn('persist explanation failed', e);
        }
        // The log-to-StepBuddy push is gated on an explicit click in LogCard.
      }
    });
    return off;
  }, [setQuestion, setExplanation, setSelectedLetter, setStreak]);

  // Pull parse state when the panel opens (handles the "panel opened after
  // question already on screen" case). Does NOT broadcast — the content script
  // returns the data directly to avoid feedback loops.
  useEffect(() => {
    (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url?.includes('uworld.com')) return;
      const reply = (await sendToTab(tab.id, { type: 'panel:requestParse' })) as
        | { health?: { ok: boolean; missing: string[] }; question?: any; explanation?: any }
        | undefined;
      if (!reply) return;
      console.log('[ubuddy:panel] initial parse:', {
        health: reply.health,
        hasQuestion: !!reply.question,
        hasExplanation: !!reply.explanation,
      });
      if (reply.health) setParserHealth(reply.health);
      if (reply.question && !useStore.getState().question) setQuestion(reply.question);
      if (reply.explanation && !useStore.getState().explanation) setExplanation(reply.explanation);
    })();
  }, [setParserHealth, setQuestion, setExplanation]);

  // Generate the tight blaze-through summary as text only (shown on screen).
  const summarizeNow = useCallback(async () => {
    const q = useStore.getState().question;
    if (!q) {
      console.warn('[ubuddy:panel] summarize: no question loaded');
      return;
    }
    if (!settings.openrouterApiKey) {
      setError('Add your OpenRouter API key in Settings to summarize.');
      return;
    }
    console.log('[ubuddy:panel] summarize: llm=', MODEL_ID);
    setError(null);
    summaryAbort.current?.abort();
    setIntenseSummary('');
    setIsSummarizing(true);
    const ctrl = new AbortController();
    summaryAbort.current = ctrl;
    const { system, user } = intensePrompt(q);
    streamChat(
      {
        apiKey: settings.openrouterApiKey,
        model: MODEL_ID,
        messages: [
          { id: 'sys', role: 'system', content: system },
          { id: 'u', role: 'user', content: user },
        ],
        signal: ctrl.signal,
      },
      {
        onDelta: (chunk) => appendIntenseSummary(chunk),
        onDone: () => setIsSummarizing(false),
        onError: (err) => {
          console.error('[ubuddy:panel] summarize stream error:', err);
          setIsSummarizing(false);
          setError(`[${MODEL_LABEL}] ${err.message}`);
        },
      },
    );
  }, [settings, setIsSummarizing, appendIntenseSummary, setIntenseSummary]);

  return (
    <div className="app">
      <div className="app__header">
        <div className="app__brand">UBuddy</div>
        <Streak />
      </div>
      <div className="tabs">
        <button className={tab === 'study' ? 'is-active' : ''} onClick={() => setTab('study')}>
          Study
        </button>
        <button className={tab === 'settings' ? 'is-active' : ''} onClick={() => setTab('settings')}>
          Settings
        </button>
      </div>

      {tab === 'study' && (
        <div className="body">
          {parserHealth && !parserHealth.ok && (
            <div className="banner banner--warn">
              Parser can't find: {parserHealth.missing.join(', ')}. Open a UWorld question, then reload this panel.
            </div>
          )}
          {error && <div className="banner banner--err">{error}</div>}
          {stepbuddy.status === 'logging' && (
            <div className="banner banner--warn">Logging to StepBuddy…</div>
          )}
          {stepbuddy.status === 'error' && (
            <div className="banner banner--err">StepBuddy: {stepbuddy.message}</div>
          )}
          {/* LogCard is the headline action when graded — keep it on top. */}
          <LogCard />
          <SummaryControls onSummarize={summarizeNow} />
          <QuestionView />
          {question && <ChatBox />}
        </div>
      )}

      {tab === 'settings' && <SettingsPanel />}
    </div>
  );
}

function Streak() {
  const streak = useStore((s) => s.streak);
  if (streak.total === 0) return null;
  const pct = Math.round((streak.correct / streak.total) * 100);
  return (
    <div className="app__streak">
      {streak.current} streak · {pct}% ({streak.correct}/{streak.total})
    </div>
  );
}
