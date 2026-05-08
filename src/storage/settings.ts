import { DEFAULT_SETTINGS, type AppSettings } from '../types';

const KEY = 'ubuddy.settings';

export async function loadSettings(): Promise<AppSettings> {
  const stored = await browser.storage.local.get(KEY);
  return migrate({ ...DEFAULT_SETTINGS, ...(stored[KEY] ?? {}) } as AppSettings);
}

function migrate(s: AppSettings): AppSettings {
  // WebSpeech was removed — coerce any stale stored value back to OpenRouter.
  if ((s.ttsProvider as string) !== 'openrouter') s.ttsProvider = 'openrouter';
  return s;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  await browser.storage.local.set({ [KEY]: next });
  return next;
}

export function watchSettings(cb: (s: AppSettings) => void): () => void {
  const listener = (changes: Record<string, Browser.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !(KEY in changes)) return;
    cb(migrate({ ...DEFAULT_SETTINGS, ...(changes[KEY].newValue ?? {}) } as AppSettings));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
