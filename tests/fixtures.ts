/**
 * Test fixture loader.
 *
 * Decodes a captured UWorld page (.mhtml — Chromium "Save As Web Page,
 * Single File" output) into a happy-dom Document, then installs that
 * Document as the global so parser functions (which assume the browser
 * `document` is in scope) can run unmodified.
 *
 * Files live under `Example Pages/` at the repo root and are intentionally
 * gitignored (`*.mhtml`) — they are large, personal, and the contract here
 * is "the parser should keep working against the live UWorld DOM," which is
 * what these captures stand in for.
 *
 * MHTML is multipart/related + quoted-printable. We grab the first
 * `text/html` part, soft-line-break unfold (`=\n` / `=\r\n`), decode `=XX`
 * hex escapes, and hand the resulting HTML to happy-dom.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';

/**
 * Resolve the `Example Pages/` directory by walking up from this file.
 * Works both from the primary checkout (`<repo>/tests/`) and from a git
 * worktree (`<repo>/.claude/worktrees/<name>/tests/`) — the worktree's
 * sibling tree doesn't contain the fixtures, but walking up past it lands
 * us back in the primary checkout that does.
 */
function findFixturesDir(): string | null {
  let dir = path.resolve(import.meta.dir, '..');
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'Example Pages');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

const FIXTURES_DIR = findFixturesDir();

export function fixturePath(name: string): string {
  if (!FIXTURES_DIR) {
    // Returning a path that doesn't exist lets `existsSync(fixturePath(...))`
    // checks in the tests trigger the skip path cleanly.
    return path.join(import.meta.dir, '..', 'Example Pages', name);
  }
  return path.join(FIXTURES_DIR, name);
}

/**
 * Extract the first text/html part from a Chromium-saved MHTML capture and
 * decode its quoted-printable encoding.
 */
export function mhtmlToHtml(mhtml: string): string {
  // Pull the boundary out of the top-level Content-Type header.
  const boundaryMatch = mhtml.match(/boundary="?([^";\r\n]+)"?/i);
  if (!boundaryMatch) throw new Error('mhtmlToHtml: no boundary in MIME header');
  const boundary = boundaryMatch[1];
  const parts = mhtml.split('--' + boundary);

  for (const part of parts) {
    if (!/Content-Type:\s*text\/html/i.test(part)) continue;
    // Headers end at the first blank line; body follows.
    const sep = part.search(/\r?\n\r?\n/);
    if (sep < 0) continue;
    let body = part.slice(sep).replace(/^\r?\n\r?\n/, '');
    // Trim any trailing transport noise.
    body = body.replace(/\r?\n--\s*$/, '');

    // Quoted-printable: `=` followed by CRLF/LF is a soft line break (delete);
    // `=XX` is a hex byte. UWorld's saved HTML is ASCII-safe in practice so we
    // decode as bytes → UTF-8.
    const unfolded = body.replace(/=\r?\n/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < unfolded.length; i++) {
      const c = unfolded.charCodeAt(i);
      if (c === 0x3d /* = */ && i + 2 < unfolded.length) {
        const hex = unfolded.slice(i + 1, i + 3);
        if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
          bytes.push(parseInt(hex, 16));
          i += 2;
          continue;
        }
      }
      bytes.push(c & 0xff);
    }
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  }
  throw new Error('mhtmlToHtml: no text/html part found');
}

export interface LoadedFixture {
  html: string;
  window: Window;
  /** Tear down `globalThis.document` + friends and close the window. */
  dispose: () => void;
}

/**
 * Load a fixture by filename and install its happy-dom document as the global
 * `document` / `Node` / `Element`. The parser reads from globals, so this is
 * how we let it run unmodified in a Bun test process.
 *
 * Always pair with `dispose()` (use `try { ... } finally { dispose() }`); a
 * leaked window keeps a megabyte of fixture DOM in memory and contaminates
 * the next test's globals.
 */
export function loadFixture(filename: string): LoadedFixture {
  const raw = readFileSync(fixturePath(filename), 'utf8');
  const html = mhtmlToHtml(raw);

  const window = new Window({ url: 'https://apps.uworld.com/' });
  // happy-dom's HTMLDocument has its own `write`-style setter; using
  // `documentElement.innerHTML` short-circuits its tokenizer and is the
  // fastest way to seed a fully-formed HTML payload.
  window.document.documentElement.innerHTML = html.replace(/^<!DOCTYPE[^>]*>/i, '');

  const prev = {
    document: (globalThis as any).document,
    Node: (globalThis as any).Node,
    Element: (globalThis as any).Element,
    HTMLElement: (globalThis as any).HTMLElement,
    window: (globalThis as any).window,
  };
  (globalThis as any).document = window.document;
  (globalThis as any).Node = window.Node;
  (globalThis as any).Element = window.Element;
  (globalThis as any).HTMLElement = window.HTMLElement;
  (globalThis as any).window = window;

  return {
    html,
    window: window as unknown as Window,
    dispose: () => {
      (globalThis as any).document = prev.document;
      (globalThis as any).Node = prev.Node;
      (globalThis as any).Element = prev.Element;
      (globalThis as any).HTMLElement = prev.HTMLElement;
      (globalThis as any).window = prev.window;
      // happy-dom asks consumers to close so async tasks shut down cleanly.
      try {
        (window as any).happyDOM?.close?.();
      } catch {
        /* ignore */
      }
    },
  };
}
