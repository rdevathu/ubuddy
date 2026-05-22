import { onAny, send } from '../src/messaging/bus';
import { providerForHost } from '../src/providers';

export default defineContentScript({
  matches: ['*://*.uworld.com/*', '*://*.amboss.com/*'],
  runAt: 'document_idle',
  main() {
    const log = (...args: unknown[]) =>
      console.log('[ubuddy:content]', ...args);

    const provider = providerForHost(location.hostname);
    if (!provider) {
      log('no provider for host', location.hostname);
      return;
    }
    log('mounted', { host: location.hostname, provider: provider.name });

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
