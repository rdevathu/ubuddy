import { useStore } from '../state/store';

interface Props {
  onRead: () => void;
  onStop: () => void;
}

export function TTSControls({ onRead, onStop }: Props) {
  const verbosity = useStore((s) => s.verbosity);
  const setVerbosity = useStore((s) => s.setVerbosity);
  const isReading = useStore((s) => s.isReading);
  const question = useStore((s) => s.question);

  return (
    <div className="row">
      <button
        className="btn btn--primary"
        onClick={isReading ? onStop : onRead}
        disabled={!question}
        title="Cmd+Shift+R"
      >
        {isReading ? 'Stop' : 'Read'}
      </button>
      <select
        value={verbosity}
        onChange={(e) => setVerbosity(e.target.value as 'verbatim' | 'intense')}
      >
        <option value="verbatim">Verbatim</option>
        <option value="intense">Intense</option>
      </select>
      <span style={{ flex: 1 }} />
    </div>
  );
}
