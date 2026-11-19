import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Confetti, En, SpeakButton } from '../../components/ui';
import type { BonusStats } from '../../domain/bonusGame';
import type { GateQuestion } from '../../domain/bonusQuestions';
import { GATE_SECONDS, createQuestionDeck } from '../../domain/bonusQuestions';
import { localDate } from '../../domain/dates';
import { navigate } from '../../lib/router';
import { chime, speak, stopSpeaking } from '../../lib/speech';
import { useStore } from '../../state/store';
import { GateRacer } from './gateRacer';
import type { RacerResult } from './gateRacer';
import { deviceId, openElsewhere, readLedger, releaseLedger, writeLedger } from './ledger';
import type { Entry, RunStart } from './session';
import { BonusRun, clock, planEntry } from './session';
import './bonus.css';

const CHECKPOINT_MS = 10_000;
const LEDGER_MS = 1_000;


/** A tab may claim the game only while it is on screen and not unloading. */
function mayClaim(leaving: { current: boolean }): boolean {
  return !leaving.current && document.visibilityState === 'visible';
}

/** Decides once, when the screen opens, whether today's bonus can be played. */
function useEntry(): [Entry, string, () => void] {
  const { state, childId } = useStore();
  const [date] = useState(() => localDate(new Date()));
  const decide = useCallback((): Entry => {
    if (!childId) return { kind: 'locked' };
    return planEntry(state.progress, date, deviceId(), readLedger(childId, date), openElsewhere(childId, date));
  }, [state.progress, childId, date]);
  const [entry, setEntry] = useState<Entry>(decide);
  return [entry, date, () => setEntry(decide())];
}

export function BonusGame() {
  const { t } = useStore();
  const [entry, date, retry] = useEntry();

  if (entry.kind === 'locked') {
    return (
      <div className="bonus-screen">
        <div className="bonus-card">
          <div className="big-emoji" aria-hidden="true">🔒</div>
          <h1>{t('משחק הבונוס עוד נעול', 'The bonus game is still locked')}</h1>
          <p>{t('סיימו את המשימה של היום כדי לפתוח 5 דקות של משחק בונוס!', 'Finish today’s quest to unlock 5 minutes of bonus game time!')}</p>
          <Button onClick={() => navigate('quest')}>{t('למשימה שלי', 'Go to my quest')}</Button>
        </div>
      </div>
    );
  }
  if (entry.kind === 'busy') {
    return (
      <div className="bonus-screen">
        <div className="bonus-card">
          <div className="big-emoji" aria-hidden="true">🪟</div>
          <h1>{t('המשחק פתוח בחלון אחר', 'The game is open in another window')}</h1>
          <p>{t('אפשר לשחק בו רק בחלון אחד בכל פעם. סגרו את החלון השני ונסו שוב.', 'It can only be played in one window at a time. Close the other window and try again.')}</p>
          <div className="row-center">
            <Button onClick={retry}>{t('לנסות שוב', 'Try again')}</Button>
            <Button variant="ghost" onClick={() => navigate('quest')}>{t('חזרה', 'Back')}</Button>
          </div>
        </div>
      </div>
    );
  }
  if (entry.kind === 'used-up') return <Summary stats={entry.stats} note="already" />;
  return <RaceSession date={date} start={entry.start} tutorial={entry.tutorial} />;
}

type Phase = 'tutorial' | 'intro' | 'playing' | 'paused' | 'summary';

