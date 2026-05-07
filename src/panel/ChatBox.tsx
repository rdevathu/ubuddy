import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { streamChat } from '../llm/client';
import { chatSystemPrompt } from '../llm/prompts';
import type { ChatMessage } from '../types';

export function ChatBox() {
  const settings = useStore((s) => s.settings);
  const question = useStore((s) => s.question);
  const explanation = useStore((s) => s.explanation);
  const chat = useStore((s) => s.chat);
  const append = useStore((s) => s.appendChatMessage);
  const update = useStore((s) => s.updateChatMessage);
  const streaming = useStore((s) => s.chatStreaming);
  const setStreaming = useStore((s) => s.setChatStreaming);

  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat]);

  async function send() {
    if (!input.trim() || streaming || !question) return;
    if (!settings.openrouterApiKey) {
      setError('Add your OpenRouter API key in Settings.');
      return;
    }
    if (!settings.llmModel) {
      setError('Pick a chat model in Settings.');
      return;
    }
    setError(null);
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: input.trim() };
    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '' };
    append(userMsg);
    append(assistantMsg);
    setInput('');
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const messages: ChatMessage[] = [
      { id: 'sys', role: 'system', content: chatSystemPrompt(question, explanation ?? undefined) },
      ...chat,
      userMsg,
    ];

    let acc = '';
    streamChat(
      {
        apiKey: settings.openrouterApiKey,
        model: settings.llmModel,
        messages,
        signal: ctrl.signal,
      },
      {
        onDelta: (chunk) => {
          acc += chunk;
          update(assistantMsg.id, acc);
        },
        onDone: () => setStreaming(false),
        onError: (err) => {
          console.error('[ubuddy:chat] stream error:', err);
          setStreaming(false);
          setError(`[${settings.llmModel}] ${err.message}`);
        },
      },
    );
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  return (
    <div className="card">
      <h3>Chat</h3>
      <div className="chat" ref={scrollRef}>
        {chat.length === 0 && (
          <div className="empty">Ask anything about the question, explanation, or differential.</div>
        )}
        {chat.map((m) => (
          <div key={m.id} className={`chat__msg chat__msg--${m.role}`}>
            {m.content || (streaming && m.role === 'assistant' ? '…' : '')}
          </div>
        ))}
      </div>
      {error && <div className="banner banner--err">{error}</div>}
      <div className="row">
        <input
          type="text"
          placeholder="Ask a follow-up…"
          value={input}
          disabled={streaming}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        {streaming ? (
          <button className="btn" onClick={stop}>
            Stop
          </button>
        ) : (
          <button className="btn btn--primary" onClick={send} disabled={!input.trim() || !question}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}
