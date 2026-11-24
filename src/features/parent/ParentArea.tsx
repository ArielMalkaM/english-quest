import { useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AVATAR_COLORS, AVATAR_EMOJI, AVATAR_GEAR, AvatarPicker } from '../../components/AvatarPicker';
import { GradePicker, gradeLabel } from '../../components/GradePicker';
import { Arrow, Avatar, Button, PageHeader } from '../../components/ui';
import { GRADE_INFO, GRAMMAR, findWord, lessonOrder } from '../../data/curriculum';
import { DEMO_CHILD_CODE, DEMO_PIN } from '../../data/seed';
import { buildAiReport } from '../../domain/aiReport';
import { findChild } from '../../domain/household';
import { isValidPin } from '../../domain/parentAuth';
import { gradeOf, isLessonComplete, weeklySummary } from '../../domain/progress';
import { DAILY_TICKET_CAP, balance, dailyCap, earnedThisWeek, earnedToday } from '../../domain/tickets';
import type { ChildRecord, Grade, Lang, LearnerProfile, Reward } from '../../domain/types';
import { navigate } from '../../lib/router';
import { accountsEnabled } from '../../lib/supabase';
import { useAccount } from '../../state/account';
import { FamilyAccount } from '../account/FamilyAccount';
import { ChildScope, useStore } from '../../state/store';
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

  const grade = gradeOf(state);
  const order = lessonOrder(grade);
  const planDone = order.filter((id) => isLessonComplete(state.progress, id)).length;

  return (
    <>
      <div className="notice">
        <span aria-hidden="true">🌟</span>
        <p>{message}</p>
      </div>
      <div className="notice notice-plan">
        <span aria-hidden="true">📘</span>
        <p>
          <b>{gradeLabel(grade, lang)} · {lang === 'he' ? GRADE_INFO[grade].stageHe : GRADE_INFO[grade].stage}</b>
          <br />
          {lang === 'he' ? GRADE_INFO[grade].focusHe : GRADE_INFO[grade].focus}
          <br />
          {t(`התקדמות בתוכנית: ${planDone} מתוך ${order.length} משימות.`, `Plan progress: ${planDone} of ${order.length} quests.`)}
        </p>
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
        <div className="stat"><b>{earnedToday(state.tickets, now)} / {dailyCap(state)}</b><span>{t('הורווחו היום', 'earned today')}</span></div>
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
        <p className="soft-note">{t(`עד ${DAILY_TICKET_CAP} כרטיסים ביום בכל כיתה (כפול המכפיל). בכיתות ב׳–ד׳ המסעות קצרים יותר ולכן כל מסע שווה פחות.`, `Up to ${DAILY_TICKET_CAP} tickets a day in every grade (times the multiplier). Grades 2–4 have shorter quests, so each quest is worth less.`)}</p>
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

// ───────────────────────── Children: add, edit (grade, code…), remove ─────────────────────────

type CodeMode = 'keep' | 'none' | 'set';

function ChildForm({ initial, onDone }: { initial?: ChildRecord; onDone: () => void }) {
  const { household, t, lang, actions } = useStore();
  const n = household.children.length;
  const [name, setName] = useState(initial?.profile.name ?? '');
  const [grade, setGrade] = useState<Grade>(initial?.profile.grade ?? 4);
  const [avatar, setAvatar] = useState<LearnerProfile['avatar']>(
    initial?.profile.avatar ?? { emoji: AVATAR_EMOJI[(n * 5 + 2) % AVATAR_EMOJI.length], color: AVATAR_COLORS[(n + 1) % AVATAR_COLORS.length], gear: AVATAR_GEAR[n % AVATAR_GEAR.length] },
  );
  const [goal, setGoal] = useState<10 | 15 | 20>(initial?.profile.dailyGoalMinutes ?? 15);
  const [codeMode, setCodeMode] = useState<CodeMode>(initial ? 'keep' : 'none');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const hadCode = initial?.codeHash != null;
  const formId = initial?.id ?? 'new';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t('צריך כינוי.', 'A nickname is needed.'));
    if (codeMode === 'set' && !isValidPin(code)) return setError(t('הקוד חייב להיות 4 ספרות.', 'The code must be 4 digits.'));
    try {
      if (initial) {
        actions.updateChild(initial.id, {
          profile: { name: name.trim(), grade, avatar, dailyGoalMinutes: goal },
          ...(codeMode === 'keep' ? {} : { code: codeMode === 'set' ? code : null }),
        });
      } else {
        actions.addChild(
          { name: name.trim(), grade, avatar, favoriteTheme: 'Animals', dailyGoalMinutes: goal, createdAt: new Date().toISOString() },
          codeMode === 'set' ? code : null,
        );
      }
      onDone();
    } catch {
      setError(t('לא הצלחנו לשמור. בדקו את הפרטים ונסו שוב.', 'Could not save. Check the details and try again.'));
    }
  };

  const codeOptions: { id: CodeMode; label: string }[] = initial
    ? [
        ...(hadCode ? [{ id: 'keep' as const, label: t('להשאיר את הקוד הנוכחי', 'Keep the current code') }] : [{ id: 'keep' as const, label: t('בלי קוד (כמו עכשיו)', 'No code (as now)') }]),
        ...(hadCode ? [{ id: 'none' as const, label: t('להסיר את הקוד', 'Remove the code') }] : []),
        { id: 'set', label: hadCode ? t('לקבוע קוד חדש', 'Set a new code') : t('לקבוע קוד', 'Set a code') },
      ]
    : [
        { id: 'none', label: t('בלי קוד', 'No code') },
        { id: 'set', label: t('לקבוע קוד', 'Set a code') },
      ];

  return (
    <form className="child-form" onSubmit={submit}>
      <label htmlFor={`cn-${formId}`} className="field-label">{t('כינוי', 'Nickname')}</label>
      <input id={`cn-${formId}`} className="text-input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      <GradePicker value={grade} onChange={setGrade} legend={t('כיתה (קובעת את תוכנית הלימוד)', 'Grade (sets the learning plan)')} />
      {initial && grade !== initial.profile.grade && (
        <p className="notice">
          <span aria-hidden="true">ℹ️</span>
          <span>{t(`מעבר ל${gradeLabel(grade, lang)} פותח את התוכנית של הכיתה הזו מההתחלה. הכרטיסים, המילים, התגים וההתקדמות בתוכנית הקודמת נשמרים, וחוזרים אם תחזירו את הכיתה.`, `Moving to ${gradeLabel(grade, lang)} opens that grade's plan from its start. Tickets, words, badges and progress in the current plan are kept, and come back if you switch back.`)}</span>
        </p>
      )}
      <AvatarPicker value={avatar} onChange={setAvatar} />
      <fieldset className="pick-group">
        <legend>{t('יעד יומי', 'Daily goal')}</legend>
        <div className="pick-row">
          {([10, 15, 20] as const).map((m) => (
            <button key={m} type="button" className={`pick wide ${goal === m ? 'on' : ''}`} aria-pressed={goal === m} onClick={() => setGoal(m)}>
              {m} {t('דק׳', 'min')}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="pick-group">
        <legend>🔒 {t('קוד כניסה לילד/ה (4 ספרות)', 'Child sign-in code (4 digits)')}</legend>
        <p className="soft-note">{t('כשכמה ילדים משתמשים באותו מכשיר, קוד אישי שומר שכל אחד ייכנס רק לפרופיל שלו.', 'When several children share this device, a personal code keeps each child in their own profile.')}</p>
        <div className="pick-row">
          {codeOptions.map((o) => (
            <button key={o.id} type="button" className={`pick wide ${codeMode === o.id ? 'on' : ''}`} aria-pressed={codeMode === o.id} onClick={() => setCodeMode(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
        {codeMode === 'set' && (
          <>
            <label htmlFor={`cc-${formId}`} className="field-label">{t('קוד חדש', 'New code')}</label>
            <input id={`cc-${formId}`} className="text-input pin" dir="ltr" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </>
        )}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="row-center">
        <Button variant="ghost" onClick={onDone}>{t('ביטול', 'Cancel')}</Button>
        <Button type="submit">{initial ? t('שמירה', 'Save') : t('הוספת ילד/ה', 'Add child')}</Button>
      </div>
    </form>
  );
}

function Children({ onManage }: { onManage: (id: string) => void }) {
  const { household, activeChildId, t, lang, actions } = useStore();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const only = household.children.length <= 1;

  return (
    <>
      <section className="card">
        <h2>👪 {t('הילדים במכשיר הזה', 'Children on this device')}</h2>
        <ul className="list">
          {household.children.map((c) => {
            const order = lessonOrder(c.profile.grade);
            const done = order.filter((id) => isLessonComplete(c.progress, id)).length;
            if (editing === c.id) {
              return (
                <li key={c.id} className="list-row block">
                  <ChildForm initial={c} onDone={() => setEditing(null)} />
                </li>
              );
            }
            return (
              <li key={c.id} className="list-row tall">
                <Avatar size={44} avatar={c.profile.avatar} />
                <span className="list-main">
                  <b><bdi>{c.profile.name}</bdi>{c.id === activeChildId ? ` · ${t('משחק/ת עכשיו', 'playing now')}` : ''}</b>
                  <small>
                    {gradeLabel(c.profile.grade, lang)} · {done}/{order.length} {t('משימות', 'quests')} · 🎟️ {balance(c.tickets)} · {c.codeHash ? `🔒 ${t('עם קוד', 'code set')}` : t('בלי קוד', 'no code')}
                  </small>
                  <small>{lang === 'he' ? GRADE_INFO[c.profile.grade].stageHe : GRADE_INFO[c.profile.grade].stage}</small>
                </span>
                <span className="row-actions">
                  {removing === c.id ? (
                    <>
                      <span className="soft-note">{t('כל ההתקדמות של הילד/ה תימחק לצמיתות.', 'All of this child’s progress will be deleted permanently.')}</span>
                      <Button variant="ghost" onClick={() => setRemoving(null)}>{t('ביטול', 'Cancel')}</Button>
                      <Button variant="coral" onClick={() => { actions.removeChild(c.id); setRemoving(null); }}>{t('כן, להסיר', 'Yes, remove')}</Button>
                    </>
                  ) : (
                    <>
                      <Button variant="secondary" onClick={() => onManage(c.id)}>📊 {t('לוח', 'Dashboard')}</Button>
                      <Button variant="ghost" onClick={() => setEditing(c.id)}>{t('עריכה', 'Edit')}</Button>
                      {!only && <Button variant="ghost" onClick={() => setRemoving(c.id)}>{t('הסרה', 'Remove')}</Button>}
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="card">
        <h2>➕ {t('הוספת ילד/ה', 'Add a child')}</h2>
        {editing === 'new' ? (
          <ChildForm onDone={() => setEditing(null)} />
        ) : (
          <>
            <p className="soft-note">{t('לכל ילד/ה התקדמות, כרטיסים, משאלות ותוכנית לפי הכיתה — הכול נפרד. הפרסים בלוח המשאלות משותפים.', 'Each child gets their own progress, tickets, wishes and grade plan. The rewards on the Wish Board are shared.')}</p>
            <Button onClick={() => setEditing('new')}>➕ {t('ילד/ה חדש/ה', 'New child')}</Button>
          </>
        )}
      </section>
    </>
  );
}

// ───────────────────────── AI report ─────────────────────────

function AiReport() {
  const { state, t, lang } = useStore();
  const [includeName, setIncludeName] = useState(false);
  const [answerLang, setAnswerLang] = useState<Lang>(lang);
  const [status, setStatus] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const text = buildAiReport(state, { includeName, answerLang, now: new Date() });
  const name = state.profile?.name ?? '';
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(t('הדוח הועתק. עכשיו אפשר להדביק אותו בצ׳אט עם עוזר AI.', 'Report copied. Now paste it into a chat with an AI assistant.'));
    } catch {
      area.current?.select();
      setStatus(t('הדוח מסומן — הקישו Ctrl+C כדי להעתיק.', 'The report is selected — press Ctrl+C to copy.'));
    }
  };
  const download = () => {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `english-quest-report-grade${state.profile?.grade ?? ''}-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const share = async () => {
    try {
      await navigator.share({ title: t('דוח אנגלית', 'English learning report'), text });
    } catch {
      // cancelled or not supported
    }
  };

  return (
    <>
      <section className="card">
        <h2>🤖 {t('דוח לבינה מלאכותית', 'Report for an AI assistant')} · <bdi>{name}</bdi></h2>
        <p>{t('הדוח מסכם את ההתקדמות, הדיוק לפי מיומנות ודקדוק, מילים לחיזוק ודוגמאות כתיבה, יחד עם בקשה מוכנה. העתיקו או שתפו אותו לעוזר AI (למשל Claude) כדי לקבל המלצות על מה כדאי להתמקד.', 'The report sums up progress, accuracy by skill and grammar, words to strengthen and writing samples, with a ready-made request. Copy or share it to an AI assistant (for example Claude) to get advice on what to focus on.')}</p>
        <label className="toggle">
          <input type="checkbox" checked={includeName} onChange={(e) => setIncludeName(e.target.checked)} />
          <span>{t('לכלול את הכינוי של הילד/ה (ברירת המחדל: "my child")', 'Include the child’s nickname (default: “my child”)')}</span>
        </label>
        <fieldset className="pick-group">
          <legend>{t('באיזו שפה לבקש את התשובה?', 'Language for the answer')}</legend>
          <div className="pick-row">
            <button type="button" className={`pick wide ${answerLang === 'he' ? 'on' : ''}`} aria-pressed={answerLang === 'he'} onClick={() => setAnswerLang('he')}>עברית</button>
            <button type="button" className={`pick wide ${answerLang === 'en' ? 'on' : ''}`} aria-pressed={answerLang === 'en'} onClick={() => setAnswerLang('en')}>English</button>
          </div>
        </fieldset>
        <div className="row-center">
          <Button onClick={copy}>📋 {t('העתקה', 'Copy')}</Button>
          {canShare && <Button variant="secondary" onClick={share}>📤 {t('שיתוף', 'Share')}</Button>}
          <Button variant="ghost" onClick={download}>⬇️ {t('הורדה (.md)', 'Download (.md)')}</Button>
        </div>
        {status && <p className="soft-note" role="status">{status}</p>}
        <p className="soft-note">🔒 {t('הדוח נוצר במכשיר ולא נשלח לשום מקום עד שתבחרו להעתיק או לשתף. אין בו פרטי קשר — עברו עליו לפני השיתוף.', 'The report is made on this device and goes nowhere until you copy or share it. It has no contact details — read it before you share.')}</p>
      </section>
      <section className="card">
        <h2>👀 {t('תצוגה מקדימה', 'Preview')}</h2>
        <textarea ref={area} className="text-input report-text" dir="ltr" lang="en" readOnly value={text} rows={18} aria-label={t('תוכן הדוח', 'Report text')} />
      </section>
    </>
  );
}

function ParentSettings() {
  const { state, household, t, actions } = useStore();
  const { status: accountStatus, familyId } = useAccount();
  const signedIn = accountStatus === 'signed-in';
  const synced = signedIn && household.sync?.familyId === familyId;
  const [pin, setPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState<'all' | 'demo' | null>(null);
  if (!state.profile) return null;

  return (
    <>
      <section className="card">
        <h2>🌐 {t('שפה ונגישות', 'Language and accessibility')} · <bdi>{state.profile.name}</bdi></h2>
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
        <p className="soft-note">
          {synced
            ? t('המכשיר מחובר לחשבון המשפחתי: איפוס מוחק רק את העותק במכשיר הזה, והנתונים יורדו שוב מהחשבון.', 'This device is connected to the family account: resetting clears only this device’s copy, and the data downloads again from the account.')
            : t('כל המידע נשמר רק בדפדפן הזה. איפוס מוחק אותו לצמיתות.', 'All data lives only in this browser. Resetting deletes it permanently.')}
        </p>
        {confirmReset === null ? (
          <div className="row-center">
            {!signedIn && <Button variant="ghost" onClick={() => setConfirmReset('demo')}>{t('טעינת נתוני הדגמה', 'Load demo data')}</Button>}
            <Button variant="coral" onClick={() => setConfirmReset('all')}>{synced ? t('איפוס המכשיר הזה', 'Reset this device') : t('איפוס מלא', 'Reset everything')}</Button>
          </div>
        ) : (
          <div className="feedback feedback-clue" role="alertdialog" aria-label={t('אישור איפוס', 'Confirm reset')}>
            <strong>
              {confirmReset === 'all'
                ? synced
                  ? t('למחוק את העותק במכשיר הזה ולהוריד מחדש מהחשבון?', 'Clear this device’s copy and download it again from the account?')
                  : t('למחוק את כל הילדים, ההתקדמות, הכרטיסים והקוד ולהתחיל מחדש?', 'Delete every child, all progress, tickets and the PIN, and start again?')
                : t(`להחליף את כל הנתונים (של כל הילדים) בנתוני הדגמה? (קוד הורים: ${DEMO_PIN}, הקוד של Maya: ${DEMO_CHILD_CODE})`, `Replace everything (for every child) with demo data? (Parent PIN: ${DEMO_PIN}, Maya’s code: ${DEMO_CHILD_CODE})`)}
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

type Tab = 'overview' | 'requests' | 'rewards' | 'tickets' | 'plan' | 'report' | 'children' | 'account' | 'settings';

export function ParentArea() {
  const { household, activeChildId, t, lang, parentUnlocked, actions } = useStore();
  const [tab, setTab] = useState<Tab>('overview');
  const [managedId, setManagedId] = useState<string | null>(activeChildId);
  if (!parentUnlocked) return <PinGate />;
  const child = findChild(household, managedId) ?? household.children[0];
  if (!child) return null;
  const pending = child.requests.filter((r) => r.status === 'pending').length;
  const tabs: { id: Tab; label: string; emoji: string; badge?: number }[] = [
    { id: 'overview', label: t('סיכום', 'Overview'), emoji: '📊' },
    { id: 'requests', label: t('בקשות', 'Requests'), emoji: '💌', badge: pending },
    { id: 'rewards', label: t('פרסים', 'Rewards'), emoji: '🌠' },
    { id: 'tickets', label: t('כרטיסים', 'Tickets'), emoji: '🎟️' },
    { id: 'plan', label: t('תוכנית', 'Plan'), emoji: '📅' },
    { id: 'report', label: t('דוח AI', 'AI report'), emoji: '🤖' },
    { id: 'children', label: t('ילדים', 'Children'), emoji: '👪' },
    ...(accountsEnabled ? [{ id: 'account' as const, label: t('חשבון', 'Account'), emoji: '☁️' }] : []),
    { id: 'settings', label: t('הגדרות', 'Settings'), emoji: '⚙️' },
  ];
  const panels: Record<Tab, ReactNode> = {
    overview: <Overview />,
    requests: <Requests />,
    rewards: <Rewards />,
    tickets: <Tickets />,
    plan: <WeeklyPlan forParent />,
    report: <AiReport />,
    children: (
      <Children
        onManage={(id) => {
          setManagedId(id);
          setTab('overview');
        }}
      />
    ),
    account: <FamilyAccount />,
    settings: <ParentSettings />,
  };

  return (
    <div className="page parent">
      <div className="parent-top">
        <PageHeader emoji="👪" title={t('לוח ההורים', 'Parent dashboard')} sub={t('הנתונים נשמרים במכשיר הזה בלבד.', 'Data is stored on this device only.')} />
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
      <div className="child-switch" role="group" aria-label={t('בחירת ילד/ה', 'Choose a child')}>
        {household.children.map((c) => {
          const waiting = c.requests.filter((r) => r.status === 'pending').length;
          return (
            <button key={c.id} type="button" className={`child-chip ${c.id === child.id ? 'on' : ''}`} aria-pressed={c.id === child.id} onClick={() => setManagedId(c.id)}>
              <Avatar size={30} avatar={c.profile.avatar} />
              <span>
                <b><bdi>{c.profile.name}</bdi></b>
                <small>{gradeLabel(c.profile.grade, lang)}</small>
              </span>
              {waiting > 0 && <span className="tab-badge" aria-label={t(`${waiting} משאלות ממתינות`, `${waiting} wishes waiting`)}>{waiting}</span>}
            </button>
          );
        })}
        <button type="button" className="child-chip add" onClick={() => setTab('children')}>
          <span aria-hidden="true">➕</span> {t('ילד/ה', 'Child')}
        </button>
      </div>
      <div className="week-tabs" role="tablist" aria-label={t('לשוניות לוח ההורים', 'Parent dashboard tabs')}>
        {tabs.map((x) => (
          <button key={x.id} type="button" role="tab" id={`tab-${x.id}`} aria-selected={tab === x.id} className={`week-tab ${tab === x.id ? 'on' : ''}`} onClick={() => setTab(x.id)}>
            <span aria-hidden="true">{x.emoji}</span> {x.label}
            {x.badge ? <span className="tab-badge" aria-label={t(`${x.badge} ממתינות`, `${x.badge} waiting`)}>{x.badge}</span> : null}
          </button>
        ))}
      </div>
      <ChildScope key={child.id} childId={child.id}>
        <div role="tabpanel" aria-labelledby={`tab-${tab}`} className="parent-panel">
          {panels[tab]}
        </div>
      </ChildScope>
    </div>
  );
}
