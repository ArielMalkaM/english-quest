import { useState } from 'react';
import { Avatar, Button, En } from '../../components/ui';
import { findLesson, weeksFor } from '../../data/curriculum';
import { STEP_MINUTES } from '../../domain/dailyPlan';
import { MAX_ZONE_LEVEL, ZONE_LEVELS, computeStreak, gradeOf, isLessonComplete, nextLessonId, zoneLevel } from '../../domain/progress';
import { CORE_STEPS } from '../../domain/types';
import type { ZoneId } from '../../domain/types';
import { navigate } from '../../lib/router';
import { useStore } from '../../state/store';
import { ZONES } from '../quest/meta';

const POSITIONS: Record<ZoneId, { x: number; y: number }> = {
  sky: { x: 50, y: 11 },
  woods: { x: 23, y: 36 },
  lab: { x: 77, y: 35 },
  cave: { x: 50, y: 55 },
  harbor: { x: 21, y: 76 },
  market: { x: 78, y: 76 },
};

const PATHS: [ZoneId, ZoneId][] = [
  ['woods', 'cave'],
  ['lab', 'cave'],
  ['cave', 'harbor'],
  ['cave', 'market'],
  ['harbor', 'market'],
  ['woods', 'sky'],
  ['lab', 'sky'],
];

const FLOWER_SPOTS = [
  [36, 30], [62, 46], [35, 63], [66, 64], [48, 38], [30, 50], [70, 54], [42, 72], [58, 74], [54, 30],
];
const FRIEND_SPOTS = [
  [36, 44], [64, 28], [38, 82], [63, 84], [12, 55], [88, 55], [50, 86],
];

