import { useStore } from '../state/store';

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
    </div>
  );
}
