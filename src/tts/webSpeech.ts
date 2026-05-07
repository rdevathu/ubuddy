import type { TTSOptions, TTSProvider } from './provider';

const PREFERRED_VOICES = ['Samantha', 'Daniel', 'Karen', 'Moira', 'Tessa'];

function pickVoice(name?: string): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  if (name) {
    const exact = voices.find((v) => v.name === name);
    if (exact) return exact;
  }
  for (const p of PREFERRED_VOICES) {
    const m = voices.find((v) => v.name.includes(p));
    if (m) return m;
  }
  return voices.find((v) => v.lang.startsWith('en')) ?? voices[0];
}

export const webSpeechProvider: TTSProvider = {
  name: 'webspeech',

  async speak(text: string, opts: TTSOptions = {}) {
    if (!('speechSynthesis' in window)) throw new Error('Web Speech API not available');
    return new Promise((resolve, reject) => {
      const utt = new SpeechSynthesisUtterance(text);
      const v = pickVoice(opts.voice);
      if (v) utt.voice = v;
      utt.rate = opts.rate ?? 1.1;
      utt.onend = () => resolve();
      utt.onerror = (e) => reject(new Error(`tts error: ${e.error}`));
      speechSynthesis.cancel();
      speechSynthesis.speak(utt);
    });
  },

  enqueue(text: string, opts: TTSOptions = {}) {
    const utt = new SpeechSynthesisUtterance(text);
    const v = pickVoice(opts.voice);
    if (v) utt.voice = v;
    utt.rate = opts.rate ?? 1.1;
    speechSynthesis.speak(utt);
  },

  stop() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  },

  async listVoices() {
    return new Promise((resolve) => {
      const ready = () => speechSynthesis.getVoices().map((v) => ({ id: v.name, label: `${v.name} (${v.lang})` }));
      let voices = ready();
      if (voices.length > 0) return resolve(voices);
      speechSynthesis.onvoiceschanged = () => {
        voices = ready();
        resolve(voices);
      };
    });
  },
};
