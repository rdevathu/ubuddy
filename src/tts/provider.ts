export interface TTSOptions {
  voice?: string;
  rate?: number;
  model?: string;
}

export interface TTSProvider {
  name: string;
  speak(text: string, opts?: TTSOptions): Promise<void>;
  stop(): void;
  /** Queue an utterance without waiting — used by streaming flows. */
  enqueue?(text: string, opts?: TTSOptions): void;
  /** Optional: supported voices for UI. */
  listVoices?(): Promise<{ id: string; label: string }[]>;
}

let active: TTSProvider | null = null;

export function setActiveProvider(p: TTSProvider) {
  active?.stop();
  active = p;
}

export function getActiveProvider(): TTSProvider | null {
  return active;
}

export function stopAll() {
  active?.stop();
}