function RaceSession({ date, start, tutorial }: { date: string; start: RunStart; tutorial: boolean }) {
  const { state, actions, t, lang, childId } = useStore();
  const sound = state.settings.sound;
  const reducedMotion = state.settings.reducedMotion;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const racerRef = useRef<GateRacer | null>(null);
  const [run] = useState(() => new BonusRun(start));
  const resumed = start.totalUsed > 0;
  const sinceCheckpoint = useRef(0);
  const sinceLedger = useRef(0);
  /** Set once the page is unloading: from then on this tab never claims the game again. */
  const leavingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>(tutorial ? 'tutorial' : 'intro');
  const phaseRef = useRef(phase);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [leftMs, setLeftMs] = useState(run.leftMs);
  const [stats, setStats] = useState<BonusStats>(run.stats);
  const [question, setQuestion] = useState<GateQuestion | null>(null);
  const [feedback, setFeedback] = useState<RacerResult | null>(null);
  const [expired, setExpired] = useState(false);
  const [deck] = useState(() => createQuestionDeck(state));

  // Latest values for the game loop callbacks (the racer is created once).
  const live = useRef({ actions, childId, sound });
  useLayoutEffect(() => {
    live.current = { actions, childId, sound };
    phaseRef.current = phase;
  });

  const save = useCallback(() => {
    const { actions: a, childId: id } = live.current;
    if (!id) return;
    writeLedger(id, date, run.totalUsed, run.finished, mayClaim(leavingRef));
    if (run.ownUsed <= 0 && !run.finished) return;
    a.bonusCheckpoint(date, run.checkpoint(deviceId()));
    sinceCheckpoint.current = 0;
  }, [date, run]);

  /** Ends the game: the 5 minutes ran out (finish bonus), or its day is over (`expired`, no bonus). */
  const finish = useCallback(
    (expiredNow = false) => {
      if (run.finished) return;
      racerRef.current?.pause();
      run.finish(expiredNow);
      setLeftMs(run.leftMs);
      setStats(run.stats);
      setExpired(expiredNow);
      save();
      stopSpeaking();
      if (live.current.sound && !expiredNow) chime('win');
      setPhase('summary');
    },
    [run, save],
  );

  // Create the racer once the canvas is on screen.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const racer = new GateRacer({
      canvas,
      nextQuestion: () => deck.next(),
      gateSeconds: GATE_SECONDS[deck.grade],
      car: { emoji: state.profile?.avatar.emoji ?? '🧒', color: state.profile?.avatar.color ?? '#2ec4b6' },
      reducedMotion,
      playedSeconds: start.totalUsed / 1000,
      callbacks: {
        onTick(dt) {
          const over = run.tick(dt);
          sinceCheckpoint.current += dt;
          sinceLedger.current += dt;
          const left = run.leftMs;
          setLeftMs((prev) => (Math.ceil(prev / 1000) === Math.ceil(left / 1000) ? prev : left));
          if (over) return finish();
          if (sinceLedger.current >= LEDGER_MS && live.current.childId) {
            sinceLedger.current = 0;
            writeLedger(live.current.childId, date, run.totalUsed, false, mayClaim(leavingRef));
          }
          if (sinceCheckpoint.current >= CHECKPOINT_MS) save();
        },
        onQuestion(q) {
          if (q) {
            setFeedback(null);
            if (q.say && live.current.sound) speak(q.say);
          }
          setQuestion(q);
        },
        onResult(r) {
          run.answer(r);
          setStats(run.stats);
          setFeedback(r);
          if (live.current.sound) chime(r.correct ? 'right' : 'soft');
        },
        onCoin() {
          run.coin();
          setStats(run.stats);
        },
      },
    });
    racerRef.current = racer;
    const ro = new ResizeObserver(() => racer.resize());
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      racer.destroy();
      racerRef.current = null;
    };
    // The racer lives for the whole session; its callbacks read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = useCallback(() => {
    if (run.finished) return;
    // A game paused (or left open) past midnight belongs to yesterday: its time is over.
    if (localDate(new Date()) !== date) {
      finish(true);
      return;
    }
    if (live.current.childId && openElsewhere(live.current.childId, date)) {
      setPhase('paused');
      return;
    }
    setPhase('playing');
    racerRef.current?.start();
    save();
  }, [date, run, save, finish]);

  const pause = useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    racerRef.current?.pause();
    stopSpeaking();
    save();
    setPhase('paused');
  }, [save]);

  // Keep this tab's claim on the game alive while the screen is open, so a second tab waits.
  useEffect(() => {
    if (phase === 'summary') return;
    const id = window.setInterval(() => {
      if (live.current.childId && phaseRef.current !== 'playing' && mayClaim(leavingRef)) writeLedger(live.current.childId, date, run.totalUsed, false);
    }, 2000);
    return () => window.clearInterval(id);
  }, [phase, date, run]);

  // Hidden tab / app switch → pause. Leaving the page → save what was used.
  useEffect(() => {
    leavingRef.current = false;
    const onHide = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    const onLeave = () => {
      leavingRef.current = true;
      if (!run.finished) save();
      if (live.current.childId) releaseLedger(live.current.childId, date);
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
      onLeave();
      stopSpeaking();
    };
  }, [pause, save, date, run]);

  const steer = useCallback((dir: -1 | 1) => {
    racerRef.current?.steer(dir);
    if (phaseRef.current === 'tutorial') setTutorialStep((s) => Math.max(s, 1));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        steer(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        steer(1);
      } else if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && phaseRef.current === 'playing') {
        pause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steer, pause]);

  if (phase === 'summary') return <Summary stats={stats} note={expired ? 'expired' : undefined} />;

  const low = leftMs <= 30_000;
  const he = lang === 'he';
  const right = feedback && feedback.correct;
  const answerText = feedback ? feedback.question.options[feedback.question.answer] : null;

  return (
    <div className="bonus-game">
      <div className="bonus-hud" dir="ltr">
        <button type="button" className="icon-btn" onClick={pause} disabled={phase !== 'playing'} aria-label={t('השהיה', 'Pause')} title={t('השהיה', 'Pause')}>
          <span aria-hidden="true">⏸</span>
        </button>
        <span className={`hud-pill hud-time ${low ? 'low' : ''}`} role="timer" aria-label={t(`נשארו ${clock(leftMs)}`, `${clock(leftMs)} left`)}>
          <span aria-hidden="true">⏱️</span> {clock(leftMs)}
        </span>
        <span className="hud-pill" aria-label={t(`${stats.score} נקודות`, `${stats.score} points`)}>
          <span aria-hidden="true">⭐</span> {stats.score}
        </span>
        <span className="hud-pill hud-coins" aria-label={t(`${stats.coins} מטבעות`, `${stats.coins} coins`)}>
          <span aria-hidden="true">💰</span> {stats.coins}
        </span>
      </div>

      <div className="bonus-question" aria-live="polite">
        {question ? (
          <>
            <span className="q-ask">{he ? question.ask.he : question.ask.en}</span>
            <div className="q-prompt">
              {question.promptEmoji && <span className="q-emoji" aria-hidden="true">{question.promptEmoji}</span>}
              {question.promptLang === 'he' ? (
                <bdi dir="rtl" lang="he">{question.prompt}</bdi>
              ) : (
                <En>{question.prompt}</En>
              )}
              {question.say && <SpeakButton text={question.say} className="q-speak" />}
            </div>
            <span className="sr-only">
              {t('שערים משמאל לימין:', 'Gates from left to right:')} {question.options.map((o, i) => `${i + 1}. ${o.text || [o.emoji, o.he].filter(Boolean).join(" ")}`).join(', ')}
            </span>
          </>
        ) : feedback ? (
          <div className={`q-feedback ${right ? 'good' : 'soft'}`}>
            {right ? (
              <b>✅ {feedback.streak >= 3 ? t(`מדהים! ${feedback.streak} ברצף!`, `Amazing! ${feedback.streak} in a row!`) : t('כל הכבוד!', 'Great job!')}</b>
            ) : (
              <>
                <b>
                  💛 {t('כמעט! התשובה:', 'Almost! The answer is')} <En>{answerText?.emoji} {answerText?.text}</En>
                  {answerText?.he && <> <bdi dir="rtl" lang="he">{answerText.he}</bdi></>}
                </b>
                {feedback.question.why && <span className="q-why" dir="rtl" lang="he">{feedback.question.why}</span>}
              </>
            )}
          </div>
        ) : (
          <span className="q-ask">{t('מתכוננים… 🏁', 'Get ready… 🏁')}</span>
        )}
      </div>

      <div className="bonus-road">
        <canvas
          ref={canvasRef}
          className="bonus-canvas"
          onPointerDown={(e) => {
            racerRef.current?.tapAt(e.clientX);
            if (phaseRef.current === 'tutorial') setTutorialStep((s) => Math.max(s, 1));
          }}
          aria-label={t('מסלול המרוץ. הקישו על נתיב כדי לנסוע אליו.', 'Race track. Tap a lane to drive there.')}
          role="img"
        />

        {phase === 'tutorial' && (
          <div className="bonus-overlay tutorial">
            <div className="bonus-card">
              {tutorialStep === 0 ? (
                <>
                  <div className="big-emoji bob" aria-hidden="true">🏎️</div>
                  <h2>{t('נסו להזיז את המכונית!', 'Try moving your car!')}</h2>
                  <p>{t('הקישו על ◀ או ▶ (או על נתיב בכביש).', 'Tap ◀ or ▶ (or tap a lane on the road).')}</p>
                </>
              ) : (
                <>
                  <div className="big-emoji pop" aria-hidden="true">👍</div>
                  <h2>{t('מעולה! ככה משחקים:', 'Great! Here’s how to play:')}</h2>
                  <ul className="tutorial-list">
                    <li><span aria-hidden="true">❓</span> {t('קראו את השאלה למעלה', 'Read the question at the top')}</li>
                    <li><span aria-hidden="true">🚦</span> {t('סעו דרך השער עם התשובה הנכונה', 'Drive through the gate with the right answer')}</li>
                    <li><span aria-hidden="true">💰</span> {t('אספו מטבעות בדרך', 'Collect coins on the way')}</li>
                    <li><span aria-hidden="true">⏱️</span> {t('יש לכם 5 דקות!', 'You have 5 minutes!')}</li>
                  </ul>
                  <Button autoFocus onClick={play}>{t('יוצאים לדרך! 🏁', 'Let’s race! 🏁')}</Button>
                </>
              )}
            </div>
          </div>
        )}

        {phase === 'intro' && (
          <div className="bonus-overlay">
            <div className="bonus-card">
              <div className="big-emoji bob" aria-hidden="true">🏁</div>
              <h2>{t('מרוץ השערים באנגלית', 'English Gate Racer')}</h2>
              <p>
                {resumed
                  ? t(`נשארו לכם ${clock(leftMs)} מהיום. ממשיכים?`, `You have ${clock(leftMs)} left from today. Keep going?`)
                  : t('סעו דרך השער הנכון ואספו מטבעות!', 'Drive through the right gate and collect coins!')}
              </p>
              <Button autoFocus onClick={play}>{resumed ? t('ממשיכים! ▶', 'Continue! ▶') : t('יוצאים לדרך! 🏁', 'Let’s race! 🏁')}</Button>
            </div>
          </div>
        )}

        {phase === 'paused' && (
          <div className="bonus-overlay">
            <div className="bonus-card">
              <div className="big-emoji" aria-hidden="true">⏸️</div>
              <h2>{t('הפסקה', 'Paused')}</h2>
              <p>{t(`השעון עצר. נשארו ${clock(leftMs)}.`, `The clock is stopped. ${clock(leftMs)} left.`)}</p>
              <div className="row-center">
                <Button autoFocus onClick={play}>▶ {t('ממשיכים', 'Resume')}</Button>
                <Button variant="ghost" onClick={() => navigate('quest')}>{t('אמשיך אחר כך', 'Play later')}</Button>
              </div>
              <p className="soft-note">{t('הזמן שנשאר שמור עד סוף היום.', 'Your time left is saved until the end of today.')}</p>
            </div>
          </div>
        )}
      </div>

      <div className="bonus-controls" dir="ltr">
        <button type="button" className="steer-btn" onClick={() => steer(-1)} aria-label={t('שמאלה', 'Left')}>
          <span aria-hidden="true">◀</span>
        </button>
        <button type="button" className="steer-btn" onClick={() => steer(1)} aria-label={t('ימינה', 'Right')}>
          <span aria-hidden="true">▶</span>
        </button>
      </div>
    </div>
  );
}

