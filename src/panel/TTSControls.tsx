import { useStore } from '../state/store';

interface Props {
  onRead: () => void;
  onStop: () => void;
  onSummarize: () => void;
}

/**
 * Two independent actions, no verbosity dropdown:
 *
 *  - Summarize: generates the tight blaze-through summary as TEXT only
 *    (no audio). Stays on screen and survives answer submission.
 *  - Read / Stop: speaks aloud. If a summary has been generated it reads the
 *    summary; otherwise it reads the question stem verbatim. Never triggers
 *    summary generation on its own.
 */
export function TTSControls({ onRead, onStop, onSummarize }: Props) {
  const isReading = useStore((s) => s.isReading);
  const isSummarizing = useStore((s) => s.isSummarizing);
  const question = useStore((s) => s.question);
  const intenseSummary = useStore((s) => s.intenseSummary);

  const busy = isReading || isSummarizing;
  const hasSummary = intenseSummary.trim().length > 0;

  return (
    <div className="row">
      <button
        className="btn btn--primary"
        onClick={isReading ? onStop : onRead}
        disabled={!question || isSummarizing}
        title={hasSummary ? 'Read the summary aloud' : 'Read the question aloud (Cmd+Shift+R)'}
      >
        {isReading ? 'Stop' : hasSummary ? 'Read summary' : 'Read'}
      </button>
      <button
        className="btn"
        onClick={onSummarize}
        disabled={!question || busy}
        title="Generate a tight summary (text only — press Read to hear it)"
      >
        {isSummarizing ? 'Summarizing…' : hasSummary ? 'Re-summarize' : 'Summarize'}
      </button>
      <span style={{ flex: 1 }} />
    </div>
  );
}
