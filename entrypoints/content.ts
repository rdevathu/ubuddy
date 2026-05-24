import { onAny, send } from '../src/messaging/bus';
import { providerForHost } from '../src/providers';

export default defineContentScript({
  matches: ['*://*.uworld.com/*', '*://*.amboss.com/*', '*://*.starttest.com/*'],
  // NBME loads its question inside an iframe (`ElementDisplayFrame` →
  // itd.aspx) — without `allFrames` we'd never see `.ITSStem`. UWorld and
  // AMBOSS render in the top frame; if we ever get injected into a stray
  // helper iframe the parser simply finds no stem and stays silent.
  allFrames: true,
  runAt: 'document_idle',
  main(ctx) {
    const log = (...args: unknown[]) =>
      console.log('[ubuddy:content]', ...args);

    const provider = providerForHost(location.hostname);
    if (!provider) {
      log('no provider for host', location.hostname);
      return;
    }
    log('mounted', { host: location.hostname, provider: provider.name });

    // NBME (starttest.com) suppresses right-click via
    // `document.oncontextmenu = function() { … return false; }` and reasserts
    // it from a few places. That kills our only path to the extension's
    // context menu in their toolbar-less kiosk window. Restore it in two
    // ways:
    //
    //   1. A `capture: true` `contextmenu` listener that calls
    //      `stopImmediatePropagation()` — this prevents bubble-phase
    //      listeners (including the inline `oncontextmenu` handler) from
    //      running on this event, so the page never gets to `return false`.
    //   2. Periodically null out `document.oncontextmenu` (cheap, runs on
    //      mutations) — defensive, in case NBME re-binds it after we
    //      started listening.
    //
    // Scoped to NBME only — UWorld and AMBOSS don't suppress right-click,
    // and we shouldn't fiddle with page event handling outside of where
    // it's actively breaking us.
    if (provider.name === 'nbme') {
      const restoreContextMenu = (e: Event) => {
        e.stopImmediatePropagation();
      };
      window.addEventListener('contextmenu', restoreContextMenu, { capture: true });
      try {
        (document as unknown as { oncontextmenu: null | unknown }).oncontextmenu = null;
        (document.body as unknown as { oncontextmenu: null | unknown }).oncontextmenu = null;
      } catch {
        // ignore — capture-phase listener is the real safety net
      }
      // NBME's scripts may rebind on later DOM updates; null out again on
      // any mutation. The check is O(1) so this is cheap.
      const rebindKiller = new MutationObserver(() => {
        const d = document as unknown as { oncontextmenu: unknown };
        if (d.oncontextmenu) d.oncontextmenu = null;
        const b = document.body as unknown as { oncontextmenu: unknown } | null;
        if (b && b.oncontextmenu) b.oncontextmenu = null;
      });
      rebindKiller.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['oncontextmenu'],
        subtree: true,
      });
      log('contextmenu restored (NBME suppresses it; we override via capture listener)');
    }

    const observer = provider.createObserver({
      onQuestion: (q) => {
        log('question:loaded', q.source, q.questionId ?? q.questionHash, q.choices.length, 'choices');
        send({ type: 'question:loaded', payload: q });
      },
      onExplanation: (e) => {
        log('explanation:shown', e.correctLetter || '(unrevealed)', 'correct=', e.wasCorrect);
        send({ type: 'explanation:shown', payload: e });
      },
    });
    observer.start();

    // When the extension is reloaded at chrome://extensions, this content
    // script is orphaned in the page (Chrome can't re-inject into an
    // already-loaded tab). Stop the MutationObserver so it isn't churning
    // parse work into a dead runtime until the tab gets refreshed.
    ctx.onInvalidated(() => {
      log('context invalidated — stopping observer');
      observer.stop();
    });

    onAny((msg) => {
      if (msg.type === 'panel:requestParse') {
        const { question, explanation } = observer.refresh();
        const health = provider.selectorHealth();
        log('requestParse →', {
          ok: health.ok,
          hasQuestion: !!question,
          hasExplanation: !!explanation,
        });
        return Promise.resolve({ health, question, explanation });
      }
      if (msg.type === 'panel:forwardClick') {
        const ok = provider.forwardClick(msg.payload.letter);
        log('forwardClick', msg.payload.letter, '→', ok);
        return Promise.resolve({ ok });
      }
    });
  },
});
