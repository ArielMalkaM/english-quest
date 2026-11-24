import { useEffect, useRef, useState } from 'react';
import { Arrow, Button, Confetti, En, HelpHint } from '../../components/ui';
import { findLesson } from '../../data/curriculum';
import { stepActivities } from '../../domain/dailyPlan';
import { findBadge, gradeOf, isLessonUnlocked } from '../../domain/progress';
import type { AttemptInput, StepOutcome } from '../../domain/session';
import { dailyCap, earnedToday } from '../../domain/tickets';
import { CORE_STEPS } from '../../domain/types';
import type { Activity, ItemResult, StepId } from '../../domain/types';
import { navigate } from '../../lib/router';
import { chime, stopSpeaking } from '../../lib/speech';
import { useStore } from '../../state/store';
import { BridgeGame, BuildGame, MatchGame, SortGame } from '../activities/BuilderGames';
import { SceneGame, SpeakGame, WriteGame } from '../activities/CreateGames';
import { ChoiceGame, ListenGame, SpeedGame, SpellGame } from '../activities/QuizGames';
import { DialogueGame, ReadingGame } from '../activities/StoryGames';
import { REASON_META, STEP_META } from './meta';

function Game({ activity, onDone }: { activity: Activity; onDone: (items: ItemResult[], text?: string) => void }) {
  switch (activity.type) {
    case 'match': return <MatchGame activity={activity} onDone={onDone} />;
    case 'spell': return <SpellGame activity={activity} onDone={onDone} />;
    case 'listen': return <ListenGame activity={activity} onDone={onDone} />;
    case 'choice': return <ChoiceGame activity={activity} onDone={onDone} />;
    case 'bridge': return <BridgeGame activity={activity} onDone={onDone} />;
    case 'sort': return <SortGame activity={activity} onDone={onDone} />;
    case 'reading': return <ReadingGame activity={activity} onDone={onDone} />;
    case 'dialogue': return <DialogueGame activity={activity} onDone={onDone} />;
    case 'build': return <BuildGame activity={activity} onDone={onDone} />;
    case 'write': return <WriteGame activity={activity} onDone={onDone} />;
    case 'scene': return <SceneGame activity={activity} onDone={onDone} />;
    case 'speak': return <SpeakGame activity={activity} onDone={onDone} />;
    case 'speed': return <SpeedGame activity={activity} onDone={onDone} />;
  }
}

