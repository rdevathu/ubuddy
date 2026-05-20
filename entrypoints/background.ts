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
});
