import { useCallback, useEffect, useRef, useState } from 'react';
import { onAny, sendToTab } from '../../src/messaging/bus';
import { streamChat } from '../../src/llm/client';
import { intensePrompt } from '../../src/llm/prompts';
import { Celebration } from '../../src/panel/Celebration';
import { ChatBox } from '../../src/panel/ChatBox';
import { ObjectiveData } from '../../src/panel/ObjectiveData';
import { QuestionView } from '../../src/panel/QuestionView';
import { ReflectionForm } from '../../src/panel/ReflectionForm';
import { SettingsPanel } from '../../src/panel/SettingsPanel';
import { TTSControls } from '../../src/panel/TTSControls';
import { useStore } from '../../src/state/store';
import { streakStats, upsertQuestion } from '../../src/storage/db';
import { loadSettings, watchSettings } from '../../src/storage/settings';
import { createOpenRouterTTS } from '../../src/tts/openrouter';
import { getActiveProvider, setActiveProvider, stopAll } from '../../src/tts/provider';
import { logWrongAnswer } from '../../src/stepbuddy/log';

type Tab = 'study' | 'settings';

export function App() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const question = useStore((s) => s.question);
  const setQuestion = useStore((s) => s.setQuestion);
  const explanation = useStore((s) => s.explanation);
  const setExplanation = useStore((s) => s.setExplanation);
  const setSelectedLetter = useStore((s) => s.setSelectedLetter);
  const setIsReading = useStore((s) => s.setIsReading);
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
  const lastAutoReadHash = useRef<string | null>(null);

  useEffect(() => {
    console.log('[ubuddy:panel] mount');
    loadSettings().then((s) => {
      console.log('[ubuddy:panel] settings loaded:', {
        llmModel: s.llmModel,
        ttsProvider: s.ttsProvider,
        ttsModel: s.ttsModel,
        ttsVoice: s.ttsVoice,
        hasKey: !!s.openrouterApiKey,
      });
      setSettings(s);
    });
    streakStats().then(setStreak);
    return watchSettings((s) => {
      console.log('[ubuddy:panel] settings changed');
      setSettings(s);
    });
  }, [setSettings, setStreak]);

  // Set up TTS provider — OpenRouter is the only supported provider.
  useEffect(() => {
    if (!settings.openrouterApiKey) return;
    console.log('[ubuddy:panel] TTS provider: openrouter');
    setActiveProvider(createOpenRouterTTS({ apiKey: settings.openrouterApiKey }));
  }, [settings.openrouterApiKey]);

  // Listen to runtime messages from content script + background.
  useEffect(() => {
    const off = onAny(async (msg) => {
      console.log('[ubuddy:panel] msg:', msg.type);
      if (msg.type === 'question:loaded') {
        setQuestion(msg.payload);
        setError(null);
        if (
          settings.autoReadOnQuestion &&
          lastAutoReadHash.current !== msg.payload.questionHash
        ) {
          lastAutoReadHash.current = msg.payload.questionHash;
          setTimeout(() => readNow(), 100);
        }
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
        // Auto-push wrong answers to StepBuddy. Fresh state via getState() —
        // this handler's closure only re-binds on autoReadOnQuestion changes.
        const st = useStore.getState();
        if (
          st.settings.stepbuddyEnabled &&
          !msg.payload.wasCorrect &&
          st.question
        ) {
          st.setStepbuddy({ status: 'logging' });
          const r = await logWrongAnswer({
            settings: st.settings,
            question: st.question,
            explanation: msg.payload,
          });
          const set = useStore.getState().setStepbuddy;
          if (r.ok) set({ status: 'logged', message: `${r.system} · ${r.miss}` });
          else if ('skipped' in r && r.skipped)
            set(
              r.reason === 'already logged'
                ? { status: 'logged', message: 'already logged' }
                : { status: 'idle' },
            );
          else set({ status: 'error', message: r.error });
        }
      }
      if (msg.type === 'shortcut:read') {
        readNow();
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoReadOnQuestion]);

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

  // Read aloud. If a summary has been generated, read that; otherwise read
  // the question stem verbatim. Never generates a summary on its own.
  const readNow = useCallback(async () => {
    const q = useStore.getState().question;
    if (!q) {
      console.warn('[ubuddy:panel] read: no question loaded');
      return;
    }
    const summary = useStore.getState().intenseSummary.trim();
    const text = summary || q.stem;
    console.log(
      '[ubuddy:panel] read:',
      summary ? 'summary' : 'verbatim',
      'tts=',
      settings.ttsProvider,
    );
    setError(null);
    setIsReading(true);
    stopAll();
    try {
      await speak(text, settings);
    } catch (e) {
      console.error('[ubuddy:panel] speak failed:', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsReading(false);
    }
  }, [settings, setIsReading]);

  // Generate the tight blaze-through summary as text only (no audio).
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
    if (!settings.llmModel) {
      setError('Pick a chat model in Settings (load the model list and select one).');
      return;
    }
    console.log('[ubuddy:panel] summarize: llm=', settings.llmModel);
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
        model: settings.llmModel,
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
          setError(`[${settings.llmModel}] ${err.message}`);
        },
      },
    );
  }, [settings, setIsSummarizing, appendIntenseSummary, setIntenseSummary]);

  const stopReading = useCallback(() => {
    stopAll();
    setIsReading(false);
  }, [setIsReading]);

  const showCelebration = explanation?.wasCorrect === true;
  const showReflection = explanation && !explanation.wasCorrect;

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
            <div className="banner banner--warn">Logging miss to StepBuddy…</div>
          )}
          {stepbuddy.status === 'logged' && (
            <div className="banner banner--ok">
              Logged to StepBuddy{stepbuddy.message ? ` · ${stepbuddy.message}` : ''}
            </div>
          )}
          {stepbuddy.status === 'error' && (
            <div className="banner banner--err">StepBuddy: {stepbuddy.message}</div>
          )}
          <TTSControls onRead={readNow} onStop={stopReading} onSummarize={summarizeNow} />
          <QuestionView />
          <ObjectiveData />
          {showCelebration && <Celebration />}
          {showReflection && <ReflectionForm />}
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
      🔥 {streak.current} · {pct}% ({streak.correct}/{streak.total})
    </div>
  );
}

function ttsOpts(settings: ReturnType<typeof useStore.getState>['settings']) {
  return {
    voice: settings.ttsVoice || undefined,
    rate: settings.ttsRate,
    model: settings.ttsModel,
  };
}

async function speak(text: string, settings: ReturnType<typeof useStore.getState>['settings']) {
  const provider = getActiveProvider();
  if (!provider) throw new Error('Add your OpenRouter API key in Settings to enable TTS.');
  const opts = ttsOpts(settings);
  console.log('[ubuddy:panel] speak via', provider.name, 'rate=', opts.rate);
  await provider.speak(text, opts);
}
