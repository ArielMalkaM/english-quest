import { useState } from 'react';
import { Arrow, Button, Confetti, En, PageHeader } from '../../components/ui';
import { findLesson, lessonOrder } from '../../data/curriculum';
import { STEP_MINUTES, stepActivities } from '../../domain/dailyPlan';
import { ZONE_BY_SKILL, computeStreak, findBadge, gradeOf, isLessonComplete, isLessonUnlocked, nextLessonId } from '../../domain/progress';
import { CORE_STEPS } from '../../domain/types';
import type { StepId } from '../../domain/types';
import { navigate } from '../../lib/router';
import { useStore } from '../../state/store';
import { REASON_META, STEP_META, TYPE_META, ZONES } from './meta';

function AllDone() {
  const { t } = useStore();
  return (
    <div className="page center">
      <div className="big-emoji" aria-hidden="true">🏝️</div>
      <h1>{t('האי כולו משוחזר!', 'The whole island is restored!')}</h1>
      <p>{t('סיימתם את כל המשימות. אפשר לחזור לכל משימה לתרגול מתוך תוכנית השבוע.', 'You finished every quest. You can replay any quest for practice from the weekly plan.')}</p>
      <Button onClick={() => navigate('week')}>{t('לתוכנית השבועית', 'Open the weekly plan')}</Button>
    </div>
  );
}

