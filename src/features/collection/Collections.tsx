import { useState } from 'react';
import { En, PageHeader, SpeakButton } from '../../components/ui';
import { weeksFor } from '../../data/curriculum';
import { MAX_ZONE_LEVEL, ZONE_LEVELS, badgesFor, gradeOf, masteredWordCount, wordMastery, zoneLevel } from '../../domain/progress';
import type { ZoneId } from '../../domain/types';
import { useStore } from '../../state/store';
import { ZONES } from '../quest/meta';

export function WordCollection() {
  const { state, t } = useStore();
  const [filter, setFilter] = useState<number | 'all'>('all');
  const [showHe, setShowHe] = useState<Record<string, boolean>>({});
  const stats = state.progress.wordStats;
  const metCount = Object.values(stats).filter((s) => s.seen > 0).length;
  const WEEKS = weeksFor(gradeOf(state));
  const weeks = WEEKS.filter((w) => filter === 'all' || w.number === filter);
  const masteryLabel = [t('עוד לא נפגשנו', 'Not met yet'), t('נפגשנו', 'Met'), t('צומחת', 'Growing'), t('שולטים!', 'Mastered!')];

  return (
    <div className="page">
      <PageHeader emoji="📖" title={t('אוסף המילים', 'Word collection')} sub={t(`פגשתם ${metCount} מילים · ${masteredWordCount(state.progress)} בשליטה מלאה`, `${metCount} words met · ${masteredWordCount(state.progress)} mastered`)} />
      <div className="week-tabs" role="tablist" aria-label={t('סינון לפי שבוע', 'Filter by week')}>
        <button type="button" role="tab" aria-selected={filter === 'all'} className={`week-tab ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>{t('הכול', 'All')}</button>
        {WEEKS.map((w) => (
          <button key={w.id} type="button" role="tab" aria-selected={filter === w.number} className={`week-tab ${filter === w.number ? 'on' : ''}`} onClick={() => setFilter(w.number)}>
            <span aria-hidden="true">{w.emoji}</span> {w.number}
          </button>
        ))}
      </div>
      {weeks.map((w) => (
        <section key={w.id}>
          <h2 className="section-title">{w.emoji} <En>{w.theme}</En></h2>
          <ul className="word-grid">
            {w.words.map((word) => {
              const m = wordMastery(stats[word.id]);
              if (m === 0) {
                return (
                  <li key={word.id} className="word-card locked" aria-label={t('מילה שעוד לא פגשתם', 'A word you have not met yet')}>
                    <span className="word-emoji" aria-hidden="true">❔</span>
                    <span className="soft-note">{t('תתגלה במשימה', 'Found in a quest')}</span>
                  </li>
                );
              }
              return (
                <li key={word.id} className={`word-card m${m}`}>
                  <span className="word-emoji" aria-hidden="true">{word.emoji}</span>
                  <div className="word-main" dir="ltr">
                    <En className="word-en">{word.en}</En>
                    <SpeakButton text={word.en} />
                  </div>
                  <button type="button" className="word-he" aria-expanded={Boolean(showHe[word.id])} onClick={() => setShowHe((s) => ({ ...s, [word.id]: !s[word.id] }))}>
                    {showHe[word.id] ? word.he : t('💡 מה זה בעברית?', '💡 Show Hebrew')}
                  </button>
                  <div className="word-example" dir="ltr">
                    <En>{word.example}</En>
                    <SpeakButton text={word.example} slow />
                  </div>
                  <div className="mastery" aria-label={`${t('שליטה', 'Mastery')}: ${masteryLabel[m]}`}>
                    {[1, 2, 3].map((n) => (
                      <span key={n} aria-hidden="true" className={n <= m ? 'on' : ''}>★</span>
                    ))}
                    <small>{masteryLabel[m]}</small>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function BadgeCollection() {
  const { state, t, lang } = useStore();
  const BADGES = badgesFor(gradeOf(state));
  const all = new Map(state.progress.badges.map((b) => [b.id, b.at]));
  const earned = new Map(BADGES.filter((b) => all.has(b.id)).map((b) => [b.id, all.get(b.id) as string]));
  const fmt = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' });

  return (
    <div className="page">
      <PageHeader emoji="🏅" title={t('תגים והתקדמות האי', 'Badges and island progress')} sub={t(`${earned.size} מתוך ${BADGES.length} תגים`, `${earned.size} of ${BADGES.length} badges`)} />
      <section>
        <h2 className="section-title">🏝️ {t('שחזור האי', 'Island restoration')}</h2>
        <ul className="zone-list">
          {(Object.keys(ZONES) as ZoneId[]).map((id) => {
            const z = ZONES[id];
            const points = state.progress.zonePoints[id];
            const level = zoneLevel(id, points);
            const goal = ZONE_LEVELS[id][Math.min(level, MAX_ZONE_LEVEL - 1)];
            return (
              <li key={id} className="zone-row">
                <span className="zone-row-art" aria-hidden="true">{z.stages[level]}</span>
                <div>
                  <b>{lang === 'he' ? z.he : z.en}</b>
                  <small>{lang === 'he' ? z.aboutHe : z.about}</small>
                  <div className="stage-row" aria-label={t(`רמה ${level} מתוך 4`, `Level ${level} of 4`)}>
                    {z.stages.map((s, i) => (
                      <span key={i} aria-hidden="true" className={i <= level ? 'reached' : ''}>{s}</span>
                    ))}
                  </div>
                </div>
                <span className="chip">{level >= MAX_ZONE_LEVEL ? '✨' : `${points}/${goal}`}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h2 className="section-title">🏅 {t('התגים שלי', 'My badges')}</h2>
        <ul className="badge-grid">
          {BADGES.map((b) => {
            const at = earned.get(b.id);
            return (
              <li key={b.id} className={`badge-card ${at ? 'earned' : ''}`}>
                <span className="badge-emoji" aria-hidden="true">{at ? b.emoji : '🔒'}</span>
                <b>{lang === 'he' ? b.titleHe : b.title}</b>
                <small>{at ? `${t('הושג ב-', 'Earned ')}${fmt.format(new Date(at))}` : lang === 'he' ? b.howHe : b.how}</small>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
