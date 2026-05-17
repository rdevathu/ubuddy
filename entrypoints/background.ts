declare const chrome: {
  sidePanel?: {
    setPanelBehavior: (opts: { openPanelOnActionClick: boolean }) => Promise<void>;
    open: (opts: { tabId: number }) => Promise<void>;
  };
};

export default defineBackground(() => {
  const log = (...args: unknown[]) => console.log('[ubuddy:bg]', ...args);
  log('background ready');

  if (typeof chrome !== 'undefined' && chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }

  browser.commands?.onCommand.addListener(async (command) => {
    log('command:', command);
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    if (command === 'toggle-panel' && typeof chrome !== 'undefined' && chrome.sidePanel) {
      try {
        await chrome.sidePanel.open({ tabId: tab.id });
      } catch (e) {
        log('open side panel failed', e);
      }
    }
  });
});
