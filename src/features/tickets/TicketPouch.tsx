import { useState } from 'react';
import { Button, PageHeader } from '../../components/ui';
import { TicketError, balance } from '../../domain/tickets';
import type { RequestStatus, Reward } from '../../domain/types';
import { navigate } from '../../lib/router';
import { useStore } from '../../state/store';
import { REASON_META } from '../quest/meta';

export const STATUS_META: Record<RequestStatus, { emoji: string; en: string; he: string }> = {
  pending: { emoji: '⏳', en: 'Waiting for a parent', he: 'מחכה להורה' },
  approved: { emoji: '✅', en: 'Approved – coming soon!', he: 'אושר – בקרוב!' },
  declined: { emoji: '↩️', en: 'Not this time – tickets returned', he: 'לא הפעם – הכרטיסים חזרו' },
  fulfilled: { emoji: '🎁', en: 'Redeemed – enjoy!', he: 'מומש – תיהנו!' },
};

export function useDateFormat() {
  const { lang } = useStore();
  const fmt = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (iso: string) => fmt.format(new Date(iso));
}

export function TicketPouch() {
  const { state, t, lang, actions } = useStore();
  const [confirm, setConfirm] = useState<Reward | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const when = useDateFormat();
  const total = balance(state.tickets);
  const rewards = state.rewards.filter((r) => r.active);
  const requests = [...state.requests].reverse();
  const history = [...state.tickets].reverse().slice(0, 30);

  const send = (reward: Reward) => {
    try {
      actions.requestReward(reward.id);
      setSent(lang === 'he' ? reward.titleHe : reward.title);
      setError(null);
    } catch (e) {
      setError(e instanceof TicketError && e.code === 'not-enough' ? t('עוד אין מספיק כרטיסים — עוד קצת!', 'Not enough tickets yet — nearly there!') : t('הפרס הזה לא זמין כרגע.', 'This reward is not available right now.'));
    }
    setConfirm(null);
  };

  return (
    <div className="page">
      <PageHeader emoji="🎟️" title={t('נרתיק הכרטיסים', 'Ticket pouch')} sub={t('כרטיסי מסע מרוויחים בלמידה. רק הורה יכול לאשר משאלה.', 'Quest Tickets are earned by learning. Only a parent can approve a wish.')} />

      <section className="pouch">
        <span className="pouch-art" aria-hidden="true">👝</span>
        <div>
          <b className="pouch-total" aria-live="polite">{total}</b>
          <span>{t('כרטיסי מסע', 'Quest Tickets')}</span>
        </div>
        <Button variant="secondary" onClick={() => navigate('quest')}>{t('להרוויח עוד', 'Earn more')} ▶</Button>
      </section>

      {sent && (
        <div className="feedback feedback-right" role="status">
          <strong>💌 {t(`המשאלה "${sent}" נשלחה להורים!`, `Your wish “${sent}” was sent to your parent!`)}</strong>
          <div className="feedback-body">{t('הכרטיסים שמורים בצד עד שההורה יחליט.', 'The tickets are set aside until your parent decides.')}</div>
        </div>
      )}
      {error && <div className="feedback feedback-clue" role="alert"><strong>{error}</strong></div>}

      <section>
        <h2 className="section-title">🌠 {t('לוח המשאלות', 'Wish Board')}</h2>
        {rewards.length === 0 && <p className="soft-note">{t('ההורים עוד לא הוסיפו פרסים.', 'Your parent has not added rewards yet.')}</p>}
        <ul className="wish-grid">
          {rewards.map((r) => {
            const can = total >= r.cost;
            return (
              <li key={r.id} className={`wish-card ${can ? 'can' : ''}`}>
                <span className="wish-emoji" aria-hidden="true">{r.emoji}</span>
                <b>{lang === 'he' ? r.titleHe || r.title : r.title}</b>
                <span className="wish-cost">🎟️ {r.cost}</span>
                {can ? (
                  <Button onClick={() => setConfirm(r)}>{t('לבקש', 'Ask for it')}</Button>
                ) : (
                  <div className="wish-progress">
                    <div className="meter"><i style={{ width: `${Math.round((total / r.cost) * 100)}%` }} /></div>
                    <small>{t(`עוד ${r.cost - total} כרטיסים`, `${r.cost - total} more tickets`)}</small>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="wish-title" onClick={(e) => e.stopPropagation()}>
            <div className="big-emoji" aria-hidden="true">{confirm.emoji}</div>
            <h2 id="wish-title">{t('לשלוח את המשאלה להורים?', 'Send this wish to your parent?')}</h2>
            <p><b>{lang === 'he' ? confirm.titleHe || confirm.title : confirm.title}</b> · 🎟️ {confirm.cost}</p>
            <p className="soft-note">{t('אם ההורה יגיד "לא הפעם", הכרטיסים יחזרו אליכם.', 'If your parent says “not this time”, the tickets come back to you.')}</p>
            <div className="row-center">
              <Button variant="ghost" onClick={() => setConfirm(null)}>{t('עוד לא', 'Not now')}</Button>
              <Button autoFocus onClick={() => send(confirm)}>💌 {t('שליחה', 'Send wish')}</Button>
            </div>
          </div>
        </div>
      )}

      <section>
        <h2 className="section-title">💌 {t('המשאלות שלי', 'My wishes')}</h2>
        {requests.length === 0 && <p className="soft-note">{t('עוד לא שלחתם משאלות.', 'No wishes sent yet.')}</p>}
        <ul className="list">
          {requests.map((r) => (
            <li key={r.id} className={`list-row status-${r.status}`}>
              <span className="list-emoji" aria-hidden="true">{r.emoji}</span>
              <span className="list-main">
                <b>{lang === 'he' ? r.titleHe || r.title : r.title}</b>
                <small>{STATUS_META[r.status].emoji} {lang === 'he' ? STATUS_META[r.status].he : STATUS_META[r.status].en} · {when(r.requestedAt)}</small>
              </span>
              <span className="chip">🎟️ {r.cost}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="section-title">📜 {t('היסטוריית כרטיסים', 'Ticket history')}</h2>
        <ul className="list compact">
          {history.map((x) => (
            <li key={x.id} className="list-row">
              <span className="list-main">
                <b>{lang === 'he' ? REASON_META[x.reason].he : REASON_META[x.reason].en}</b>
                <small dir="auto">{x.note} · {when(x.at)}</small>
              </span>
              <span className={`amount ${x.amount > 0 ? 'plus' : 'minus'}`} dir="ltr">{x.amount > 0 ? '+' : ''}{x.amount}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
