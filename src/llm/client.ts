import type { ChatMessage } from '../types';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export interface CompleteOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
}

export interface StreamHandlers {
  onDelta: (chunk: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

export async function streamChat(opts: CompleteOptions, handlers: StreamHandlers): Promise<void> {
  const url = `${OPENROUTER_BASE}/chat/completions`;
  const payload = {
    model: opts.model,
    stream: true,
    temperature: opts.temperature ?? 0.4,
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
  };
  console.log('[ubuddy:llm] →', opts.model, 'msgs=', payload.messages.length, 'firstUser=', payload.messages.find((m) => m.role === 'user')?.content?.slice(0, 80));

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
        'HTTP-Referer': 'https://github.com/local/ubuddy',
        'X-Title': 'UBuddy',
      },
      body: JSON.stringify(payload),
      signal: opts.signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      console.error('[ubuddy:llm] ✗', res.status, res.statusText, 'body:', text);
      throw new Error(`OpenRouter ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
    }
    console.log('[ubuddy:llm] ✓ streaming…');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          console.log('[ubuddy:llm] ✓ done');
          handlers.onDone();
          return;
        }
        try {
          const json = JSON.parse(data);
          if (json.error) {
            console.error('[ubuddy:llm] stream error frame:', json.error);
            handlers.onError(new Error(json.error.message ?? JSON.stringify(json.error)));
            return;
          }
          const delta: string | undefined = json.choices?.[0]?.delta?.content;
          if (delta) handlers.onDelta(delta);
        } catch (e) {
          /* ignore keep-alive lines and malformed frames */
          if (data.length > 2 && !data.startsWith(':')) {
            console.warn('[ubuddy:llm] unparsed frame:', data.slice(0, 120));
          }
        }
      }
    }
    handlers.onDone();
  } catch (err) {
    console.error('[ubuddy:llm] ✗ exception:', err);
    handlers.onError(err instanceof Error ? err : new Error(String(err)));
  }
}

export async function completeChat(opts: CompleteOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    let acc = '';
    streamChat(opts, {
      onDelta: (c) => (acc += c),
      onDone: () => resolve(acc),
      onError: reject,
    });
  });
}
