declare const chrome: {
  sidePanel?: {
    setPanelBehavior: (opts: { openPanelOnActionClick: boolean }) => Promise<void>;
    open: (opts: { tabId?: number; windowId?: number }) => Promise<void>;
  };
  contextMenus?: {
    create: (props: Record<string, unknown>, cb?: () => void) => void;
    removeAll: (cb?: () => void) => void;
    onClicked: { addListener: (cb: (info: { menuItemId: string }, tab?: { id?: number; windowId?: number }) => void) => void };
  };
  runtime?: { lastError?: { message?: string } };
};

export default defineBackground(() => {
  const log = (...args: unknown[]) => console.log('[ubuddy:bg]', ...args);
  log('background ready');

  if (typeof chrome !== 'undefined' && chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }

  // NBME's "review test" pops the exam into a kiosk-style Chrome window with
  // no toolbar — the extension action icon isn't visible there, so the
  // student can't click it to open the side panel. A right-click context-
  // menu entry is the cleanest workaround: context menus appear in every
  // Chrome window (kiosk, app, popup, normal) AND a context-menu click
  // counts as the user gesture that `chrome.sidePanel.open` requires.
  //
  // Scoped via documentUrlPatterns so the menu stays clean — it only shows
  // on the three supported question banks, not on every page.
  if (typeof chrome !== 'undefined' && chrome.contextMenus) {
    const cm = chrome.contextMenus;
    // Recreate on every SW spin-up. `removeAll` is idempotent and `create`
    // would otherwise throw "duplicate id" on subsequent loads.
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
      if (!chrome.sidePanel) return;
      // Prefer windowId — works inside kiosk popup windows where Chrome may
      // not surface a usable tabId for `sidePanel.open`. Fall back to tabId
      // for the common case.
      const opts = tab?.windowId != null ? { windowId: tab.windowId } : tab?.id != null ? { tabId: tab.id } : null;
      if (!opts) return;
      chrome.sidePanel.open(opts).catch((e: unknown) => log('sidePanel.open failed', e));
    });
  }
});
