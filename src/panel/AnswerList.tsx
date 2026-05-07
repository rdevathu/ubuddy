import { useStore } from '../state/store';

interface Props {
  onPick: (letter: string) => void;
}

export function AnswerList({ onPick }: Props) {
  const question = useStore((s) => s.question);
  const explanation = useStore((s) => s.explanation);
  const selectedLetter = useStore((s) => s.selectedLetter);

  if (!question) return null;

  return (
    <div className="card">
      <h3>Choices</h3>
      {question.choices.map((c) => {
        const explained = !!explanation;
        const isSelected = selectedLetter === c.letter;
        const isCorrect = explained && c.letter === explanation.correctLetter;
        const isWrongPick =
          explained && explanation.userLetter === c.letter && !explanation.wasCorrect;
        const cls = [
          'choice',
          isSelected && !explained ? 'is-selected' : '',
          isCorrect ? 'is-correct' : '',
          isWrongPick ? 'is-incorrect' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button key={c.letter} className={cls} onClick={() => onPick(c.letter)} disabled={explained}>
            <span className="choice__letter">{c.letter}.</span>
            <span className="choice__text">
              {c.text}
              {c.percentage != null && <span className="choice__pct">({c.percentage}%)</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
