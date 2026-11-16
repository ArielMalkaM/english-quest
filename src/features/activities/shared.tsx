import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Arrow, Button, useFocusOnShow } from '../../components/ui';
import type { ItemResult } from '../../domain/types';
import { chime } from '../../lib/speech';
import { useStore } from '../../state/store';

export interface GameProps<A> {
  activity: A;
  onDone: (items: ItemResult[], text?: string) => void;
}

/** play → (wrong) clue → (wrong again) reveal, or → right. Mistakes never end the game. */
export type Phase = 'play' | 'clue' | 'right' | 'reveal';

type Meta = Omit<ItemResult, 'firstTry' | 'solved'>;

/**
 * Shared "supportive correction" flow for item-by-item games:
 * first miss → one clue and a retry; second miss → the answer is shown kindly and
 * the item is queued to come back another day in a different game.
 */
export function useRound(total: number, meta: (index: number) => Meta, onDone: (items: ItemResult[]) => void) {
  const { state } = useStore();
  const [index, setIndex] = useState(0);
  const [tries, setTries] = useState(0);
  const [phase, setPhase] = useState<Phase>('play');
  const results = useRef<ItemResult[]>([]);
  const sound = state.settings.sound;

  const submit = useCallback(
    (correct: boolean) => {
      if (phase === 'right' || phase === 'reveal') return;
      if (correct) {
        results.current.push({ ...meta(index), firstTry: tries === 0, solved: true });
        setPhase('right');
        if (sound) chime('right');
        return;
      }
      const n = tries + 1;
      setTries(n);
      if (sound) chime('soft');
      if (n >= 2) {
        results.current.push({ ...meta(index), firstTry: false, solved: false });
        setPhase('reveal');
      } else {
        setPhase('clue');
      }
    },
    [index, meta, phase, sound, tries],
  );

  const next = useCallback(() => {
    if (index + 1 >= total) {
      onDone(results.current);
      return;
    }
    setIndex(index + 1);
    setTries(0);
    setPhase('play');
  }, [index, onDone, total]);

  return { index, tries, phase, submit, next, total, finished: phase === 'right' || phase === 'reveal' };
}

const PRAISE = ['Yes! ⭐', 'Great! 🌟', 'You got it! ✨', 'Nice work! 💫', 'Super! ⭐'];

export function FeedbackBar({
  phase,
  index = 0,
  clue,
  explain,
  answer,
  onNext,
  last,
}: {
  phase: Phase;
  index?: number;
  clue?: ReactNode;
  explain?: ReactNode;
  answer?: ReactNode;
  onNext: () => void;
  last?: boolean;
}) {
  const { t } = useStore();
  const nextRef = useFocusOnShow<HTMLButtonElement>(phase === 'right' || phase === 'reveal');
  return (
    <div className={`feedback feedback-${phase}`} role="status" aria-live="polite">
      {phase === 'clue' && (
        <>
          <strong>{t('עוד לא — נסו את הרמז הזה:', 'Not yet — try this clue:')}</strong>
          <div className="feedback-body">{clue}</div>
        </>
      )}
      {phase === 'right' && (
        <>
          <strong dir="ltr" lang="en">{PRAISE[index % PRAISE.length]}</strong>
          {explain && <div className="feedback-body">{explain}</div>}
        </>
      )}
      {phase === 'reveal' && (
        <>
          <strong>{t('כמעט! הנה התשובה:', 'So close! Here is the answer:')}</strong>
          <div className="feedback-body">{answer}</div>
          <div className="feedback-note">{t('זה יחזור ביום אחר, במשחק אחר. 🌱', 'It will come back another day, in a different game. 🌱')}</div>
        </>
      )}
      {(phase === 'right' || phase === 'reveal') && (
        <Button ref={nextRef} onClick={onNext} className="feedback-next">
          {last ? t('סיום', 'Finish') : t('הבא', 'Next')} <Arrow />
        </Button>
      )}
    </div>
  );
}

export function Counter({ index, total }: { index: number; total: number }) {
  const { t } = useStore();
  return (
    <div className="counter" aria-label={t(`שאלה ${index + 1} מתוך ${total}`, `Item ${index + 1} of ${total}`)}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < index ? 'done' : i === index ? 'now' : ''} />
      ))}
    </div>
  );
}
