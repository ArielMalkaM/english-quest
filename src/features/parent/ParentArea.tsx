import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AvatarPicker } from '../../components/AvatarPicker';
import { Arrow, Button, En, PageHeader } from '../../components/ui';
import { GRAMMAR, findWord } from '../../data/curriculum';
import { DEMO_PIN } from '../../data/seed';
import { isValidPin } from '../../domain/parentAuth';
import { weeklySummary } from '../../domain/progress';
import { balance, earnedThisWeek } from '../../domain/tickets';
import type { Reward } from '../../domain/types';
import { navigate } from '../../lib/router';
import { useStore } from '../../state/store';
import { REASON_META, SKILL_META } from '../quest/meta';
import { STATUS_META, useDateFormat } from '../tickets/TicketPouch';
import { WeeklyPlan } from '../week/WeeklyPlan';

function PinGate() {
  const { state, t, actions } = useStore();
  const creating = state.parent.pinHash === null;
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidPin(pin)) return setError(t('הקוד חייב להיות 4 ספרות.', 'The PIN must be 4 digits.'));
    if (creating) {
      if (pin !== again) return setError(t('שני הקודים לא זהים.', 'The two PINs do not match.'));
      actions.createParentPin(pin);
      return;
    }
    if (!actions.unlockParent(pin)) {
      setError(t('הקוד לא נכון. נסו שוב.', 'That PIN is not right. Please try again.'));
      setPin('');
    }
  };

  return (
    <div className="page center narrow">
      <div className="big-emoji" aria-hidden="true">🔐</div>
      <PageHeader
        title={t('אזור ההורים', 'Parent area')}
        sub={creating ? t('בחרו קוד בן 4 ספרות. רק מי שיודע אותו יכול לאשר פרסים.', 'Choose a 4-digit PIN. Only someone who knows it can approve rewards.') : t('הקלידו את קוד ההורים.', 'Enter the parent PIN.')}
      />
      <form className="pin-form" onSubmit={submit}>
        <label htmlFor="pin">{creating ? t('קוד חדש', 'New PIN') : t('קוד הורים', 'Parent PIN')}</label>
        <input id="pin" className="text-input pin" dir="ltr" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus />
        {creating && (
          <>
            <label htmlFor="pin2">{t('שוב, לאישור', 'Again, to confirm')}</label>
            <input id="pin2" className="text-input pin" dir="ltr" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, ''))} />
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit">{creating ? t('שמירת הקוד', 'Save PIN') : t('כניסה', 'Unlock')}</Button>
      </form>
      <Button variant="ghost" onClick={() => navigate('')}><Arrow back /> {t('חזרה לאי', 'Back to the island')}</Button>
    </div>
  );
}

