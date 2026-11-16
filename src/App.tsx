import { useEffect } from 'react';
import { Avatar, TicketPill } from './components/ui';
import { computeStreak } from './domain/progress';
import { balance } from './domain/tickets';
import type { StepId } from './domain/types';
import { BadgeCollection, WordCollection } from './features/collection/Collections';
import { IslandMap } from './features/island/IslandMap';
import { Onboarding } from './features/onboarding/Onboarding';
import { ParentArea } from './features/parent/ParentArea';
import { ChildPicker } from './features/players/ChildPicker';
import { ActivityRunner } from './features/quest/ActivityRunner';
import { SessionDone, TodayQuest } from './features/quest/TodayQuest';
import { Settings } from './features/settings/Settings';
import { TicketPouch } from './features/tickets/TicketPouch';
import { WeeklyPlan } from './features/week/WeeklyPlan';
import { navigate, useRoute } from './lib/router';
import { useStore } from './state/store';

const STEPS: StepId[] = ['warmup', 'learn', 'mission', 'create', 'bonus'];

export function App() {
  const { state, household, activeChildId, t, lang, actions } = useStore();
  const route = useRoute();
  const { settings } = state;

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'he' ? 'rtl' : 'ltr';
    root.classList.toggle('reduce-motion', settings.reducedMotion);
    root.classList.toggle('large-text', settings.largeText);
  }, [lang, settings.reducedMotion, settings.largeText]);

  const [page, a, b] = route;
  if (household.children.length === 0) return <Onboarding />;
  if (!activeChildId || !state.profile) {
    // Nobody is signed in: only the child picker and the (PIN-protected) parent area are reachable.
    if (page === 'parent') {
      return (
        <div className="shell">
          <main id="main" className="content" tabIndex={-1}>
            <ParentArea />
          </main>
        </div>
      );
    }
    return <ChildPicker />;
  }
  const canSwitch = household.children.length > 1 || household.children.some((c) => c.codeHash !== null);
  if (page === 'play' && a && STEPS.includes(b as StepId)) {
    return <ActivityRunner key={`${a}-${b}`} lessonId={a} step={b as StepId} />;
  }

  const nav = [
    { id: '', emoji: '🏝️', label: t('האי', 'Island') },
    { id: 'quest', emoji: '🧭', label: t('משימה', 'Quest') },
    { id: 'week', emoji: '📅', label: t('שבוע', 'Week') },
    { id: 'words', emoji: '📖', label: t('מילים', 'Words') },
    { id: 'badges', emoji: '🏅', label: t('תגים', 'Badges') },
    { id: 'tickets', emoji: '🎟️', label: t('כרטיסים', 'Tickets') },
  ];
  const current = page === 'done' ? 'quest' : (page ?? '');
  const streak = computeStreak(state.progress.sessions, new Date());

  let view;
  switch (page) {
    case 'quest': view = <TodayQuest key={a ?? 'next'} lessonId={a} />; break;
    case 'done': view = a ? <SessionDone key={a} lessonId={a} /> : <TodayQuest />; break;
    case 'week': view = <WeeklyPlan />; break;
    case 'words': view = <WordCollection />; break;
    case 'badges': view = <BadgeCollection />; break;
    case 'tickets': view = <TicketPouch />; break;
    case 'parent': view = <ParentArea />; break;
    case 'settings': view = <Settings />; break;
    default: view = <IslandMap />;
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">{t('דילוג לתוכן', 'Skip to content')}</a>
      <header className="topbar">
        <button type="button" className="brand" onClick={() => navigate('')} aria-label={t('English Quest – לדף הבית', 'English Quest – home')}>
          <Avatar size={40} />
          <span className="brand-name" dir="ltr" lang="en">English Quest</span>
        </button>
        <div className="topbar-right">
          {streak > 0 && <span className="streak-pill" aria-label={t(`רצף של ${streak} ימים`, `${streak}-day streak`)}><span aria-hidden="true">🔥</span>{streak}</span>}
          <button type="button" className="pill-btn" onClick={() => navigate('tickets')} aria-label={t('נרתיק הכרטיסים', 'Ticket pouch')}>
            <TicketPill amount={balance(state.tickets)} label={t('כרטיסי מסע', 'Quest Tickets')} />
          </button>
          {canSwitch && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                actions.signOutChild();
                navigate('');
              }}
              aria-label={t('החלפת שחקן/ית', 'Switch player')}
              title={t('החלפת שחקן/ית', 'Switch player')}
            >
              <span aria-hidden="true">👥</span>
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => navigate('settings')} aria-label={t('הגדרות', 'Settings')}><span aria-hidden="true">⚙️</span></button>
          <button type="button" className="icon-btn" onClick={() => navigate('parent')} aria-label={t('אזור ההורים', 'Parent area')}><span aria-hidden="true">👪</span></button>
        </div>
      </header>
      <nav className="mainnav" aria-label={t('ניווט ראשי', 'Main navigation')}>
        {nav.map((n) => (
          <a key={n.id} href={`#/${n.id}`} className={current === n.id ? 'on' : ''} aria-current={current === n.id ? 'page' : undefined}>
            <span className="nav-emoji" aria-hidden="true">{n.emoji}</span>
            <span>{n.label}</span>
          </a>
        ))}
      </nav>
      <main id="main" className="content" tabIndex={-1}>
        {view}
      </main>
    </div>
  );
}
