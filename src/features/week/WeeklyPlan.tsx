import { useState } from 'react';
import { Button, En, PageHeader } from '../../components/ui';
import { DAY_LABELS, GRAMMAR, WEEKS, findLesson, findWord } from '../../data/curriculum';
import { buildBonus } from '../../domain/dailyPlan';
import { isLessonComplete, isLessonUnlocked, nextLessonId, weeklySummary } from '../../domain/progress';
import { navigate } from '../../lib/router';
import { useStore } from '../../state/store';
import { SKILL_META, TYPE_META } from '../quest/meta';

const WARMUP_TYPES = ['match', 'listen', 'spell', 'match', 'listen'] as const;

export function WeeklyPlan({ forParent = false }: { forParent?: boolean }) {
  const { state, t, lang } = useStore();
  const { progress } = state;
  const nextId = nextLessonId(progress);
  const currentWeek = nextId ? (findLesson(nextId)?.week.number ?? 1) : WEEKS.length;
  const [number, setNumber] = useState(currentWeek);
  const week = WEEKS[number - 1];
  const summary = weeklySummary(state, new Date());
  const doneCount = week.lessons.filter((l) => isLessonComplete(progress, l.id)).length;
  const nextWeek = WEEKS[number];
  const L = <T extends { en: string; he: string }>(x: T) => (lang === 'he' ? x.he : x.en);

  return (
    <div className={forParent ? '' : 'page'}>
      {!forParent && <PageHeader emoji="📅" title={t('התוכנית השבועית', 'Weekly plan')} sub={t('נושא אחד מחבר את כל הפעילויות בשבוע.', 'One theme connects every activity in the week.')} />}

      <div className="week-tabs" role="tablist" aria-label={t('בחירת שבוע', 'Choose a week')}>
        {WEEKS.map((w) => (
          <button key={w.id} type="button" role="tab" aria-selected={w.number === number} className={`week-tab ${w.number === number ? 'on' : ''} ${w.number === currentWeek ? 'current' : ''}`} onClick={() => setNumber(w.number)}>
            <span aria-hidden="true">{w.emoji}</span> {w.number}
          </button>
        ))}
      </div>

      <section className="week-hero">
        <span className="big-emoji" aria-hidden="true">{week.emoji}</span>
        <div>
          <small>{t(`שבוע ${week.number}`, `Week ${week.number}`)} · {doneCount}/5 {t('משימות', 'quests')}</small>
          <h2><En>{week.theme}</En></h2>
          {lang === 'he' && <p>{week.themeHe}</p>}
          <p className="week-focus">🧪 {lang === 'he' ? week.grammarFocusHe : week.grammarFocus}</p>
          <p className="week-focus">👑 {lang === 'he' ? week.finalMissionHe : week.finalMission}</p>
        </div>
      </section>

      <ol className="day-grid">
        {week.lessons.map((lesson, i) => {
          const complete = isLessonComplete(progress, lesson.id);
          const unlocked = isLessonUnlocked(progress, lesson.id);
          const current = lesson.id === nextId;
          const steps = progress.steps[lesson.id] ?? [];
          const cells = [
            { label: t('חימום', 'Warm-up'), type: TYPE_META[WARMUP_TYPES[i]], done: steps.includes('warmup') },
            { label: t('לומדים', 'Learn'), type: TYPE_META[lesson.learn.type], done: steps.includes('learn'), extra: lesson.learn.grammar ? L(GRAMMAR[lesson.learn.grammar]) : undefined },
            { label: t('אתגר', 'Mission'), type: TYPE_META[lesson.mission.type], done: steps.includes('mission'), extra: lesson.mission.type === 'reading' ? lesson.mission.genre : undefined },
            { label: t('יוצרים', 'Create'), type: TYPE_META[lesson.create.type], done: steps.includes('create') },
            { label: t('בונוס', 'Bonus'), type: TYPE_META[buildBonus(week, i).type], done: steps.includes('bonus') },
          ];
          return (
            <li key={lesson.id} className={`day-card ${complete ? 'complete' : ''} ${current ? 'current' : ''} ${lesson.boss ? 'boss' : ''}`}>
              <header>
                <span className="day-label">{L(DAY_LABELS[i])}</span>
                <span className="day-status" aria-hidden="true">{complete ? '✅' : current ? '▶' : unlocked ? '' : '🗝️'}</span>
              </header>
              <h3><En>{lesson.title}</En></h3>
              {lang === 'he' && <p className="day-he">{lesson.titleHe}</p>}
              <ul className="day-steps">
                {cells.map((c) => (
                  <li key={c.label} className={c.done ? 'done' : ''}>
                    <span aria-hidden="true">{c.type.emoji}</span>
                    <span>
                      <b>{c.label}:</b> {L(c.type)}
                      {c.extra && <em> · {c.extra}</em>}
                    </span>
                  </li>
                ))}
              </ul>
              {!forParent && unlocked && (
                <Button variant={current ? 'primary' : 'ghost'} onClick={() => navigate(`quest/${lesson.id}`)}>
                  {complete ? t('תרגול חוזר', 'Practise again') : current ? t('למשימה', 'Play') : t('פתיחה', 'Open')}
                </Button>
              )}
              {!unlocked && <p className="soft-note">{t('נפתחת אחרי המשימה הקודמת', 'Opens after the quest before it')}</p>}
            </li>
          );
        })}
      </ol>

      {!forParent && nextId && (
        <div className="card soft catchup">
          <h2>🌈 {t('בקצב שלכם', 'At your own pace')}</h2>
          <p>{t('פספסתם יום? אין דבר כזה "מאחור". המשימה הבאה תמיד מחכה, ואפשר לעשות שתיים ביום אם מתחשק.', 'Missed a day? There is no “behind” here. Your next quest always waits for you, and you can play two in one day if you feel like it.')}</p>
          <Button onClick={() => navigate('quest')}>{t('למשימה הבאה שלי', 'Go to my next quest')} ▶</Button>
        </div>
      )}

      <section className="card">
        <h2>📊 {t('סיכום השבוע הזה', 'This week’s review')}</h2>
        <div className="stat-row">
          <div className="stat"><b>{summary.questsCompleted}</b><span>{t('משימות הושלמו', 'quests completed')}</span></div>
          <div className="stat"><b>{summary.minutes}</b><span>{t('דקות למידה', 'minutes of learning')}</span></div>
          <div className="stat"><b>{summary.ticketsEarned}</b><span>{t('כרטיסים', 'tickets earned')}</span></div>
        </div>
        <h3>💪 {t('החוזקות שלכם', 'Strengths')}</h3>
        <div className="chip-row">
          {summary.strengths.length === 0 && <span className="soft-note">{t('שחקו משימה כדי לגלות!', 'Play a quest to find out!')}</span>}
          {summary.strengths.map((s) => (
            <span key={s} className="chip chip-good">{SKILL_META[s].emoji} {L(SKILL_META[s])}</span>
          ))}
        </div>
        <h3>🌱 {t('מילים ששווה לפגוש שוב', 'Words to meet again')}</h3>
        <div className="chip-row" dir="ltr">
          {summary.wordsToRevisit.length === 0 && <span className="soft-note" dir="auto">{t('אין כרגע — יופי!', 'None right now — lovely!')}</span>}
          {summary.wordsToRevisit.map((id) => {
            const w = findWord(id);
            return w ? <span key={id} className="chip" lang="en">{w.emoji} {w.en}</span> : null;
          })}
        </div>
        <h3>🧪 {t('דקדוק לתרגול נוסף', 'Grammar to practise')}</h3>
        <div className="chip-row">
          {summary.grammarToPractise.length === 0 && <span className="soft-note">{t('הכול מתקדם יפה.', 'Everything is going well.')}</span>}
          {summary.grammarToPractise.map((g) => (
            <span key={g} className="chip">{GRAMMAR[g] ? L(GRAMMAR[g]) : g}</span>
          ))}
        </div>
        {nextWeek && (
          <p className="next-week">
            🔮 {t('בשבוע הבא:', 'Next week:')} <b>{nextWeek.emoji} <En>{nextWeek.theme}</En></b> — {lang === 'he' ? nextWeek.grammarFocusHe : nextWeek.grammarFocus}
          </p>
        )}
      </section>
    </div>
  );
}
