import { useStore } from '../state/store';

interface Props {
  onSummarize: () => void;
}

/**
 * Single action: generate the tight blaze-through summary as TEXT only. It
 * renders in QuestionView and survives answer submission. There is no audio —
 * read-aloud support was removed.
 */
export function SummaryControls({ onSummarize }: Props) {
  const isSummarizing = useStore((s) => s.isSummarizing);
  const question = useStore((s) => s.question);
  const intenseSummary = useStore((s) => s.intenseSummary);

  const hasSummary = intenseSummary.trim().length > 0;

  return (
    <div className="row">
      <button
        className="btn btn--primary"
        onClick={onSummarize}
        disabled={!question || isSummarizing}
        title="Generate a tight blaze-through summary of the question"
      >
        {isSummarizing ? 'Summarizing…' : hasSummary ? 'Re-summarize' : 'Summarize'}
      </button>
      <span style={{ flex: 1 }} />
    </div>
  );
}
