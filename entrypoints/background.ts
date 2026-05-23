declare const chrome: {
  sidePanel?: {
    setPanelBehavior: (opts: { openPanelOnActionClick: boolean }) => Promise<void>;
    open: (opts: { tabId?: number; windowId?: number }) => Promise<void>;
  };
  contextMenus?: {
    create: (props: Record<string, unknown>, cb?: () => void) => void;
    removeAll: (cb?: () => void) => void;
    onClicked: {
      addListener: (
        cb: (info: { menuItemId: string }, tab?: { id?: number; windowId?: number }) => void,
      ) => void;
    };
  };
  windows?: {
    get: (windowId: number) => Promise<{ id?: number; type?: string }>;
    create: (opts: {
      url?: string;
      type?: 'normal' | 'popup' | 'panel';
      width?: number;
      height?: number;
      focused?: boolean;
      top?: number;
      left?: number;
    }) => Promise<{ id?: number } | undefined>;
    update: (windowId: number, opts: { focused?: boolean }) => Promise<unknown>;
  };
  runtime?: {
    lastError?: { message?: string };
    getURL: (path: string) => string;
  };
};

// Single floating UBuddy window reused across context-menu clicks — opening
// a fresh copy on every right-click would be obnoxious. If the window has
// been closed, `windows.update` rejects and we create a new one.
let floatingWindowId: number | null = null;

async function openUBuddyForTab(
  tab: { id?: number; windowId?: number } | undefined,
): Promise<void> {
  const log = (...args: unknown[]) => console.log('[ubuddy:bg]', ...args);
  if (!tab) return;

  // The side panel UI only renders in "normal" Chrome windows. NBME's
  // "Review Test" opens its exam into a popup-style window where Chrome
  // doesn't surface side-panel chrome at all — `sidePanel.open` resolves
  // but has no place to draw the panel. For non-normal windows we open
  // UBuddy as its own floating popup window the student can park next to
  // the exam.
  let windowType: string | undefined;
  if (tab.windowId != null && chrome.windows) {
    try {
      const win = await chrome.windows.get(tab.windowId);
      windowType = win.type;
    } catch (e) {
      log('windows.get failed', e);
    }
  }

  if (windowType === 'normal' && chrome.sidePanel) {
    try {
      if (tab.windowId != null) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      } else if (tab.id != null) {
        await chrome.sidePanel.open({ tabId: tab.id });
      }
      return;
    } catch (e) {
      log('sidePanel.open failed, falling back to floating window', e);
    }
  }

  // Floating-window fallback. We pass the source tabId through the URL hash
  // so the panel can ask THAT tab for its current parse — `tabs.query
  // ({active:true,currentWindow:true})` inside the floater would point at
  // the floater itself, not the exam.
  if (!chrome.windows || !chrome.runtime) return;
  const sourceTabId = tab.id ?? '';
  const url = chrome.runtime.getURL(`sidepanel.html#tab=${sourceTabId}`);

  if (floatingWindowId != null) {
    try {
      await chrome.windows.update(floatingWindowId, { focused: true });
      return;
    } catch {
      floatingWindowId = null;
    }
  }

  try {
    const created = await chrome.windows.create({
      url,
      type: 'popup',
      width: 480,
      height: 820,
      focused: true,
    });
    floatingWindowId = created?.id ?? null;
  } catch (e) {
    log('windows.create failed', e);
  }
}

export default defineBackground(() => {
  const log = (...args: unknown[]) => console.log('[ubuddy:bg]', ...args);
  log('background ready');

  if (typeof chrome !== 'undefined' && chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }

  // Right-click → "Open UBuddy panel". Works in every Chrome window type
  // (including NBME's kiosk popup); the handler picks side panel vs.
  // floating window based on the host window's type.
  if (typeof chrome !== 'undefined' && chrome.contextMenus) {
    const cm = chrome.contextMenus;
    cm.removeAll(() => {
      cm.create(
        {
          id: 'ubuddy-open',
          title: 'Open UBuddy panel',
          contexts: ['page', 'selection', 'frame', 'link', 'image'],
          documentUrlPatterns: [
            '*://*.uworld.com/*',
            '*://*.amboss.com/*',
            '*://*.starttest.com/*',
          ],
        },
        () => {
          const err = chrome.runtime?.lastError;
          if (err) log('contextMenus.create error', err.message);
        },
      );
    });
    cm.onClicked.addListener((info, tab) => {
      if (info.menuItemId !== 'ubuddy-open') return;
      openUBuddyForTab(tab);
    });
  }
});
