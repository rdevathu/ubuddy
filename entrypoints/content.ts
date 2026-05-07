import { onAny, send } from '../src/messaging/bus';
import { forwardClick, selectorHealth } from '../src/uworld/parser';
import { UWorldObserver } from '../src/uworld/observer';

export default defineContentScript({
  matches: ['*://*.uworld.com/*'],
  runAt: 'document_idle',
  main() {
    const log = (...args: unknown[]) => console.log('[ubuddy:content]', ...args);
    log('mounted on', location.href);

    const observer = new UWorldObserver({
      onQuestion: (q) => {
        log('question:loaded', q.questionHash, q.choices.length, 'choices');
        send({ type: 'question:loaded', payload: q });
      },
      onExplanation: (e) => {
        log('explanation:shown', e.correctLetter, 'correct=', e.wasCorrect);
        send({ type: 'explanation:shown', payload: e });
      },
    });
    observer.start();

    onAny((msg) => {
      if (msg.type === 'panel:requestParse') {
        const { question, explanation } = observer.refresh();
        const health = selectorHealth();
        log('requestParse →', { ok: health.ok, hasQuestion: !!question, hasExplanation: !!explanation });
        return Promise.resolve({ health, question, explanation });
      }
      if (msg.type === 'panel:forwardClick') {
        const ok = forwardClick(msg.payload.letter);
        log('forwardClick', msg.payload.letter, '→', ok);
        return Promise.resolve({ ok });
      }
    });
  },
});
