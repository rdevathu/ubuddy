import { useStore } from '../state/store';
import { abnormalLabs } from '../uworld/labs';

export function QuestionView() {
  const question = useStore((s) => s.question);
  const verbosity = useStore((s) => s.verbosity);
  const intenseSummary = useStore((s) => s.intenseSummary);

  if (!question) {
    return (
      <div className="card">
        <div className="empty">Open a UWorld question — UBuddy will pick it up automatically.</div>
      </div>
    );
  }

  const abnormal = abnormalLabs(question.labs);

  return (
    <div className="card">
      <div className="row">
        <h3>{verbosity === 'intense' ? 'Intense' : 'Question'}</h3>
        {question.questionId && (
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>#{question.questionId}</span>
        )}
      </div>
      {verbosity === 'intense' ? (
        <div className={`stem intense`}>{intenseSummary || 'Tap Read for a tight, blazing-fast summary.'}</div>
      ) : (
        <div className="stem">{question.stem}</div>
      )}
      {abnormal.length > 0 && (
        <div className="lab-pills">
          {abnormal.map((l) => (
            <span key={l.name + l.value} className={`pill pill--${l.status}`}>
              {l.name} {l.value}
              {l.unit ? ' ' + l.unit : ''} ({l.status})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
