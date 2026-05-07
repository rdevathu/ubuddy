import confetti from 'canvas-confetti';
import { useEffect } from 'react';
import { useStore } from '../state/store';

export function Celebration() {
  const streak = useStore((s) => s.streak);

  useEffect(() => {
    confetti({
      particleCount: 90,
      spread: 70,
      origin: { y: 0.4 },
      scalar: 0.85,
    });
    const t = setTimeout(() => {
      confetti({
        particleCount: 50,
        spread: 100,
        origin: { y: 0.4 },
        scalar: 0.7,
      });
    }, 250);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="celebration">
      <div className="celebration__title">Correct!</div>
      <div className="celebration__sub">
        Streak: {streak.current} · Accuracy: {streak.total ? Math.round((streak.correct / streak.total) * 100) : 0}%
      </div>
    </div>
  );
}
