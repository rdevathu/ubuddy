import type { RuntimeMessage, RuntimeMessageOf, RuntimeMessageType } from './types';

export function send(message: RuntimeMessage): Promise<unknown> {
  return browser.runtime.sendMessage(message).catch((err) => {
    console.warn('[ubuddy] send failed', message.type, err);
    return undefined;
  });
}

export async function sendToTab(tabId: number, message: RuntimeMessage): Promise<unknown> {
  try {
    return await browser.tabs.sendMessage(tabId, message);
  } catch (err) {
    console.warn('[ubuddy] sendToTab failed', message.type, err);
    return undefined;
  }
}

export function on<T extends RuntimeMessageType>(
  type: T,
  handler: (msg: RuntimeMessageOf<T>, sender: Browser.runtime.MessageSender) => void | Promise<unknown>,
): () => void {
  const listener = (raw: unknown, sender: Browser.runtime.MessageSender) => {
    if (!raw || typeof raw !== 'object') return;
    const msg = raw as RuntimeMessage;
    if (msg.type !== type) return;
    return handler(msg as RuntimeMessageOf<T>, sender);
  };
  browser.runtime.onMessage.addListener(listener as never);
  return () => browser.runtime.onMessage.removeListener(listener as never);
}

export function onAny(
  handler: (msg: RuntimeMessage, sender: Browser.runtime.MessageSender) => void | Promise<unknown>,
): () => void {
  const listener = (raw: unknown, sender: Browser.runtime.MessageSender) => {
    if (!raw || typeof raw !== 'object' || !('type' in raw)) return;
    return handler(raw as RuntimeMessage, sender);
  };
  browser.runtime.onMessage.addListener(listener as never);
  return () => browser.runtime.onMessage.removeListener(listener as never);
}
