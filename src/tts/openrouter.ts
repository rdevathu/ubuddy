import type { TTSOptions, TTSProvider } from './provider';

/**
 * OpenRouter audio (TTS) provider. The `/audio/speech` endpoint accepts only
 * `mp3` or `pcm` per the OpenAPI spec, but providers vary: Gemini TTS rejects
 * `mp3` and only accepts `pcm`, while OpenAI/ElevenLabs/Mistral support `mp3`.
 * We auto-pick the format from the model id and wrap raw PCM in a WAV header
 * so it plays through a standard <audio> element.
 *
 * Falls back to Web Speech (handled by the caller) if the request fails.
 */

interface CreateOpts {
  apiKey: string;
}

const ENDPOINT = 'https://openrouter.ai/api/v1/audio/speech';

/** Provider-specific format constraints. Add to this list as we discover more. */
const PCM_ONLY_PREFIXES = ['google/', 'gemini/'];

function pickResponseFormat(model: string): 'mp3' | 'pcm' {
  const m = model.toLowerCase();
  if (PCM_ONLY_PREFIXES.some((p) => m.startsWith(p)) || m.includes('gemini')) return 'pcm';
  return 'mp3';
}

/**
 * Wrap raw 16-bit signed little-endian mono PCM bytes in a WAV header so
 * browsers can decode it via the Audio element. Sample rate defaults to 24kHz
 * which matches OpenAI and Gemini TTS output.
 */
function pcmToWavBlob(pcm: ArrayBuffer, sampleRate = 24000): Blob {
  const length = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + length);
  const view = new DataView(buffer);
  const write = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  write(36, 'data');
  view.setUint32(40, length, true);
  new Uint8Array(buffer, 44).set(new Uint8Array(pcm));
  return new Blob([buffer], { type: 'audio/wav' });
}

