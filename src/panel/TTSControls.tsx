import { useEffect, useState } from 'react';
import { useStore } from '../state/store';

interface Props {
  onRead: () => void;
  onStop: () => void;
  voices: { id: string; label: string }[];
}

export function TTSControls({ onRead, onStop, voices }: Props) {
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
      <VoiceCount count={voices.length} />
    </div>
  );
}

function VoiceCount({ count }: { count: number }) {
  if (count === 0) return null;
  return <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{count} voices</span>;
}

export function useVoices(provider: 'webspeech' | 'openrouter') {
  const [voices, setVoices] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    if (provider !== 'webspeech') {
      setVoices([
        { id: 'alloy', label: 'Alloy' },
        { id: 'echo', label: 'Echo' },
        { id: 'fable', label: 'Fable' },
        { id: 'onyx', label: 'Onyx' },
        { id: 'nova', label: 'Nova' },
        { id: 'shimmer', label: 'Shimmer' },
      ]);
      return;
    }
    if (!('speechSynthesis' in window)) return;
    const update = () =>
      setVoices(speechSynthesis.getVoices().map((v) => ({ id: v.name, label: `${v.name} (${v.lang})` })));
    update();
    speechSynthesis.onvoiceschanged = update;
    return () => {
      speechSynthesis.onvoiceschanged = null;
    };
  }, [provider]);
  return voices;
}
