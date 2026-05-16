import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAny, send, sendToTab } from '../../src/messaging/bus';
import { streamChat } from '../../src/llm/client';
import { intensePrompt } from '../../src/llm/prompts';
import { AnswerList } from '../../src/panel/AnswerList';
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
import { createOpenRouterTTS, SentenceStream } from '../../src/tts/openrouter';
import { getActiveProvider, setActiveProvider, stopAll } from '../../src/tts/provider';

type Tab = 'study' | 'settings';

export function App() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const question = useStore((s) => s.question);
  const setQuestion = useStore((s) => s.setQuestion);
  const explanation = useStore((s) => s.explanation);
  const setExplanation = useStore((s) => s.setExplanation);
  const selectedLetter = useStore((s) => s.selectedLetter);
  const setSelectedLetter = useStore((s) => s.setSelectedLetter);
  const verbosity = useStore((s) => s.verbosity);
  const setIsReading = useStore((s) => s.setIsReading);
  const appendIntenseSummary = useStore((s) => s.appendIntenseSummary);
  const setIntenseSummary = useStore((s) => s.setIntenseSummary);
  const parserHealth = useStore((s) => s.parserHealth);
  const setParserHealth = useStore((s) => s.setParserHealth);
  const setStreak = useStore((s) => s.setStreak);

  const [tab, setTab] = useState<Tab>('study');
  const [error, setError] = useState<string | null>(null);
  const ttsAbort = useRef<AbortController | null>(null);
  const lastAutoReadHash = useRef<string | null>(null);

  useEffect(() => {
    console.log('[ubuddy:panel] mount');
    loadSettings().then((s) => {
      console.log('[ubuddy:panel] settings loaded:', {
        llmModel: s.llmModel,
        ttsProvider: s.ttsProvider,
        ttsModel: s.ttsModel,
        ttsVoice: s.ttsVoice,
        verbosity: s.defaultVerbosity,
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

  const readNow = useCallback(async () => {
    const q = useStore.getState().question;
    const v = useStore.getState().verbosity;
    if (!q) {
      console.warn('[ubuddy:panel] read: no question loaded');
      return;
    }
    console.log('[ubuddy:panel] read:', v, 'tts=', settings.ttsProvider, 'llm=', settings.llmModel);
    setError(null);
    setIsReading(true);
    stopAll();

    if (v === 'verbatim') {
      const text = buildVerbatimScript(q);
      try {
        await speak(text, settings);
      } catch (e) {
        console.error('[ubuddy:panel] verbatim speak failed:', e);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsReading(false);
      }
      return;
    }

    // Intense mode → stream LLM, chunk by sentence into TTS.
    if (!settings.openrouterApiKey) {
      setError('Add your OpenRouter API key in Settings to use intense mode.');
      setIsReading(false);
      return;
    }
    if (!settings.llmModel) {
      setError('Pick a chat model in Settings (load the model list and select one).');
      setIsReading(false);
      return;
    }
    setIntenseSummary('');
    const ctrl = new AbortController();
    ttsAbort.current = ctrl;
    const stream = new SentenceStream((sentence) => speakChunk(sentence, settings));
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
        onDelta: (chunk) => {
          appendIntenseSummary(chunk);
          stream.push(chunk);
        },
        onDone: () => {
          stream.flush();
          setIsReading(false);
        },
        onError: (err) => {
          console.error('[ubuddy:panel] intense stream error:', err);
          setIsReading(false);
          setError(`[${settings.llmModel}] ${err.message}`);
        },
      },
    );
  }, [settings, setIsReading, appendIntenseSummary, setIntenseSummary]);

  const stopReading = useCallback(() => {
    ttsAbort.current?.abort();
    stopAll();
    setIsReading(false);
  }, [setIsReading]);

  const onPick = useCallback(
    async (letter: string) => {
      setSelectedLetter(letter);
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await sendToTab(tab.id, { type: 'panel:forwardClick', payload: { letter } });
    },
    [setSelectedLetter],
  );

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
          <TTSControls onRead={readNow} onStop={stopReading} />
          <QuestionView />
          <ObjectiveData />
          <AnswerList onPick={onPick} />
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

function buildVerbatimScript(q: NonNullable<ReturnType<typeof useStore.getState>['question']>): string {
  const lines = [q.stem, 'The choices are:'];
  for (const c of q.choices) lines.push(`${c.letter}. ${c.text}.`);
  return lines.join(' ');
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

function speakChunk(text: string, settings: ReturnType<typeof useStore.getState>['settings']) {
  const provider = getActiveProvider();
  if (!provider) return;
  const opts = ttsOpts(settings);
  if (provider.enqueue) {
    provider.enqueue(text, opts);
  } else {
    provider.speak(text, opts);
  }
}