function Summary({ stats, note }: { stats: BonusStats; note?: 'already' | 'expired' }) {
  const { t } = useStore();
  const accuracy = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0;
  const cheer =
    stats.answered === 0
      ? t('איזו נסיעה! מחר יש עוד הרפתקה.', 'What a ride! Another adventure is waiting tomorrow.')
      : accuracy >= 80
        ? t('נהגי-על! האנגלית שלכם בוערת! 🌟', 'Superstar driver! Your English is on fire! 🌟')
        : accuracy >= 50
          ? t('נהיגה מעולה! כל שער מחזק את האנגלית שלכם! 💪', 'Great driving! Every gate makes your English stronger! 💪')
          : t('איזו נסיעה! מתרגלים ומשתפרים — נתראה מחר! 🚗', 'What a ride! Practice makes progress — see you tomorrow! 🚗');
  return (
    <div className="bonus-screen">
      {!note && <Confetti />}
      <div className="bonus-card summary">
        <div className="big-emoji pop" aria-hidden="true">🏆</div>
        <h1>{t('הרפתקה פנטסטית!', 'Fantastic Adventure!')}</h1>
        {note === 'expired' && <p className="soft-note">{t('זמן הבונוס של אתמול נגמר בחצות. משחק חדש ייפתח אחרי המשימה של היום!', 'Yesterday’s bonus time ended at midnight. A new game unlocks after today’s quest!')}</p>}
        {note === 'already' && <p className="soft-note">{t('כבר שיחקתם במשחק הבונוס של היום. משחק חדש ייפתח אחרי המשימה של מחר!', 'You already played today’s bonus game. A new one unlocks after tomorrow’s quest!')}</p>}
        <p className="summary-lead">
          {t(`הרווחתם ${stats.coins} מטבעות ועניתם על ${stats.answered} אתגרי אנגלית!`, `You earned ${stats.coins} coins and answered ${stats.answered} English challenges!`)}
        </p>
        <ul className="summary-grid">
          <li><span aria-hidden="true">⭐</span><b className="num">{stats.score}</b><span>{t('נקודות', 'Total points')}</span></li>
          <li><span aria-hidden="true">✅</span><b className="num">{stats.correct}/{stats.answered}</b><span>{t('תשובות נכונות', 'Correct answers')}</span></li>
          <li><span aria-hidden="true">🎯</span><b className="num">{accuracy}%</b><span>{t('דיוק', 'Accuracy')}</span></li>
          <li><span aria-hidden="true">💰</span><b className="num">{stats.coins}</b><span>{t('מטבעות בונוס', 'Bonus coins')}</span></li>
          <li><span aria-hidden="true">🔥</span><b className="num">{stats.bestStreak}</b><span>{t('הרצף הכי ארוך', 'Best streak')}</span></li>
        </ul>
        <p className="summary-cheer">{cheer}</p>
        <Button autoFocus onClick={() => navigate('quest')}>{t('חזרה למשימה שלי', 'BACK TO MY QUEST')}</Button>
      </div>
    </div>
  );
}
