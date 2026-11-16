import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppRepository } from '../data/repository';
import { createDemoState, createInitialState, startProfile } from '../data/seed';
import { assertParent, isParentAuthorized, setPin, unlockParent } from '../domain/parentAuth';
import { evaluateBadges } from '../domain/progress';
import type { AttemptInput, StepOutcome } from '../domain/session';
import { completeStep } from '../domain/session';
import { decideRequest, fulfillRequest, giftTickets, removeReward, requestReward, saveReward } from '../domain/tickets';
import type { AppState, Lang, LearnerProfile, ParentSession, Reward, Settings, StepId } from '../domain/types';

type ChildSettings = Pick<Settings, 'uiLang' | 'reducedMotion' | 'largeText' | 'sound'>;
type ParentSettings = Pick<Settings, 'weeklyTicketCap' | 'bonusMultiplier'>;

export interface Store {
  state: AppState;
  lang: Lang;
  /** Picks the Hebrew or English UI string. */
  t: (he: string, en: string) => string;
  parentUnlocked: boolean;
  /** Result of the most recent step, for the celebration screens. */
  lastOutcome: (StepOutcome & { lessonId: string; step: StepId }) | null;
  actions: {
    finishOnboarding(profile: LearnerProfile, pin: string | null, uiLang: Lang): void;
    loadDemo(): void;
    completeStep(lessonId: string, step: StepId, attempts: AttemptInput[]): StepOutcome;
    requestReward(rewardId: string): void;
    updateChildSettings(patch: Partial<ChildSettings>): void;
    unlockParent(pin: string): boolean;
    createParentPin(pin: string): void;
    lockParent(): void;
    // Everything below requires an unlocked parent session.
    changePin(pin: string): void;
    decideRequest(id: string, decision: 'approve' | 'decline'): void;
    fulfillRequest(id: string): void;
    saveReward(reward: Omit<Reward, 'id'> & { id?: string }): void;
    removeReward(id: string): void;
    giftTickets(amount: number, note: string): void;
    updateParentSettings(patch: Partial<ParentSettings>): void;
    updateProfile(patch: Partial<LearnerProfile>): void;
    resetAll(): void;
    resetToDemo(): void;
  };
}

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}

export function StoreProvider({ repository, children }: { repository: AppRepository; children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const stateRef = useRef<AppState | null>(null);
  const [parentSession, setParentSession] = useState<ParentSession | null>(null);
  const sessionRef = useRef<ParentSession | null>(null);
  const [lastOutcome, setLastOutcome] = useState<Store['lastOutcome']>(null);

  useEffect(() => {
    let alive = true;
    repository.load().then((loaded) => {
      if (!alive) return;
      const initial = loaded ?? createInitialState();
      stateRef.current = initial;
      setState(initial);
    });
    return () => {
      alive = false;
    };
  }, [repository]);

  const commit = useCallback(
    (next: AppState) => {
      stateRef.current = next;
      setState(next);
      void repository.save(next);
    },
    [repository],
  );

  const actions = useMemo<Store['actions']>(() => {
    const cur = () => stateRef.current as AppState;
    const session = () => sessionRef.current;
    const setSession = (s: ParentSession | null) => {
      sessionRef.current = s;
      setParentSession(s);
    };
    const asParent = (fn: (s: AppState, now: Date) => AppState) => {
      const now = new Date();
      assertParent(session(), now);
      commit(fn(cur(), now));
      setSession({ unlockedAt: now.getTime() }); // activity keeps the parent area open
    };
    return {
      finishOnboarding(profile, pin, uiLang) {
        const withLang = { ...cur(), settings: { ...cur().settings, uiLang } };
        commit(startProfile(withLang, profile, pin, new Date()));
      },
      loadDemo() {
        commit(createDemoState(new Date()));
      },
      completeStep(lessonId, step, attempts) {
        const outcome = completeStep(cur(), lessonId, step, attempts, new Date());
        commit(outcome.state);
        setLastOutcome({ ...outcome, lessonId, step });
        return outcome;
      },
      requestReward(rewardId) {
        const now = new Date();
        commit(evaluateBadges(requestReward(cur(), rewardId, now), now).state);
      },
      updateChildSettings(patch) {
        commit({ ...cur(), settings: { ...cur().settings, ...patch } });
      },
      unlockParent(pin) {
        const s = unlockParent(cur(), pin, new Date());
        if (s) setSession(s);
        return s !== null;
      },
      createParentPin(pin) {
        if (cur().parent.pinHash !== null) throw new Error('A PIN already exists');
        commit({ ...cur(), parent: setPin(cur().parent, pin) });
        setSession({ unlockedAt: Date.now() });
      },
      lockParent() {
        setSession(null);
      },
      changePin(pin) {
        asParent((s) => ({ ...s, parent: setPin(s.parent, pin) }));
      },
      decideRequest(id, decision) {
        asParent((s, now) => decideRequest(s, id, decision, session(), now));
      },
      fulfillRequest(id) {
        asParent((s, now) => fulfillRequest(s, id, session(), now));
      },
      saveReward(reward) {
        asParent((s, now) => saveReward(s, reward, session(), now));
      },
      removeReward(id) {
        asParent((s, now) => removeReward(s, id, session(), now));
      },
      giftTickets(amount, note) {
        asParent((s, now) => giftTickets(s, amount, note, session(), now));
      },
      updateParentSettings(patch) {
        asParent((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
      },
      updateProfile(patch) {
        asParent((s) => (s.profile ? { ...s, profile: { ...s.profile, ...patch } } : s));
      },
      resetAll() {
        assertParent(session(), new Date());
        setSession(null);
        setLastOutcome(null);
        void repository.clear();
        const fresh = createInitialState();
        stateRef.current = fresh;
        setState(fresh);
      },
      resetToDemo() {
        assertParent(session(), new Date());
        setLastOutcome(null);
        commit(createDemoState(new Date()));
      },
    };
  }, [commit, repository]);

  // Re-lock the parent area automatically when the session expires.
  useEffect(() => {
    if (!parentSession) return;
    const id = window.setInterval(() => {
      if (!isParentAuthorized(sessionRef.current, new Date())) {
        sessionRef.current = null;
        setParentSession(null);
      }
    }, 15000);
    return () => window.clearInterval(id);
  }, [parentSession]);

  const store = useMemo<Store | null>(() => {
    if (!state) return null;
    const lang = state.settings.uiLang;
    return {
      state,
      lang,
      t: (he, en) => (lang === 'he' ? he : en),
      parentUnlocked: parentSession !== null,
      lastOutcome,
      actions,
    };
  }, [state, parentSession, lastOutcome, actions]);

  if (!store) {
    return (
      <div className="splash" role="status" aria-live="polite">
        <span className="splash-icon" aria-hidden="true">🧭</span>
        English Quest
      </div>
    );
  }
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
