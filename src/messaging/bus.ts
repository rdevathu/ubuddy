import type { RuntimeMessage, RuntimeMessageOf, RuntimeMessageType } from './types';

/**
 * Broadcast a message to whatever extension context is listening (typically
 * the side panel). `browser.runtime.sendMessage` rejects with "Could not
 * establish connection. Receiving end does not exist." when nothing is
 * listening — completely expected for our fire-and-forget broadcasts (the
 * content script announces `question:loaded` whether or not the panel is
 * open). Silence that one and only that one; surface anything else as a
 * warning since it implies a real bug.
 */
const NO_RECEIVER_RE = /Receiving end does not exist|Could not establish connection/i;

export function send(message: RuntimeMessage): Promise<unknown> {
  return browser.runtime.sendMessage(message).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (!NO_RECEIVER_RE.test(msg)) {
      console.warn('[ubuddy] send failed', message.type, err);
    }
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

/**
 * Send a message to every frame in the tab and return every reply (one per
 * frame; `undefined` for frames whose content script didn't handle the
 * message). The caller picks the "best" reply.
 *
 * Needed for NBME: the question content lives inside an iframe
 * (`ElementDisplayFrame` → itd.aspx), and `tabs.sendMessage` without an
 * explicit `frameId` only hits the top frame. We enumerate frames via
 * `webNavigation.getAllFrames` and post into each. Multiple frames may
 * reply (the NBME shell has half a dozen iframes all on starttest.com), so
 * the caller is responsible for picking — e.g. the first reply whose
 * `.question` is populated.
 */
export async function sendToAllFrames(
  tabId: number,
  message: RuntimeMessage,
): Promise<unknown[]> {
  type WebNav = { getAllFrames: (d: { tabId: number }) => Promise<Array<{ frameId: number }>> };
  const wn = (browser as unknown as { webNavigation?: WebNav }).webNavigation;
  if (!wn?.getAllFrames) {
    const r = await sendToTab(tabId, message);
    return [r];
  }
  let frames: Array<{ frameId: number }> = [];
  try {
    frames = (await wn.getAllFrames({ tabId })) ?? [];
  } catch {
    const r = await sendToTab(tabId, message);
    return [r];
  }
  if (frames.length === 0) {
    const r = await sendToTab(tabId, message);
    return [r];
  }
  return Promise.all(
    frames.map(async ({ frameId }) => {
      try {
        return await browser.tabs.sendMessage(tabId, message, { frameId });
      } catch {
        return undefined;
      }
    }),
  );
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