export function TodayQuest({ lessonId }: { lessonId?: string }) {
  const { state, t, lang } = useStore();
  const grade = gradeOf(state);
  const LESSON_ORDER = lessonOrder(grade);
  const id = lessonId ?? nextLessonId(state.progress, grade) ?? LESSON_ORDER[LESSON_ORDER.length - 1];
  const found = findLesson(id);
  if (!lessonId && nextLessonId(state.progress, grade) === null) return <AllDone />;
  if (!found) return <AllDone />;
  const { week, lesson, index } = found;

  if (!isLessonUnlocked(state.progress, id)) {
    return (
      <div className="page center">
        <div className="big-emoji" aria-hidden="true">🗝️</div>
        <h1><En>{lesson.title}</En></h1>
        <p>{t('המשימה הזו תיפתח אחרי המשימה שלפניה. אין מה למהר — כל אחד בקצב שלו.', 'This quest opens after the one before it. No rush — everyone goes at their own pace.')}</p>
        <Button onClick={() => navigate('quest')}>{t('למשימה הבאה שלי', 'Go to my next quest')}</Button>
      </div>
    );
  }

  const done = state.progress.steps[id] ?? [];
  const coreDone = CORE_STEPS.filter((s) => done.includes(s)).length;
  const complete = isLessonComplete(state.progress, id);
  const nextStep = CORE_STEPS.find((s) => !done.includes(s));
  const minutesLeft = CORE_STEPS.filter((s) => !done.includes(s)).reduce((sum, s) => sum + STEP_MINUTES[s], 0);
  const steps: StepId[] = [...CORE_STEPS, 'bonus'];
  const upcoming = nextLessonId(state.progress, grade);

  return (
    <div className="page quest-page">
      <div className={`quest-hero ${lesson.boss ? 'boss' : ''}`}>
        <span className="chip chip-light">{week.emoji} {t(`שבוע ${week.number}`, `Week ${week.number}`)} · <En>{week.theme}</En></span>
        <h1><En>{lesson.title}</En></h1>
        {lang === 'he' && <p className="hero-he">{lesson.titleHe}</p>}
        <div className="hero-meta">
          <span>⏱️ {complete ? t('הושלם', 'Complete') : t(`נשארו בערך ${minutesLeft} דקות`, `About ${minutesLeft} minutes left`)}</span>
          <span>🎯 {t(`יעד יומי: ${state.profile?.dailyGoalMinutes ?? 15} דק׳`, `Daily goal: ${state.profile?.dailyGoalMinutes ?? 15} min`)}</span>
        </div>
        <div className="hero-progress" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={coreDone} aria-label={t('התקדמות במשימה', 'Quest progress')}>
          {CORE_STEPS.map((s) => (
            <i key={s} className={done.includes(s) ? 'done' : ''} />
          ))}
        </div>
        {!complete && coreDone >= 3 && <p className="nearly">🌟 {t('כמעט סיימתם — נשאר רק שלב אחד!', 'You are nearly done — just one step left!')}</p>}
        {!complete && coreDone === 2 && <p className="nearly">💪 {t('חצי דרך! ממשיכים?', 'Halfway there! Keep going?')}</p>}
      </div>

      <ol className="step-list">
        {steps.map((step) => {
          const meta = STEP_META[step];
          const isDone = done.includes(step);
          const isNext = step === nextStep;
          const preview = step === 'warmup' ? null : stepActivities(id, step, state.progress)[0];
          const type = step === 'warmup' ? { emoji: '🃏', en: 'Word games + comeback words', he: 'משחקי מילים ומילים חוזרות' } : preview ? TYPE_META[preview.type] : null;
          const zone = step === 'bonus' ? ZONES.sky : step === 'warmup' ? ZONES.woods : preview ? ZONES[ZONE_BY_SKILL[preview.skill]] : ZONES.woods;
          return (
            <li key={step}>
              <button
                type="button"
                className={`step-card ${isDone ? 'done' : ''} ${isNext ? 'next' : ''} ${step === 'bonus' ? 'bonus' : ''}`}
                onClick={() => navigate(`play/${id}/${step}`)}
                aria-label={`${lang === 'he' ? meta.he : meta.en}${isDone ? ` – ${t('הושלם, אפשר לתרגל שוב', 'done, tap to practise again')}` : ''}`}
              >
                <span className="step-emoji" aria-hidden="true">{isDone ? '✅' : meta.emoji}</span>
                <span className="step-text">
                  <b>{lang === 'he' ? meta.he : meta.en}{step === 'bonus' && <span className="optional"> · {t('רשות', 'optional')}</span>}</b>
                  {type && <span>{type.emoji} {lang === 'he' ? type.he : type.en}</span>}
                  <span className="step-zone">{zone.emoji} {lang === 'he' ? zone.he : zone.en}</span>
                </span>
                <span className="step-side">
                  <span>{STEP_MINUTES[step]} {t('דק׳', 'min')}</span>
                  <span className="step-go" aria-hidden="true">{isDone ? '↻' : isNext ? '▶' : '›'}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {nextStep && (
        <div className="sticky-cta">
          <Button onClick={() => navigate(`play/${id}/${nextStep}`)}>
            {coreDone === 0 ? t('מתחילים!', 'Start the quest!') : t('ממשיכים', 'Continue')} {STEP_MINUTES[nextStep] ? '▶' : ''}
          </Button>
        </div>
      )}

      {complete && (
        <div className="card soft">
          <h2>🎉 {t('המשימה הזו הושלמה', 'This quest is complete')}</h2>
          <p>{t('אפשר לתרגל שוב כל שלב (בלי כרטיסים), או להמשיך הלאה.', 'You can practise any step again (no tickets), or move on.')}</p>
          <div className="row-center">
            <Button variant="secondary" onClick={() => navigate(`done/${id}`)}>{t('סיכום המשימה', 'Quest recap')}</Button>
            {upcoming && upcoming !== id && (
              <Button onClick={() => navigate(`quest/${upcoming}`)}>{t('רוצים עוד? למשימה הבאה', 'Want more? Next quest')} <Arrow /></Button>
            )}
          </div>
        </div>
      )}
      <p className="soft-note center">{t(`משימה ${index + 1} מתוך 5 השבוע · ${lang === 'he' ? week.themeHe : week.theme}`, `Quest ${index + 1} of 5 this week · ${week.theme}`)}</p>
    </div>
  );
}

export function SessionDone({ lessonId }: { lessonId: string }) {
  const { state, t, lang, lastOutcome } = useStore();
  const [showNext, setShowNext] = useState(false);
  const found = findLesson(lessonId);
  if (!found || !isLessonComplete(state.progress, lessonId)) {
    return (
      <div className="page center">
        <Button onClick={() => navigate('quest')}>{t('למשימה שלי', 'Go to my quest')}</Button>
      </div>
    );
  }
  const { week, lesson } = found;
  const txs = state.tickets.filter((x) => x.lessonId === lessonId && x.amount > 0);
  const earned = txs.reduce((sum, x) => sum + x.amount, 0);
  const fresh = lastOutcome?.lessonId === lessonId && lastOutcome.sessionCompleted ? lastOutcome : null;
  const streak = computeStreak(state.progress.sessions, new Date());
  const LESSON_ORDER = lessonOrder(gradeOf(state));
  const nextId = LESSON_ORDER[LESSON_ORDER.indexOf(lessonId) + 1];
  const next = nextId ? findLesson(nextId) : null;
  const bonusDone = (state.progress.steps[lessonId] ?? []).includes('bonus');
  const byReason = new Map<string, number>();
  for (const x of txs) byReason.set(x.reason, (byReason.get(x.reason) ?? 0) + x.amount);

  return (
    <div className="page done-page">
      {fresh && <Confetti />}
      <div className="done-hero">
        <div className="big-emoji pop" aria-hidden="true">{lesson.boss ? '🏆' : '🎉'}</div>
        <PageHeader
          title={lesson.boss ? t('ניצחתם את משימת הבוס!', 'Boss Mission complete!') : t('המשימה הושלמה!', 'Quest complete!')}
          sub={<>{t('כל הכבוד,', 'Well done,')} <bdi>{state.profile?.name}</bdi>! {t('חלק נוסף של האי חזר לחיים.', 'Another part of the island came back to life.')}</>}
        />
        <div className="ticket-burst" aria-label={t(`הרווחתם ${earned} כרטיסים`, `You earned ${earned} tickets`)}>
          <span className="ticket-fly" aria-hidden="true">🎟️</span>
          <b className="num">+{earned}</b>
          <span>{t('כרטיסי מסע', 'Quest Tickets')}</span>
        </div>
        <ul className="breakdown">
          {[...byReason.entries()].map(([reason, amount]) => (
            <li key={reason}>
              <span>{lang === 'he' ? REASON_META[reason as keyof typeof REASON_META].he : REASON_META[reason as keyof typeof REASON_META].en}</span>
              <b className="num">+{amount} 🎟️</b>
            </li>
          ))}
        </ul>
        {streak >= 2 && <p className="chip chip-fire">🔥 {t(`${streak} ימים ברצף`, `${streak} days in a row`)}</p>}
      </div>

      <div className="card">
        <h2>🧠 {t('היום למדתם…', 'You learned…')}</h2>
        <ul className="recap" dir="ltr" lang="en">
          {lesson.recap.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        {fresh?.newBadges.map((bid) => {
          const b = findBadge(bid, gradeOf(state));
          return b ? (
            <p key={bid} className="badge-new">
              <span aria-hidden="true">{b.emoji}</span> {t('תג חדש:', 'New badge:')} <b>{lang === 'he' ? b.titleHe : b.title}</b>
            </p>
          ) : null;
        })}
        {lesson.boss && (
          <p className="badge-new">
            <span aria-hidden="true">{week.friend.emoji}</span> {t(`${week.friend.name} הצטרף/ה לאי שלכם!`, `${week.friend.name} joined your island!`)}
          </p>
        )}
      </div>

      {next && (
        <div className="card soft">
          <button type="button" className="preview-toggle" aria-expanded={showNext} onClick={() => setShowNext((s) => !s)}>
            🔮 {t('הצצה למשימה הבאה', 'Peek at the next mission')} <span aria-hidden="true">{showNext ? '▲' : '▼'}</span>
          </button>
          {showNext && (
            <div className="preview-body">
              <b><En>{next.lesson.title}</En></b>
              {lang === 'he' && <span> · {next.lesson.titleHe}</span>}
              <p>
                {next.week.emoji} <En>{next.week.theme}</En> · {TYPE_META[next.lesson.learn.type].emoji} {TYPE_META[next.lesson.mission.type].emoji} {TYPE_META[next.lesson.create.type].emoji}
              </p>
              <p className="soft-note">{t('היא תחכה לכם מחר — או מתי שתרצו.', 'It will be waiting for you tomorrow — or whenever you like.')}</p>
            </div>
          )}
        </div>
      )}

      <div className="row-center">
        {!bonusDone && (
          <Button variant="secondary" onClick={() => navigate(`play/${lessonId}/bonus`)}>🎈 {t('משימת בונוס (רשות)', 'Bonus mission (optional)')}</Button>
        )}
        <Button onClick={() => navigate('')}>🏝️ {t('לראות את האי', 'See the island')}</Button>
      </div>
    </div>
  );
}
