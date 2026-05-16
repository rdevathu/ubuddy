import { useStore } from '../state/store';

export function QuestionView() {
  const question = useStore((s) => s.question);
  const intenseSummary = useStore((s) => s.intenseSummary);
  const isSummarizing = useStore((s) => s.isSummarizing);

  if (!question) {
    return (
      <div className="card">
        <div className="empty">Open a UWorld question — UBuddy will pick it up automatically.</div>
      </div>
    );
  }

  // Once a summary exists it takes over the view and stays — the observer
  // fix keeps it through answer submission so it never has to be regenerated.
  const showSummary = isSummarizing || intenseSummary.trim().length > 0;

  return (
    <div className="card">
      <div className="row">
        <h3>{showSummary ? 'Summary' : 'Question'}</h3>
        {question.questionId && (
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>#{question.questionId}</span>
        )}
      </div>
      {showSummary ? (
        <div className="stem intense">
          {intenseSummary || 'Summarizing…'}
        </div>
      ) : (
        <div className="stem">{question.stem}</div>
      )}
    </div>
  );
}
