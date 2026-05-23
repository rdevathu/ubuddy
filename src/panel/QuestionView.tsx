import { useStore } from '../state/store';

export function QuestionView() {
  const question = useStore((s) => s.question);
  const intenseSummary = useStore((s) => s.intenseSummary);
  const isSummarizing = useStore((s) => s.isSummarizing);

  if (!question) {
    return (
      <div className="card">
        <div className="empty">
          Open a UWorld, AMBOSS, or NBME question — UBuddy will pick it up automatically.
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--fg-dim)' }}>
            Not seeing one? Try refreshing the page, or clicking Previous / Next to re-trigger UBuddy.
          </div>
        </div>
      </div>
    );
  }

  const sourceLabel =
    question.source === 'amboss' ? 'AMBOSS' : question.source === 'nbme' ? 'NBME' : 'UWorld';

  // Once a summary exists it takes over the view and stays — the observer
  // fix keeps it through answer submission so it never has to be regenerated.
  const showSummary = isSummarizing || intenseSummary.trim().length > 0;

  return (
    <div className="card">
      <div className="row">
        <h3>{showSummary ? 'Summary' : 'Question'}</h3>
        {question.questionId && (
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
            {sourceLabel} #{question.questionId}
          </span>
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