export function createOpenRouterTTS({ apiKey }: CreateOpts): TTSProvider {
  let currentAudio: HTMLAudioElement | null = null;
  let currentUrl: string | null = null;

  /**
   * Parallel fetches, strictly serial playback via promise chaining.
   *
   * Each enqueue kicks off a fetch immediately (so the first audio arrives
   * fast) but appends a play step to a single chain. The chain awaits the
   * fetch for that step before playing — and only after the previous step's
   * audio has fully ended. This guarantees in-order, non-overlapping playback
   * regardless of fetch completion order.
   *
   * `session` bumps on stop() so any enqueues already in flight bail out at
   * their next checkpoint instead of contaminating the next read.
   */
  let session = 0;
  let playChain: Promise<void> = Promise.resolve();

  function cleanupCurrent() {
    if (currentAudio) {
      try {
        currentAudio.pause();
      } catch {
        /* ignore */
      }
      currentAudio.removeAttribute('src');
      currentAudio.load();
      currentAudio = null;
    }
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }
  }

  function playUrl(url: string, rate: number): Promise<void> {
    return new Promise<void>((resolve) => {
      cleanupCurrent();
      currentUrl = url;
      const audio = new Audio(url);
      // Speed adjustment is done client-side. OpenRouter's server-side `speed`
      // parameter is only honored by OpenAI TTS; Gemini/ElevenLabs/etc. ignore
      // it. playbackRate works on the decoded audio uniformly, so the slider
      // behaves the same regardless of model. preservesPitch keeps the voice
      // sounding natural at non-1x speeds (no chipmunk/giant effect).
      audio.playbackRate = rate;
      audio.preservesPitch = true;
      currentAudio = audio;
      audio.onended = () => {
        console.log('[ubuddy:tts] ▶ ended');
        resolve();
      };
      audio.onerror = () => {
        console.warn('[ubuddy:tts] ▶ playback error');
        resolve(); // don't break the chain — just skip
      };
      audio.play().catch((e) => {
        console.warn('[ubuddy:tts] ▶ play() rejected:', e);
        resolve(); // don't break the chain
      });
    });
  }

  let nextSeq = 0;

  function enqueueInternal(
    text: string,
    opts: TTSOptions,
    cb?: { resolve: () => void; reject: (e: Error) => void },
  ): void {
    const mySession = session;
    const seq = nextSeq++;
    const t0 = performance.now();
    console.log(`[ubuddy:tts] ⏱ #${seq} fetch start  +0ms  "${text.slice(0, 50)}"`);

    // Fetch starts immediately and runs in parallel with prior playback.
    const fetchP = fetchAudio(text, opts).then(
      (blob) => {
        console.log(`[ubuddy:tts] ⏱ #${seq} fetch end    +${Math.round(performance.now() - t0)}ms`);
        return blob;
      },
      (e) => {
        console.error(`[ubuddy:tts] ⏱ #${seq} fetch FAIL  +${Math.round(performance.now() - t0)}ms`, e);
        cb?.reject(e instanceof Error ? e : new Error(String(e)));
        return null as Blob | null;
      },
    );

    const rate = typeof opts.rate === 'number' && isFinite(opts.rate) ? opts.rate : 1;
    playChain = playChain.then(async () => {
      if (mySession !== session) return; // stop() superseded us
      const tWait0 = performance.now();
      const blob = await fetchP;
      const fetchWaited = Math.round(performance.now() - tWait0);
      if (mySession !== session) return;
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      console.log(
        `[ubuddy:tts] ⏱ #${seq} play start  +${Math.round(performance.now() - t0)}ms  (waited ${fetchWaited}ms for fetch, rate=${rate})`,
      );
      try {
        await playUrl(url, rate);
        console.log(`[ubuddy:tts] ⏱ #${seq} play end    +${Math.round(performance.now() - t0)}ms`);
        cb?.resolve();
      } finally {
        // playUrl handles its own URL cleanup via cleanupCurrent before next play
      }
    });
  }

  async function fetchAudio(text: string, opts: TTSOptions): Promise<Blob> {
    if (!opts.model) throw new Error('Pick a TTS model in Settings (no slug set).');
    if (!opts.voice) throw new Error('Pick a TTS voice in Settings (no voice set).');
    const initialFormat = pickResponseFormat(opts.model);
    const payload = {
      model: opts.model,
      input: text,
      voice: opts.voice,
      response_format: initialFormat,
    };
    console.log('[ubuddy:tts] → POST /audio/speech', {
      model: payload.model,
      voice: payload.voice,
      input_chars: text.length,
      input_preview: text.slice(0, 80),
      response_format: initialFormat,
    });
    const { res, format } = await fetchWithFallback(payload);
    if (format === 'pcm') {
      const buf = await res.arrayBuffer();
      const wav = pcmToWavBlob(buf);
      console.log('[ubuddy:tts] ✓ pcm→wav', wav.size, 'bytes');
      return wav;
    }
    const blob = await res.blob();
    console.log('[ubuddy:tts] ✓', blob.size, 'bytes', blob.type);
    return blob;
  }

  /**
   * POSTs the TTS payload. If the response is a 400 complaining about
   * response_format, retry once with the opposite format — handles
   * provider-specific quirks we haven't yet baked into pickResponseFormat.
   * Returns both the Response and the format that actually succeeded.
   */
  async function fetchWithFallback(payload: {
    model: string;
    input: string;
    voice: string;
    response_format: 'mp3' | 'pcm';
  }): Promise<{ res: Response; format: 'mp3' | 'pcm' }> {
    const res = await postSpeech(payload);
    if (res.ok) return { res, format: payload.response_format };
    const body = await res.text().catch(() => '');
    const wantsOther = /response_format/i.test(body);
    if (res.status === 400 && wantsOther) {
      const flipped: 'mp3' | 'pcm' = payload.response_format === 'mp3' ? 'pcm' : 'mp3';
      console.warn('[ubuddy:tts] format', payload.response_format, 'rejected, retrying with', flipped);
      const res2 = await postSpeech({ ...payload, response_format: flipped });
      if (res2.ok) return { res: res2, format: flipped };
      const body2 = await res2.text().catch(() => '');
      console.error('[ubuddy:tts] ✗ HTTP', res2.status, res2.statusText, body2);
      throw new Error(
        `OpenRouter TTS ${res2.status} (model="${payload.model}", voice="${payload.voice}", fmt=${flipped}): ${body2.slice(0, 500)}`,
      );
    }
    console.error('[ubuddy:tts] ✗ HTTP', res.status, res.statusText);
    console.error('[ubuddy:tts] ✗ request payload was:', payload);
    console.error('[ubuddy:tts] ✗ response body:', body);
    throw new Error(
      `OpenRouter TTS ${res.status} (model="${payload.model}", voice="${payload.voice}"): ${body.slice(0, 500)}`,
    );
  }

  function postSpeech(payload: object): Promise<Response> {
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/local/ubuddy',
        'X-Title': 'UBuddy',
      },
      body: JSON.stringify(payload),
    });
  }

  return {
    name: 'openrouter',

    speak(text, opts = {}) {
      return new Promise<void>((resolve, reject) => {
        enqueueInternal(text, opts, { resolve, reject });
      });
    },

    enqueue(text, opts = {}) {
      enqueueInternal(text, opts);
    },

    stop() {
      session++;
      nextSeq = 0;
      cleanupCurrent();
      // start a fresh chain so future enqueues run from a clean slate
      playChain = Promise.resolve();
      console.log('[ubuddy:tts] stopped (session →', session, ')');
    },
  };
}

