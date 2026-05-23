import { useCallback, useEffect, useRef, useState } from 'react';
import { onAny, sendToAllFrames } from '../../src/messaging/bus';
import { streamChat } from '../../src/llm/client';
import { MODEL_ID, MODEL_LABEL } from '../../src/llm/model';
import { intensePrompt } from '../../src/llm/prompts';
import { ChatBox } from '../../src/panel/ChatBox';
import { LogCard } from '../../src/panel/LogCard';
import { QuestionView } from '../../src/panel/QuestionView';
import { SettingsPanel } from '../../src/panel/SettingsPanel';
import { SummaryControls } from '../../src/panel/SummaryControls';
import { useStore } from '../../src/state/store';
import {
  getQuestionByHash,
  loggedCount,
  upsertQuestion,
} from '../../src/storage/db';
import { loadSettings, watchSettings } from '../../src/storage/settings';
import { classifySystemViaLLM } from '../../src/stepbuddy/classify';
import { SYSTEM_TAGS, type SystemTag } from '../../src/stepbuddy/client';

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
  const setLoggedCount = useStore((s) => s.setLoggedCount);
  const stepbuddy = useStore((s) => s.stepbuddy);
  const setClassifiedSystem = useStore((s) => s.setClassifiedSystem);
  const setClassifying = useStore((s) => s.setClassifying);

  const [tab, setTab] = useState<Tab>('study');
  const [error, setError] = useState<string | null>(null);
  const summaryAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    console.log('[ubuddy:panel] mount');
    loadSettings().then((s) => {
      console.log('[ubuddy:panel] settings loaded:', { hasKey: !!s.openrouterApiKey });
      setSettings(s);
    });
    loggedCount().then(setLoggedCount);
    return watchSettings((s) => {
      console.log('[ubuddy:panel] settings changed');
      setSettings(s);
    });
  }, [setSettings, setLoggedCount]);

  // Refresh the lifetime logged counter every time a StepBuddy push succeeds.
  useEffect(() => {
    if (stepbuddy.status === 'logged') loggedCount().then(setLoggedCount);
  }, [stepbuddy.status, setLoggedCount]);

  // AMBOSS / NBME: classify the system tag in the background as soon as a
  // question loads. UWorld doesn't need this — its `.standards` block gives
  // us the system deterministically (see classify.ts:mapUworldSystem). We
  // cache the result on the QuestionRecord so revisits skip the LLM call.
  useEffect(() => {
    if (!question) return;
    if (question.source !== 'amboss' && question.source !== 'nbme') return;
    let cancelled = false;
    (async () => {
      const cached = await getQuestionByHash(question.questionHash);
      const cachedTag = cached?.classifiedSystem;
      if (cached && cachedTag && (SYSTEM_TAGS as readonly string[]).includes(cachedTag)) {
        if (cancelled) return;
        setClassifiedSystem(cachedTag as SystemTag);
        return;
      }
      if (!settings.openrouterApiKey) return; // can't classify without a key — defaults to MISC at log
      setClassifying(true);
      try {
        const tag = await classifySystemViaLLM({
          apiKey: settings.openrouterApiKey,
          question,
        });
        if (cancelled) return;
        setClassifiedSystem(tag);
        // Persist alongside whatever the question row already has so a future
        // panel reopen reads from cache.
        await upsertQuestion({
          questionHash: question.questionHash,
          source: question.source,
          questionId: question.questionId,
          timestamp: Date.now(),
          stem: question.stem,
          choices: question.choices.map((c) => ({ letter: c.letter, text: c.text })),
          userPick: cached?.userPick ?? '',
          correctAnswer: cached?.correctAnswer ?? '',
          wasCorrect: cached?.wasCorrect ?? false,
          explanationText: cached?.explanationText,
          rule: cached?.rule,
          classifiedSystem: tag,
        });
      } catch (e) {
        console.warn('[ubuddy:panel] classify failed', e);
      } finally {
        if (!cancelled) setClassifying(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [question?.questionHash, question?.source, settings.openrouterApiKey, setClassifiedSystem, setClassifying]);

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
              source: q.source,
              questionId: q.questionId,
              timestamp: Date.now(),
              stem: q.stem,
              choices: q.choices.map((c) => ({ letter: c.letter, text: c.text })),
              userPick: msg.payload.userLetter ?? '',
              correctAnswer: msg.payload.correctLetter,
              wasCorrect: msg.payload.wasCorrect,
              explanationText: msg.payload.explanationText,
            });
          }
        } catch (e) {
          console.warn('persist explanation failed', e);
        }
        // The log-to-StepBuddy push is gated on an explicit click in LogCard.
      }
    });
    return off;
  }, [setQuestion, setExplanation, setSelectedLetter]);

  // Pull parse state when the panel opens (handles the "panel opened after
  // question already on screen" case). Does NOT broadcast — the content script
  // returns the data directly to avoid feedback loops.
  //
  // Tab resolution: when the floating-window fallback is used (NBME's kiosk
  // window, where the side panel can't render — see background.ts), the
  // opener stashes the source tabId in the URL hash as `#tab=<id>`. Without
  // that, `tabs.query({active:true,currentWindow:true})` from inside the
  // floater would resolve to the floater's own (irrelevant) tab. When the
  // panel is hosted in a normal Chrome window's side-panel chrome, no hash
  // is set and we fall back to the active-tab query as before.
  useEffect(() => {
    (async () => {
      let tab: { id?: number; url?: string } | undefined;
      const hashTabIdMatch = window.location.hash.match(/[#&]tab=(\d+)/);
      const hashTabId = hashTabIdMatch ? Number(hashTabIdMatch[1]) : NaN;
      if (Number.isFinite(hashTabId)) {
        try {
          tab = await browser.tabs.get(hashTabId);
        } catch (e) {
          console.warn('[ubuddy:panel] hash-pinned tab lookup failed', e);
        }
      }
      if (!tab) {
        [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      }
      if (!tab?.id) return;
      const isSupportedHost =
        tab.url?.includes('uworld.com') ||
        tab.url?.includes('amboss.com') ||
        tab.url?.includes('starttest.com');
      if (!isSupportedHost) return;
      type Reply = { health?: { ok: boolean; missing: string[] }; question?: any; explanation?: any };
      const replies = (await sendToAllFrames(tab.id, { type: 'panel:requestParse' })) as
        (Reply | undefined)[];
      // The starttest.com tab has many same-origin iframes (Exhibit, Variable,
      // popup helpers) — only one carries the question. Prefer the reply that
      // actually has it; fall back to any reply with a health value so the
      // selector-health banner can still surface.
      const reply =
        replies.find((r) => r && (r.question || r.explanation)) ??
        replies.find((r) => r && r.health) ??
        undefined;
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
        <div className="app__brand">
          <img className="app__brand-logo" src="/icon/128.png" alt="" />
          UBuddy
        </div>
        <LoggedCount />
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
              Parser can't find: {parserHealth.missing.join(', ')}. Open a UWorld, AMBOSS, or NBME question, then reload this panel.
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

function LoggedCount() {
  const n = useStore((s) => s.loggedCount);
  if (n === 0) return null;
  return (
    <div className="app__logged" title="Lifetime learnings logged to StepBuddy">
      {n} logged
    </div>
  );
}