function Overview() {
  const { state, t, lang } = useStore();
  const s = weeklySummary(state, new Date());
  // First-strong isolate keeps an English nickname from scrambling the Hebrew sentence.
  const name = `⁨${state.profile?.name ?? ''}⁩`;
  const L = (x: { en: string; he: string }) => (lang === 'he' ? x.he : x.en);
  const grammar = s.grammarPractised.slice(0, 2).map((g) => (GRAMMAR[g] ? L(GRAMMAR[g]) : g));
  const pending = state.requests.filter((r) => r.status === 'pending').length;
  const message =
    s.questsCompleted === 0
      ? t(`${name} עוד לא השלים/ה משימה השבוע. משימה קצרה של 10 דקות היא התחלה נהדרת.`, `${name} has not finished a quest yet this week. A short 10-minute quest is a great start.`)
      : t(
          `${name} השלים/ה ${s.questsCompleted === 1 ? 'משימת למידה אחת' : `${s.questsCompleted} משימות למידה`} השבוע${grammar.length ? ` ותרגל/ה ${grammar.join(' ו-')}` : ''}.`,
          `${name} completed ${s.questsCompleted} learning ${s.questsCompleted === 1 ? 'quest' : 'quests'} this week${grammar.length ? ` and practised ${grammar.join(' and ')}` : ''}.`,
        );

  return (
    <>
      <div className="notice">
        <span aria-hidden="true">🌟</span>
        <p>{message}</p>
      </div>
      {pending > 0 && (
        <div className="notice notice-coral">
          <span aria-hidden="true">💌</span>
          <p>{t(`${pending} משאלות מחכות לתשובה שלכם בלשונית "בקשות".`, `${pending} wish(es) are waiting for your answer in the “Requests” tab.`)}</p>
        </div>
      )}
      <div className="stat-row">
        <div className="stat"><b>{s.minutes}</b><span>{t('דקות השבוע', 'minutes this week')}</span></div>
        <div className="stat"><b>{s.daysCompleted}</b><span>{t('ימים עם משימה', 'days with a quest')}</span></div>
        <div className="stat"><b>{s.questsCompleted}</b><span>{t('משימות', 'quests')}</span></div>
        <div className="stat"><b>{balance(state.tickets)}</b><span>{t('יתרת כרטיסים', 'ticket balance')}</span></div>
      </div>
      <section className="card">
        <h2>{t('מיומנויות שתורגלו השבוע', 'Skills practised this week')}</h2>
        {s.skills.length === 0 && <p className="soft-note">{t('אין עדיין נתונים לשבוע הזה.', 'No data for this week yet.')}</p>}
        <ul className="skill-bars">
          {s.skills.map((k) => (
            <li key={k.skill}>
              <span>{SKILL_META[k.skill].emoji} {L(SKILL_META[k.skill])}</span>
              <div className="meter" role="img" aria-label={t(`${Math.round(k.accuracy * 100)}% נכון בניסיון ראשון`, `${Math.round(k.accuracy * 100)}% right first try`)}>
                <i style={{ width: `${Math.round(k.accuracy * 100)}%` }} />
              </div>
              <small>{k.count} {t('פעילויות', 'activities')} · {Math.round(k.accuracy * 100)}%</small>
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2>💪 {t('חוזקות', 'Strengths')}</h2>
        <div className="chip-row">
          {s.strengths.length === 0 ? <span className="soft-note">—</span> : s.strengths.map((k) => <span key={k} className="chip chip-good">{L(SKILL_META[k])}</span>)}
        </div>
        <h2>🌱 {t('מילים לחזרה', 'Words needing review')}</h2>
        <div className="chip-row" dir="ltr">
          {s.wordsToRevisit.length === 0 ? <span className="soft-note">—</span> : s.wordsToRevisit.map((id) => {
            const w = findWord(id);
            return w ? <span key={id} className="chip">{w.emoji} {w.en} · <span dir="rtl">{w.he}</span></span> : null;
          })}
        </div>
        <h2>🧪 {t('דקדוק לחיזוק', 'Grammar needing review')}</h2>
        <div className="chip-row">
          {s.grammarToPractise.length === 0 ? <span className="soft-note">—</span> : s.grammarToPractise.map((g) => <span key={g} className="chip">{GRAMMAR[g] ? L(GRAMMAR[g]) : g}</span>)}
        </div>
        <p className="soft-note">{t('טעויות חוזרות אוטומטית במשחק אחר בימים הבאים — אין צורך לתרגל בנפרד.', 'Mistakes return automatically in a different game on later days — no extra drilling needed.')}</p>
      </section>
      {s.writing.length > 0 && (
        <section className="card">
          <h2>✏️ {t('כתיבה אחרונה', 'Recent writing')}</h2>
          <ul className="writing-list" dir="ltr" lang="en">
            {s.writing.map((w, i) => (
              <li key={i}>“{w.text}”</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Requests() {
  const { state, t, lang, actions } = useStore();
  const when = useDateFormat();
  const title = (r: { title: string; titleHe: string }) => (lang === 'he' ? r.titleHe || r.title : r.title);
  const pending = state.requests.filter((r) => r.status === 'pending');
  const approved = state.requests.filter((r) => r.status === 'approved');
  const past = state.requests.filter((r) => r.status === 'declined' || r.status === 'fulfilled').reverse();

  return (
    <>
      <section className="card">
        <h2>⏳ {t('מחכות לאישור', 'Waiting for your decision')}</h2>
        {pending.length === 0 && <p className="soft-note">{t('אין בקשות חדשות.', 'No new requests.')}</p>}
        <ul className="list">
          {pending.map((r) => (
            <li key={r.id} className="list-row tall">
              <span className="list-emoji" aria-hidden="true">{r.emoji}</span>
              <span className="list-main">
                <b>{title(r)}</b>
                <small>🎟️ {r.cost} · {when(r.requestedAt)}</small>
              </span>
              <span className="row-actions">
                <Button variant="ghost" onClick={() => actions.decideRequest(r.id, 'decline')}>{t('לא הפעם', 'Decline')}</Button>
                <Button onClick={() => actions.decideRequest(r.id, 'approve')}>{t('אישור', 'Approve')}</Button>
              </span>
            </li>
          ))}
        </ul>
        <p className="soft-note">{t('דחייה מחזירה את הכרטיסים לילד/ה.', 'Declining returns the tickets to your child.')}</p>
      </section>
      <section className="card">
        <h2>✅ {t('אושרו — מחכות למימוש', 'Approved — waiting to be given')}</h2>
        {approved.length === 0 && <p className="soft-note">{t('אין פרסים פתוחים.', 'No open rewards.')}</p>}
        <ul className="list">
          {approved.map((r) => (
            <li key={r.id} className="list-row tall">
              <span className="list-emoji" aria-hidden="true">{r.emoji}</span>
              <span className="list-main">
                <b>{title(r)}</b>
                <small>🎟️ {r.cost} · {t('אושר', 'approved')} {r.decidedAt ? when(r.decidedAt) : ''}</small>
              </span>
              <Button variant="secondary" onClick={() => actions.fulfillRequest(r.id)}>🎁 {t('סימון כמומש', 'Mark as fulfilled')}</Button>
            </li>
          ))}
        </ul>
      </section>
      {past.length > 0 && (
        <section className="card">
          <h2>📜 {t('בקשות קודמות', 'Past requests')}</h2>
          <ul className="list compact">
            {past.map((r) => (
              <li key={r.id} className="list-row">
                <span className="list-emoji" aria-hidden="true">{r.emoji}</span>
                <span className="list-main">
                  <b>{title(r)}</b>
                  <small>{STATUS_META[r.status].emoji} {lang === 'he' ? STATUS_META[r.status].he : STATUS_META[r.status].en}</small>
                </span>
                <span className="chip">🎟️ {r.cost}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

const EMPTY_REWARD = { title: '', titleHe: '', emoji: '🎁', cost: 10, active: true };

function RewardForm({ initial, onSave, onCancel }: { initial: Omit<Reward, 'id'> & { id?: string }; onSave: (r: Omit<Reward, 'id'> & { id?: string }) => string | null; onCancel?: () => void }) {
  const { t } = useStore();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const id = initial.id ?? 'new';
  return (
    <form
      className="reward-form"
      onSubmit={(e) => {
        e.preventDefault();
        const err = onSave(draft);
        setError(err);
        if (!err && !initial.id) setDraft(EMPTY_REWARD);
      }}
    >
      <label htmlFor={`e-${id}`}>{t('אימוג׳י', 'Emoji')}</label>
      <input id={`e-${id}`} className="text-input tiny" value={draft.emoji} maxLength={4} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} />
      <label htmlFor={`he-${id}`}>{t('שם הפרס (עברית)', 'Reward name (Hebrew)')}</label>
      <input id={`he-${id}`} className="text-input" dir="rtl" value={draft.titleHe} onChange={(e) => setDraft({ ...draft, titleHe: e.target.value })} />
      <label htmlFor={`en-${id}`}>{t('שם הפרס (אנגלית)', 'Reward name (English)')}</label>
      <input id={`en-${id}`} className="text-input" dir="ltr" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      <label htmlFor={`c-${id}`}>{t('מחיר בכרטיסים', 'Cost in tickets')}</label>
      <input id={`c-${id}`} className="text-input tiny" dir="ltr" type="number" min={1} max={999} value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: Number(e.target.value) })} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="row-center">
        {onCancel && <Button variant="ghost" onClick={onCancel}>{t('ביטול', 'Cancel')}</Button>}
        <Button type="submit">{initial.id ? t('שמירה', 'Save') : t('הוספת פרס', 'Add reward')}</Button>
      </div>
    </form>
  );
}

function Rewards() {
  const { state, t, lang, actions } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const save = (r: Omit<Reward, 'id'> & { id?: string }) => {
    const title = r.title.trim() || r.titleHe.trim();
    try {
      actions.saveReward({ ...r, title, titleHe: r.titleHe.trim() || title });
      setEditing(null);
      return null;
    } catch {
      return t('צריך שם לפרס ומחיר של כרטיס אחד לפחות.', 'A reward needs a name and a cost of at least 1 ticket.');
    }
  };

  return (
    <>
      <section className="card">
        <h2>🌠 {t('פרסים בלוח המשאלות', 'Rewards on the Wish Board')}</h2>
        <ul className="list">
          {state.rewards.map((r) =>
            editing === r.id ? (
              <li key={r.id} className="list-row block">
                <RewardForm initial={r} onSave={save} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li key={r.id} className={`list-row tall ${r.active ? '' : 'paused'}`}>
                <span className="list-emoji" aria-hidden="true">{r.emoji}</span>
                <span className="list-main">
                  <b>{lang === 'he' ? r.titleHe || r.title : r.title}</b>
                  <small>🎟️ {r.cost}{r.active ? '' : ` · ⏸ ${t('מושהה', 'paused')}`}</small>
                </span>
                <span className="row-actions">
                  {removing === r.id ? (
                    <>
                      <Button variant="ghost" onClick={() => setRemoving(null)}>{t('ביטול', 'Cancel')}</Button>
                      <Button variant="coral" onClick={() => { actions.removeReward(r.id); setRemoving(null); }}>{t('כן, להסיר', 'Yes, remove')}</Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" onClick={() => setEditing(r.id)}>{t('עריכה', 'Edit')}</Button>
                      <Button variant="ghost" onClick={() => actions.saveReward({ ...r, active: !r.active })}>{r.active ? t('השהיה', 'Pause') : t('הפעלה', 'Resume')}</Button>
                      <Button variant="ghost" onClick={() => setRemoving(r.id)}>{t('הסרה', 'Remove')}</Button>
                    </>
                  )}
                </span>
              </li>
            ),
          )}
        </ul>
      </section>
      <section className="card">
        <h2>➕ {t('פרס חדש', 'New reward')}</h2>
        <RewardForm initial={EMPTY_REWARD} onSave={save} />
      </section>
    </>
  );
}

function Tickets() {
  const { state, t, lang, actions } = useStore();
  const when = useDateFormat();
  const [gift, setGift] = useState(5);
  const [note, setNote] = useState('');
  const { weeklyTicketCap: cap, bonusMultiplier } = state.settings;
  const now = new Date();

  return (
    <>
      <div className="stat-row">
        <div className="stat"><b>{balance(state.tickets)}</b><span>{t('יתרה', 'balance')}</span></div>
        <div className="stat"><b>{earnedThisWeek(state.tickets, now)}{cap !== null ? ` / ${cap}` : ''}</b><span>{t('הורווחו השבוע', 'earned this week')}</span></div>
      </div>
      <section className="card">
        <h2>⚙️ {t('כללי כרטיסים', 'Ticket rules')}</h2>
        <label className="toggle">
          <input type="checkbox" checked={cap !== null} onChange={(e) => actions.updateParentSettings({ weeklyTicketCap: e.target.checked ? 60 : null })} />
          <span>{t('מכסה שבועית של כרטיסים', 'Weekly ticket cap')}</span>
        </label>
        {cap !== null && (
          <div className="inline-field">
            <label htmlFor="cap">{t('מקסימום כרטיסים בשבוע', 'Maximum tickets per week')}</label>
            <input id="cap" className="text-input tiny" dir="ltr" type="number" min={5} max={500} value={cap} onChange={(e) => actions.updateParentSettings({ weeklyTicketCap: Math.max(5, Number(e.target.value) || 5) })} />
          </div>
        )}
        <div className="inline-field">
          <label htmlFor="mult">{t('מכפיל בונוס', 'Bonus multiplier')}</label>
          <select id="mult" className="text-input tiny" value={bonusMultiplier} onChange={(e) => actions.updateParentSettings({ bonusMultiplier: Number(e.target.value) })}>
            <option value={1}>×1</option>
            <option value={1.5}>×1.5</option>
            <option value={2}>×2</option>
          </select>
        </div>
        <p className="soft-note">{t('כרטיסים ניתנים על השלמה והתמדה — אף פעם לא על מהירות, ולעולם לא נלקחים על טעויות.', 'Tickets reward completion and perseverance — never speed — and are never taken away for mistakes.')}</p>
      </section>
      <section className="card">
        <h2>🎁 {t('מתנת כרטיסים', 'Gift tickets')}</h2>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            actions.giftTickets(gift, note.trim() || t('מתנה מההורים', 'Gift from a parent'));
            setNote('');
          }}
        >
          <label htmlFor="gift-n">{t('כמות', 'Amount')}</label>
          <input id="gift-n" className="text-input tiny" dir="ltr" type="number" min={1} max={100} value={gift} onChange={(e) => setGift(Math.max(1, Number(e.target.value) || 1))} />
          <label htmlFor="gift-note">{t('על מה? (רשות)', 'What for? (optional)')}</label>
          <input id="gift-note" className="text-input" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button type="submit">{t('הענקה', 'Give')}</Button>
        </form>
      </section>
      <section className="card">
        <h2>📜 {t('כל התנועות', 'Full transaction history')}</h2>
        <ul className="list compact">
          {[...state.tickets].reverse().map((x) => (
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
    </>
  );
}

function ParentSettings() {
  const { state, t, actions } = useStore();
  const profile = state.profile;
  const [name, setName] = useState(profile?.name ?? '');
  const [pin, setPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState<'all' | 'demo' | null>(null);
  if (!profile) return null;

  return (
    <>
      <section className="card">
        <h2>🧒 {t('פרופיל הילד/ה', 'Child profile')}</h2>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) actions.updateProfile({ name: name.trim().slice(0, 20) });
          }}
        >
          <label htmlFor="child-name">{t('כינוי', 'Nickname')}</label>
          <input id="child-name" className="text-input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="secondary">{t('שמירה', 'Save')}</Button>
        </form>
        <AvatarPicker value={profile.avatar} onChange={(avatar) => actions.updateProfile({ avatar })} />
        <fieldset className="pick-group">
          <legend>{t('יעד יומי', 'Daily goal')}</legend>
          <div className="pick-row">
            {([10, 15, 20] as const).map((m) => (
              <button key={m} type="button" className={`pick wide ${profile.dailyGoalMinutes === m ? 'on' : ''}`} aria-pressed={profile.dailyGoalMinutes === m} onClick={() => actions.updateProfile({ dailyGoalMinutes: m })}>
                {m} {t('דק׳', 'min')}
              </button>
            ))}
          </div>
        </fieldset>
      </section>
      <section className="card">
        <h2>🌐 {t('שפה ונגישות', 'Language and accessibility')}</h2>
        <fieldset className="pick-group">
          <legend>{t('שפת הממשק וכיוון', 'Interface language and direction')}</legend>
          <div className="pick-row">
            <button type="button" className={`pick wide ${state.settings.uiLang === 'he' ? 'on' : ''}`} aria-pressed={state.settings.uiLang === 'he'} onClick={() => actions.updateChildSettings({ uiLang: 'he' })}>עברית (RTL)</button>
            <button type="button" className={`pick wide ${state.settings.uiLang === 'en' ? 'on' : ''}`} aria-pressed={state.settings.uiLang === 'en'} onClick={() => actions.updateChildSettings({ uiLang: 'en' })}>English (LTR)</button>
          </div>
        </fieldset>
        <label className="toggle">
          <input type="checkbox" checked={state.settings.reducedMotion} onChange={(e) => actions.updateChildSettings({ reducedMotion: e.target.checked })} />
          <span>{t('הפחתת תנועה ואנימציות', 'Reduce motion and animations')}</span>
        </label>
      </section>
      <section className="card">
        <h2>🔐 {t('החלפת קוד הורים', 'Change parent PIN')}</h2>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isValidPin(pin)) return setPinMsg(t('הקוד חייב להיות 4 ספרות.', 'The PIN must be 4 digits.'));
            actions.changePin(pin);
            setPin('');
            setPinMsg(t('הקוד עודכן.', 'PIN updated.'));
          }}
        >
          <label htmlFor="new-pin">{t('קוד חדש (4 ספרות)', 'New PIN (4 digits)')}</label>
          <input id="new-pin" className="text-input pin" dir="ltr" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          <Button type="submit" variant="secondary">{t('עדכון', 'Update')}</Button>
        </form>
        {pinMsg && <p className="soft-note" role="status">{pinMsg}</p>}
      </section>
      <section className="card danger">
        <h2>🧹 {t('איפוס נתונים', 'Reset data')}</h2>
        <p className="soft-note">{t('כל המידע נשמר רק בדפדפן הזה. איפוס מוחק אותו לצמיתות.', 'All data lives only in this browser. Resetting deletes it permanently.')}</p>
        {confirmReset === null ? (
          <div className="row-center">
            <Button variant="ghost" onClick={() => setConfirmReset('demo')}>{t('טעינת נתוני הדגמה', 'Load demo data')}</Button>
            <Button variant="coral" onClick={() => setConfirmReset('all')}>{t('איפוס מלא', 'Reset everything')}</Button>
          </div>
        ) : (
          <div className="feedback feedback-clue" role="alertdialog" aria-label={t('אישור איפוס', 'Confirm reset')}>
            <strong>
              {confirmReset === 'all'
                ? t('למחוק את כל ההתקדמות, הכרטיסים והקוד ולהתחיל מחדש?', 'Delete all progress, tickets and the PIN, and start again?')
                : t(`להחליף את הנתונים בנתוני הדגמה? (קוד ההדגמה: ${DEMO_PIN})`, `Replace everything with demo data? (Demo PIN: ${DEMO_PIN})`)}
            </strong>
            <div className="row-center">
              <Button variant="ghost" onClick={() => setConfirmReset(null)}>{t('ביטול', 'Cancel')}</Button>
              <Button
                variant="coral"
                onClick={() => {
                  if (confirmReset === 'all') {
                    actions.resetAll();
                    navigate('');
                  } else {
                    actions.resetToDemo();
                    setConfirmReset(null);
                  }
                }}
              >
                {t('כן, לאפס', 'Yes, reset')}
              </Button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

type Tab = 'overview' | 'requests' | 'rewards' | 'tickets' | 'plan' | 'settings';

export function ParentArea() {
  const { state, t, parentUnlocked, actions } = useStore();
  const [tab, setTab] = useState<Tab>('overview');
  if (!parentUnlocked) return <PinGate />;
  const pending = state.requests.filter((r) => r.status === 'pending').length;
  const tabs: { id: Tab; label: string; emoji: string; badge?: number }[] = [
    { id: 'overview', label: t('סיכום', 'Overview'), emoji: '📊' },
    { id: 'requests', label: t('בקשות', 'Requests'), emoji: '💌', badge: pending },
    { id: 'rewards', label: t('פרסים', 'Rewards'), emoji: '🌠' },
    { id: 'tickets', label: t('כרטיסים', 'Tickets'), emoji: '🎟️' },
    { id: 'plan', label: t('תוכנית', 'Plan'), emoji: '📅' },
    { id: 'settings', label: t('הגדרות', 'Settings'), emoji: '⚙️' },
  ];
  const panels: Record<Tab, ReactNode> = {
    overview: <Overview />,
    requests: <Requests />,
    rewards: <Rewards />,
    tickets: <Tickets />,
    plan: <WeeklyPlan forParent />,
    settings: <ParentSettings />,
  };

  return (
    <div className="page parent">
      <div className="parent-top">
        <PageHeader emoji="👪" title={t('לוח ההורים', 'Parent dashboard')} sub={<ParentSub />} />
        <Button
          variant="ghost"
          onClick={() => {
            actions.lockParent();
            navigate('');
          }}
        >
          🔒 {t('נעילה ויציאה', 'Lock and exit')}
        </Button>
      </div>
      <div className="week-tabs" role="tablist" aria-label={t('לשוניות לוח ההורים', 'Parent dashboard tabs')}>
        {tabs.map((x) => (
          <button key={x.id} type="button" role="tab" id={`tab-${x.id}`} aria-selected={tab === x.id} className={`week-tab ${tab === x.id ? 'on' : ''}`} onClick={() => setTab(x.id)}>
            <span aria-hidden="true">{x.emoji}</span> {x.label}
            {x.badge ? <span className="tab-badge" aria-label={t(`${x.badge} ממתינות`, `${x.badge} waiting`)}>{x.badge}</span> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={`tab-${tab}`} className="parent-panel">
        {panels[tab]}
      </div>
    </div>
  );
}

function ParentSub() {
  const { state, t } = useStore();
  return (
    <>
      {t('הנתונים נשמרים במכשיר הזה בלבד.', 'Data is stored on this device only.')} <En>{state.profile?.name}</En>
    </>
  );
}
