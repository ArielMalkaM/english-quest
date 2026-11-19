import { useEffect, useState } from 'react';
import { Button, Confetti } from '../../components/ui';
import { bonusDay, bonusStatus, remainingMs, shouldPromptBonus } from '../../domain/bonusGame';
import { localDate } from '../../domain/dates';
import { navigate } from '../../lib/router';
import { chime } from '../../lib/speech';
import { useStore } from '../../state/store';
import { clock } from './session';
import './bonus.css';

/** Re-renders every minute so the pop-up and banner follow the local day boundary. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** "You unlocked the bonus game" — shown once, the first time the app sees today's quest finished. */
export function BonusUnlockedModal() {
  const { state, actions, t } = useStore();
  const now = useNow();
  const show = shouldPromptBonus(state.progress, now);

  useEffect(() => {
    if (show && state.settings.sound) chime('win');
  }, [show, state.settings.sound]);

  // Escape = "Play later" (the bonus stays available today).
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') actions.bonusPrompted();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, actions]);

  if (!show) return null;
  const answer = (playNow: boolean) => {
    actions.bonusPrompted();
    if (playNow) navigate('bonus');
  };
  return (
    <div className="modal-backdrop bonus-backdrop">
      <Confetti />
      <div className="modal bonus-modal" role="dialog" aria-modal="true" aria-labelledby="bonus-title" aria-describedby="bonus-desc">
        <div className="big-emoji pop" aria-hidden="true">🎉</div>
        <h2 id="bonus-title">{t('עבודה מדהימה! סיימתם את המשימה של היום!', 'Amazing Job! You’ve Finished Today’s Quest!')}</h2>
        <p id="bonus-desc">
          {t('השלמתם את כל אתגרי האנגלית של היום! פתחתם 5 דקות של משחק בונוס! 🎮', 'You completed all your English challenges today! You’ve unlocked 5 minutes of BONUS GAME TIME! 🎮')}
        </p>
        <div className="bonus-modal-actions">
          <Button autoFocus className="bonus-play" onClick={() => answer(true)}>🏁 {t('משחקים עכשיו', 'PLAY NOW')}</Button>
          <Button variant="ghost" onClick={() => answer(false)}>{t('אשחק אחר כך', 'PLAY LATER')}</Button>
        </div>
        <p className="soft-note">{t('המשחק יחכה לכם עד סוף היום.', 'Your bonus waits for you until the end of today.')}</p>
      </div>
    </div>
  );
}

/** Small reminder in the app while today's bonus is still waiting (after "Play later" or a pause). */
export function BonusBanner() {
  const { state, t } = useStore();
  const now = useNow();
  const status = bonusStatus(state.progress, now);
  if ((status !== 'ready' && status !== 'playing') || shouldPromptBonus(state.progress, now)) return null;
  const left = remainingMs(bonusDay(state.progress, localDate(now)));
  return (
    <button type="button" className="bonus-banner" onClick={() => navigate('bonus')}>
      <span className="bonus-banner-icon" aria-hidden="true">🎮</span>
      <span className="bonus-banner-text">
        <b>{status === 'playing' ? t('משחק הבונוס מחכה לכם!', 'Your bonus game is waiting!') : t('פתחתם משחק בונוס!', 'You unlocked a bonus game!')}</b>
        <span>{t(`נשארו ${clock(left)} · עד סוף היום`, `${clock(left)} left · until the end of today`)}</span>
      </span>
      <span className="bonus-banner-go">{t('לשחק ▶', 'Play ▶')}</span>
    </button>
  );
}