/**
 * Streaming text → speakable chunks.
 *
 * Why this exists: a naive "wait for sentence terminator" chunker waits 1-2s
 * for the first long sentence to complete before TTS can even start fetching.
 * That makes audio feel "buffered until everything is ready". Instead:
 *
 *   - As soon as a complete sentence (`. ! ?`) is in the buffer, emit it.
 *   - If the buffer grows past `softLimit` chars without a terminator yet,
 *     emit at the latest comma / semicolon / colon — clause-grade chunking.
 *   - When emitting a sentence, sub-split it at clauses if it exceeds
 *     `hardLimit` so individual TTS fetches stay short.
 *   - Strip markdown markers at buffer level so headers/bullets/bold from
 *     cheap models never reach TTS.
 *
 * Net effect: first speakable chunk is usually ~30-60 chars, so TTS round-trip
 * is ~300-500ms instead of 1500ms+ for a long sentence.
 */
export class SentenceStream {
  private buf = '';
  private readonly onSentence: (s: string) => void;
  private readonly softLimit: number;
  private readonly hardLimit: number;

  constructor(onSentence: (s: string) => void, softLimit = 80, hardLimit = 140) {
    this.onSentence = onSentence;
    this.softLimit = softLimit;
    this.hardLimit = hardLimit;
  }

  push(chunk: string): void {
    this.buf = stripMarkdownLive(this.buf + chunk);
    while (this.tryEmit()) {
      /* keep draining */
    }
  }

  flush(): void {
    const tail = stripMarkdownLive(this.buf).trim();
    this.buf = '';
    if (tail.length > 0) this.emitChunked(tail);
  }

  /**
   * Try to extract one chunk from the buffer. Returns true if it emitted
   * something (so the caller loops to drain more).
   */
  private tryEmit(): boolean {
    const m = this.buf.match(/^(.+?[.!?])(\s+|$)/s);
    if (m) {
      const sentence = m[1].trim();
      this.buf = this.buf.slice(m[0].length);
      if (sentence.length > 0) this.emitChunked(sentence);
      return true;
    }
    // No terminator yet. If the buffer is long, force a clause break so we
    // don't wait forever on a slow LLM token rate.
    if (this.buf.length >= this.softLimit) {
      const idx = findClauseBreak(this.buf, this.softLimit);
      if (idx > 0) {
        const clause = this.buf.slice(0, idx).trim();
        this.buf = this.buf.slice(idx).trimStart();
        if (clause.length > 0) this.onSentence(clause);
        return true;
      }
    }
    return false;
  }

  /**
   * Emit a "complete" sentence, but if it's longer than hardLimit, sub-split
   * it at clause boundaries so each TTS fetch is small and starts quickly.
   */
  private emitChunked(sentence: string): void {
    if (sentence.length <= this.hardLimit) {
      this.onSentence(sentence);
      return;
    }
    let rest = sentence;
    while (rest.length > this.hardLimit) {
      const idx = findClauseBreak(rest, this.softLimit);
      if (idx <= 0) break;
      const piece = rest.slice(0, idx).trim();
      rest = rest.slice(idx).trimStart();
      if (piece.length > 0) this.onSentence(piece);
    }
    if (rest.length > 0) this.onSentence(rest);
  }
}

/**
 * Find a clause break (`,` `;` `:` ` —`) at or after `minIdx`. Returns the
 * index AFTER the punctuation so callers can slice cleanly. -1 if none.
 */
function findClauseBreak(s: string, minIdx: number): number {
  for (let i = minIdx; i < s.length; i++) {
    const c = s[i];
    if (c === ',' || c === ';' || c === ':') return i + 1;
    if (c === '—' || c === '–') return i + 1;
  }
  return -1;
}

/**
 * Conservative markdown stripper safe to run on a streaming buffer where
 * partial markers may straddle chunk boundaries. We only strip patterns that
 * either (a) are line-anchored (headers, bullets) or (b) are fully closed in
 * the current buffer (matched ** or *).
 */
function stripMarkdownLive(buf: string): string {
  return buf
    .replace(/^[ \t]*#{1,6}[ \t]+[^\n]*\n?/gm, '') // # / ## headers (whole line)
    .replace(/^[ \t]*[-*+•][ \t]+/gm, '') // bullet markers at line start
    .replace(/^[ \t]*\d+[.)][ \t]+/gm, '') // numbered list markers
    .replace(/\*\*([^*\n]+)\*\*/g, '$1') // **bold**
    .replace(/__([^_\n]+)__/g, '$1') // __bold__
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,;:!?]|$)/g, '$1$2') // *italic*
    .replace(/(^|\s)_([^_\n]+)_(?=\s|[.,;:!?]|$)/g, '$1$2') // _italic_
    .replace(/`([^`\n]+)`/g, '$1'); // `code`
}