export function ActivityRunner({ lessonId, step }: { lessonId: string; step: StepId }) {
  const { state, t, lang, actions } = useStore();
  const found = findLesson(lessonId);
  const open = found !== null && isLessonUnlocked(state.progress, lessonId);
  // Built once: finishing a game changes progress, which must not reshuffle the step.
  const [activities] = useState(() => (open ? stepActivities(lessonId, step, state.progress) : []));
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<'play' | 'tip' | 'result'>('play');
  const [outcome, setOutcome] = useState<StepOutcome | null>(null);
  const attempts = useRef<AttemptInput[]>([]);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (!open || activities.length === 0) navigate('quest');
    return stopSpeaking;
  }, [open, activities.length]);

  if (!found || !open || activities.length === 0) return null;
  const { lesson } = found;
  const activity = activities[index];
  const meta = STEP_META[step];

  const finish = () => {
    const result = actions.completeStep(lessonId, step, attempts.current);
    if (state.settings.sound) chime(result.sessionCompleted ? 'win' : 'right');
    if (result.sessionCompleted) {
      navigate(`done/${lessonId}`);
      return;
    }
    setOutcome(result);
    setStage('result');
  };

  const onGameDone = (items: ItemResult[], text?: string) => {
    stopSpeaking();
    attempts.current.push({
      activityType: activity.type,
      skill: activity.skill,
      seconds: (Date.now() - startedAt.current) / 1000,
      items,
      ...(text ? { text } : {}),
    });
    startedAt.current = Date.now();
    if (index + 1 < activities.length) setIndex(index + 1);
    else if (step === 'learn') setStage('tip');
    else finish();
  };

  const done = state.progress.steps[lessonId] ?? [];
  const nextStep = CORE_STEPS.find((s) => s !== step && !done.includes(s));

  return (
    <div className="runner">
      <header className="runner-bar">
        <button type="button" className="icon-btn" onClick={() => navigate(`quest/${lessonId}`)} aria-label={t('יציאה מהפעילות', 'Leave activity')}>
          <span aria-hidden="true">✕</span>
        </button>
        <div className="runner-title">
          <span className="runner-step">{meta.emoji} {lang === 'he' ? meta.he : meta.en}</span>
          {stage === 'play' && (
            <strong>
              <En>{activity.title}</En>
              {lang === 'he' && <span className="title-he"> · {activity.titleHe}</span>}
            </strong>
          )}
        </div>
        {activities.length > 1 && stage === 'play' && (
          <span className="chip" aria-label={t(`משחק ${index + 1} מתוך ${activities.length}`, `Game ${index + 1} of ${activities.length}`)}>
            {index + 1}/{activities.length}
          </span>
        )}
      </header>

      {stage === 'play' && (
        <main className="runner-main" key={activity.id}>
          <p className="how">
            <En>{activity.how}</En> <HelpHint he={activity.howHe} />
          </p>
          <Game activity={activity} onDone={onGameDone} />
        </main>
      )}

      {stage === 'tip' && (
        <main className="runner-main center">
          <div className="tip-card">
            <div className="big-emoji" aria-hidden="true">💡</div>
            <h2>{t('ניצוץ דקדוק', 'Grammar spark')}</h2>
            <p dir="rtl" lang="he" className="tip-he">{lesson.tip.he}</p>
            <ul className="tip-examples" dir="ltr" lang="en">
              {lesson.tip.examples.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <Button autoFocus onClick={finish}>{t('הבנתי!', 'Got it!')} <Arrow /></Button>
          </div>
        </main>
      )}

      {stage === 'result' && outcome && (
        <main className="runner-main center">
          {outcome.newBadges.length > 0 && <Confetti />}
          <div className="result-card">
            <div className="big-emoji pop" aria-hidden="true">{outcome.practice ? '🌱' : '🎟️'}</div>
            {outcome.practice ? (
              <>
                <h2>{t('תרגול מעולה!', 'Great practice!')}</h2>
                <p>{t('תרגול חוזר מחזק את הזיכרון. כרטיסים מקבלים רק בפעם הראשונה.', 'Practising again makes memory stronger. Tickets are earned the first time only.')}</p>
              </>
            ) : (
              <>
                <h2>{outcome.earned > 0 ? <><span className="num">+{outcome.earned}</span> {t('כרטיסי מסע!', 'Quest Tickets!')}</> : t('כל הכבוד!', 'Well done!')}</h2>
                <ul className="breakdown">
                  {outcome.breakdown.map((b, i) => (
                    <li key={i}>
                      <span>{lang === 'he' ? REASON_META[b.reason].he : REASON_META[b.reason].en}</span>
                      <b className="num">+{b.amount} 🎟️</b>
                    </li>
                  ))}
                </ul>
                {outcome.earned === 0 && (
                  <p className="soft-note">
                    {earnedToday(state.tickets, new Date()) >= dailyCap(state)
                      ? t('הגעתם למכסת הכרטיסים היומית — מחר אפשר להרוויח שוב. הלמידה ממשיכה להיחשב!', 'You reached today’s ticket limit — more tomorrow. Your learning still counts!')
                      : t('הגעתם למכסת הכרטיסים השבועית — הלמידה ממשיכה להיחשב!', 'You reached this week’s ticket limit — your learning still counts!')}
                  </p>
                )}
              </>
            )}
            {outcome.newBadges.map((id) => {
              const b = findBadge(id, gradeOf(state));
              return b ? (
                <p key={id} className="badge-new">
                  <span aria-hidden="true">{b.emoji}</span> {t('תג חדש:', 'New badge:')} <b>{lang === 'he' ? b.titleHe : b.title}</b>
                </p>
              ) : null;
            })}
            <div className="row-center">
              {nextStep && step !== 'bonus' && (
                <Button autoFocus onClick={() => navigate(`play/${lessonId}/${nextStep}`)}>
                  {t('לשלב הבא', 'Next step')}: {STEP_META[nextStep].emoji} <Arrow />
                </Button>
              )}
              <Button variant={nextStep && step !== 'bonus' ? 'ghost' : 'primary'} onClick={() => navigate(step === 'bonus' ? '' : `quest/${lessonId}`)}>
                {step === 'bonus' ? t('חזרה לאי', 'Back to the island') : t('חזרה למשימה', 'Back to the quest')}
              </Button>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