export function IslandMap() {
  const { state, t, lang } = useStore();
  const [openZone, setOpenZone] = useState<ZoneId | null>(null);
  const { progress, profile } = state;
  const WEEKS = weeksFor(gradeOf(state));
  const nextId = nextLessonId(progress, gradeOf(state));
  const next = nextId ? findLesson(nextId) : null;
  const done = nextId ? (progress.steps[nextId] ?? []) : [];
  const coreDone = CORE_STEPS.filter((s) => done.includes(s)).length;
  const minutesLeft = CORE_STEPS.filter((s) => !done.includes(s)).reduce((sum, s) => sum + STEP_MINUTES[s], 0);
  const streak = computeStreak(progress.sessions, new Date());
  // Open-now bonus week (test prep): offered next to the main quest until all its quests are done.
  const prepWeek = WEEKS.find((w) => w.openNow && w.id !== next?.week.id && w.lessons.some((l) => !isLessonComplete(progress, l.id)));
  const prepNext = prepWeek?.lessons.find((l) => !isLessonComplete(progress, l.id));
  const prepDone = prepWeek ? prepWeek.lessons.filter((l) => isLessonComplete(progress, l.id)).length : 0;
  const friends = WEEKS.filter((w) => isLessonComplete(progress, w.lessons[w.lessons.length - 1].id)).map((w) => w.friend);
  const flowers = Math.min(FLOWER_SPOTS.length, progress.sessions.length);
  const bridgeBuilt = zoneLevel('harbor', progress.zonePoints.harbor) >= 2;
  const zone = openZone ? ZONES[openZone] : null;
  const openPoints = openZone ? progress.zonePoints[openZone] : 0;
  const openLevel = openZone ? zoneLevel(openZone, openPoints) : 0;

  return (
    <div className="page home">
      <section className="hello">
        <Avatar size={56} />
        <div>
          <h1>{t('שלום,', 'Hi,')} <bdi>{profile?.name}</bdi>!</h1>
          <p>
            {streak > 0
              ? `🔥 ${t(`${streak} ימים ברצף`, `${streak}-day streak`)}`
              : t('האי מחכה שתחזירו לו את הצבעים.', 'The island is waiting for you to bring back its colours.')}
          </p>
        </div>
      </section>

      {next ? (
        <button type="button" className={`today-card ${next.lesson.boss ? 'boss' : ''}`} onClick={() => navigate('quest')}>
          <span className="today-emoji" aria-hidden="true">{next.lesson.boss ? '👑' : next.week.emoji}</span>
          <span className="today-text">
            <small>{coreDone > 0 ? t('ממשיכים את המשימה', 'Continue your quest') : t('המשימה של היום', 'Today’s quest')} · {t(`שבוע ${next.week.number}`, `Week ${next.week.number}`)}</small>
            <b><En>{next.lesson.title}</En></b>
            <span>⏱️ {t(`בערך ${minutesLeft} דקות`, `About ${minutesLeft} minutes`)} · {coreDone}/4</span>
          </span>
          <span className="today-go" aria-hidden="true">▶</span>
        </button>
      ) : (
        <div className="today-card done-all">
          <span className="today-emoji" aria-hidden="true">🏆</span>
          <span className="today-text"><b>{t('כל המשימות הושלמו!', 'All quests complete!')}</b></span>
        </div>
      )}

      {prepWeek && prepNext && (
        <button type="button" className="today-card prep" onClick={() => navigate(`quest/${prepNext.id}`)}>
          <span className="today-emoji" aria-hidden="true">{prepWeek.emoji}</span>
          <span className="today-text">
            <small>{t('בונוס · פתוח עכשיו', 'Bonus · open now')} · {t(`שבוע ${prepWeek.number}`, `Week ${prepWeek.number}`)}</small>
            <b>{lang === 'he' ? prepWeek.themeHe : <En>{prepWeek.theme}</En>}</b>
            <span>▶ <En>{prepNext.title}</En> · {prepDone}/{prepWeek.lessons.length}</span>
          </span>
          <span className="today-go" aria-hidden="true">▶</span>
        </button>
      )}

      <section className="map" aria-label={t('מפת אי המסע', 'Quest Island map')}>
        <svg className="map-art" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="wave" d="M0 18 Q 12 14 25 18 T 50 18 T 75 18 T 100 18" />
          <path className="wave" d="M0 94 Q 12 90 25 94 T 50 94 T 75 94 T 100 94" />
          <path className="island-sand" d="M8 55 C 4 34, 20 20, 40 22 C 52 14, 74 16, 86 28 C 98 40, 97 66, 90 78 C 82 93, 60 96, 44 92 C 26 97, 10 84, 8 55 Z" />
          <path className="island-grass" d="M14 54 C 12 38, 24 27, 41 28 C 54 21, 72 23, 82 33 C 91 43, 90 63, 84 74 C 77 86, 60 89, 45 86 C 29 90, 16 78, 14 54 Z" />
          {PATHS.map(([a, b]) => {
            const built = a === 'harbor' && b === 'market' ? bridgeBuilt : zoneLevel(a, progress.zonePoints[a]) > 0 && zoneLevel(b, progress.zonePoints[b]) > 0;
            return (
              <line key={`${a}-${b}`} className={`trail ${built ? 'built' : ''}`} x1={POSITIONS[a].x} y1={POSITIONS[a].y} x2={POSITIONS[b].x} y2={POSITIONS[b].y} vectorEffect="non-scaling-stroke" />
            );
          })}
        </svg>

        {FLOWER_SPOTS.slice(0, flowers).map(([x, y], i) => (
          <span key={`f${i}`} className="map-decor" style={{ left: `${x}%`, top: `${y}%` }} aria-hidden="true">{i % 3 === 0 ? '🌼' : i % 3 === 1 ? '🌷' : '🌻'}</span>
        ))}
        {friends.map((f, i) => (
          <span key={f.name} className="map-friend" style={{ left: `${FRIEND_SPOTS[i][0]}%`, top: `${FRIEND_SPOTS[i][1]}%` }} title={f.name} aria-hidden="true">{f.emoji}</span>
        ))}

        {(Object.keys(POSITIONS) as ZoneId[]).map((id) => {
          const z = ZONES[id];
          const level = zoneLevel(id, progress.zonePoints[id]);
          return (
            <button
              key={id}
              type="button"
              className={`zone zone-${id} level-${level} ${openZone === id ? 'open' : ''}`}
              style={{ left: `${POSITIONS[id].x}%`, top: `${POSITIONS[id].y}%` }}
              aria-expanded={openZone === id}
              aria-label={`${lang === 'he' ? z.he : z.en} – ${t(`רמה ${level} מתוך 4`, `level ${level} of 4`)}`}
              onClick={() => setOpenZone(openZone === id ? null : id)}
            >
              <span className="zone-art" aria-hidden="true">{z.stages[level]}</span>
              <span className="zone-name">{lang === 'he' ? z.he : z.en}</span>
              <span className="pips" aria-hidden="true">
                {ZONE_LEVELS[id].map((_, i) => (
                  <i key={i} className={i < level ? 'on' : ''} />
                ))}
              </span>
            </button>
          );
        })}
      </section>

      {zone && openZone && (
        <section className="card zone-panel" aria-live="polite">
          <h2>{zone.stages[openLevel]} {lang === 'he' ? zone.he : zone.en}</h2>
          <p>{lang === 'he' ? zone.aboutHe : zone.about}</p>
          <p className="soft-note">
            {openLevel >= MAX_ZONE_LEVEL
              ? t('המקום הזה משוחזר לגמרי! ✨', 'This place is fully restored! ✨')
              : t(
                  `עוד ${ZONE_LEVELS[openZone][openLevel] - openPoints} פעילויות מהסוג הזה כדי לשדרג את המקום.`,
                  `${ZONE_LEVELS[openZone][openLevel] - openPoints} more activities of this kind will upgrade this place.`,
                )}
          </p>
          <div className="stage-row" aria-hidden="true">
            {zone.stages.map((s, i) => (
              <span key={i} className={i <= openLevel ? 'reached' : ''}>{s}</span>
            ))}
          </div>
          {next && <Button onClick={() => navigate('quest')}>{t('למשימה של היום', 'Go to today’s quest')} ▶</Button>}
        </section>
      )}

      <section className="friends-row">
        <h2>{t('חברים באי', 'Island friends')}</h2>
        <div className="chip-row">
          {WEEKS.map((w) => {
            const here = friends.includes(w.friend);
            return (
              <span key={w.id} className={`friend-chip ${here ? 'here' : ''}`} title={here ? w.friend.name : t(`מצטרף/ת אחרי שבוע ${w.number}`, `Joins after week ${w.number}`)}>
                <span aria-hidden="true">{here ? w.friend.emoji : '❔'}</span>
                <span>{here ? w.friend.name : t(`שבוע ${w.number}`, `Week ${w.number}`)}</span>
              </span>
            );
          })}
        </div>
      </section>
    </div>
  );
}
