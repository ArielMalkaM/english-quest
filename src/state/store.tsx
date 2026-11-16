import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppRepository } from '../data/repository';
import { DEFAULT_SETTINGS, createDemoHousehold, createInitialHousehold, createInitialState, startProfile } from '../data/seed';
import {
  addChild,
  childView,
  findChild,
  mergeChildView,
  removeChild,
  updateChild,
  verifyChildCode,
} from '../domain/household';
import { assertParent, isParentAuthorized, setPin, verifyPin } from '../domain/parentAuth';
import { emptyProgress, evaluateBadges } from '../domain/progress';
import type { AttemptInput, StepOutcome } from '../domain/session';
import { completeStep } from '../domain/session';
import { decideRequest, fulfillRequest, giftTickets, removeReward, requestReward, saveReward } from '../domain/tickets';
import type { AppState, Household, Lang, LearnerProfile, ParentSession, Reward, Settings, StepId } from '../domain/types';

type ChildSettings = Pick<Settings, 'uiLang' | 'reducedMotion' | 'largeText' | 'sound'>;
type ParentSettings = Pick<Settings, 'weeklyTicketCap' | 'bonusMultiplier'>;

export interface Store {
  /** The learner this store acts for (the child playing now, or the child a parent is managing). */
  state: AppState;
  household: Household;
  /** Child this store is bound to; null before a child is chosen. */
  childId: string | null;
  /** Child currently signed in to play on this device. */
  activeChildId: string | null;
  lang: Lang;
  /** Picks the Hebrew or English UI string. */
  t: (he: string, en: string) => string;
  parentUnlocked: boolean;
  /** Result of the most recent step, for the celebration screens. */
  lastOutcome: (StepOutcome & { lessonId: string; step: StepId }) | null;
  /** The same store, bound to another child (used by the parent dashboard). */
  forChild(childId: string): Store;
  actions: {
    finishOnboarding(profile: LearnerProfile, pin: string | null, uiLang: Lang): void;
    loadDemo(): void;
    /** Signs a child in. Returns false when the child's code is wrong. */
    selectChild(childId: string, code?: string): boolean;
    /** Back to "Who is playing?". */
    signOutChild(): void;
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
    addChild(profile: LearnerProfile, code: string | null): string;
    updateChild(childId: string, patch: { profile?: Partial<LearnerProfile>; code?: string | null }): void;
    removeChild(childId: string): void;
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

/** Renders children with the store bound to one child (parent dashboard panels). */
export function ChildScope({ childId, children }: { childId: string; children: ReactNode }) {
  const store = useStore();
  const scoped = useMemo(() => store.forChild(childId), [store, childId]);
  return <StoreContext.Provider value={scoped}>{children}</StoreContext.Provider>;
}

const ACTIVE_KEY = 'english-quest/active-child';

function readActive(): string | null {
  try {
    return window.sessionStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function writeActive(id: string | null): void {
  try {
    if (id) window.sessionStorage.setItem(ACTIVE_KEY, id);
    else window.sessionStorage.removeItem(ACTIVE_KEY);
  } catch {
    // ignore: the child simply picks their profile again after a reload
  }
}

/** Which child should be signed in after loading: the one from this tab, or an only child without a code. */
function initialActive(h: Household): string | null {
  const remembered = readActive();
  if (remembered && findChild(h, remembered)) return remembered;
  if (h.children.length === 1 && h.children[0].codeHash === null) return h.children[0].id;
  return null;
}

function emptyView(h: Household): AppState {
  return {
    version: h.version,
    profile: null,
    parent: h.parent,
    settings: { ...DEFAULT_SETTINGS, uiLang: h.uiLang },
    progress: emptyProgress(),
    tickets: [],
    rewards: h.rewards,
    requests: [],
  };
}

export function StoreProvider({ repository, children }: { repository: AppRepository; children: ReactNode }) {
  const [household, setHousehold] = useState<Household | null>(null);
  const hhRef = useRef<Household | null>(null);
  const [activeChildId, setActiveState] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);
  const [parentSession, setParentSession] = useState<ParentSession | null>(null);
  const sessionRef = useRef<ParentSession | null>(null);
  const [lastOutcome, setLastOutcome] = useState<Store['lastOutcome']>(null);

  const setActive = useCallback((id: string | null) => {
    activeRef.current = id;
    setActiveState(id);
    writeActive(id);
  }, []);

  useEffect(() => {
    let alive = true;
    repository.load().then((loaded) => {
      if (!alive) return;
      const initial = loaded ?? createInitialHousehold();
      hhRef.current = initial;
      setHousehold(initial);
      setActive(initialActive(initial));
    });
    return () => {
      alive = false;
    };
  }, [repository, setActive]);

  const commit = useCallback(
    (next: Household) => {
      hhRef.current = next;
      setHousehold(next);
      void repository.save(next);
    },
    [repository],
  );

  const actionCache = useRef(new Map<string | null, Store['actions']>());

  const actionsFor = useCallback(
    (boundId: string | null): Store['actions'] => {
      const cached = actionCache.current.get(boundId);
      if (cached) return cached;

      const hh = () => hhRef.current as Household;
      const session = () => sessionRef.current;
      const setSession = (s: ParentSession | null) => {
        sessionRef.current = s;
        setParentSession(s);
      };
      const boundChild = () => {
        const child = findChild(hh(), boundId);
        if (!child) throw new Error('No child is selected');
        return child;
      };
      /** Runs a single-child domain function on the bound child and writes the result back. */
      const onChild = (fn: (view: AppState) => AppState) => {
        const child = boundChild();
        commit(mergeChildView(hh(), child.id, fn(childView(hh(), child))));
      };
      const touch = (now: Date) => setSession({ unlockedAt: now.getTime() }); // activity keeps the parent area open
      const asParent = (fn: (view: AppState, now: Date) => AppState) => {
        const now = new Date();
        assertParent(session(), now);
        onChild((v) => fn(v, now));
        touch(now);
      };
      const asParentHousehold = (fn: (h: Household, now: Date) => Household) => {
        const now = new Date();
        assertParent(session(), now);
        commit(fn(hh(), now));
        touch(now);
      };
      /** A new child's starting record: the welcome gift and default settings. */
      const newChildStart = (profile: LearnerProfile, pin: string | null, uiLang: Lang) => {
        const base = { ...createInitialState(), parent: hh().parent, rewards: hh().rewards, settings: { ...DEFAULT_SETTINGS, uiLang } };
        return startProfile(base, profile, pin, new Date());
      };

      const actions: Store['actions'] = {
        finishOnboarding(profile, pin, uiLang) {
          const start = newChildStart(profile, pin, uiLang);
          const { household: next, id } = addChild(
            { ...hh(), parent: start.parent, uiLang },
            { profile, code: null, settings: start.settings, record: { tickets: start.tickets } },
            session(),
            new Date(),
          );
          commit(next);
          setActive(id);
        },
        loadDemo() {
          commit(createDemoHousehold(new Date()));
          setLastOutcome(null);
          setActive(null);
        },
        selectChild(childId, code = '') {
          if (!verifyChildCode(hh(), childId, code)) return false;
          setLastOutcome(null);
          setActive(childId);
          return true;
        },
        signOutChild() {
          setLastOutcome(null);
          setActive(null);
        },
        completeStep(lessonId, step, attempts) {
          const child = boundChild();
          const outcome = completeStep(childView(hh(), child), lessonId, step, attempts, new Date());
          commit(mergeChildView(hh(), child.id, outcome.state));
          setLastOutcome({ ...outcome, lessonId, step });
          return outcome;
        },
        requestReward(rewardId) {
          const now = new Date();
          onChild((v) => evaluateBadges(requestReward(v, rewardId, now), now).state);
        },
        updateChildSettings(patch) {
          if (!findChild(hh(), boundId)) {
            if (patch.uiLang) commit({ ...hh(), uiLang: patch.uiLang });
            return;
          }
          onChild((v) => ({ ...v, settings: { ...v.settings, ...patch } }));
          if (patch.uiLang && boundId === activeRef.current) commit({ ...hh(), uiLang: patch.uiLang });
        },
        unlockParent(pin) {
          const now = new Date();
          if (!verifyPin(hh().parent, pin)) return false;
          setSession({ unlockedAt: now.getTime() });
          return true;
        },
        createParentPin(pin) {
          if (hh().parent.pinHash !== null) throw new Error('A PIN already exists');
          commit({ ...hh(), parent: setPin(hh().parent, pin) });
          setSession({ unlockedAt: Date.now() });
        },
        lockParent() {
          setSession(null);
        },
        changePin(pin) {
          asParentHousehold((h) => ({ ...h, parent: setPin(h.parent, pin) }));
        },
        decideRequest(id, decision) {
          asParent((s, now) => decideRequest(s, id, decision, session(), now));
        },
        fulfillRequest(id) {
          asParent((s, now) => fulfillRequest(s, id, session(), now));
        },
        saveReward(reward) {
          asParentHousehold((h, now) => ({ ...h, rewards: saveReward({ ...emptyView(h) }, reward, session(), now).rewards }));
        },
        removeReward(id) {
          asParentHousehold((h, now) => ({ ...h, rewards: removeReward({ ...emptyView(h) }, id, session(), now).rewards }));
        },
        giftTickets(amount, note) {
          asParent((s, now) => giftTickets(s, amount, note, session(), now));
        },
        updateParentSettings(patch) {
          asParent((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
        },
        updateProfile(patch) {
          asParentHousehold((h, now) => updateChild(h, boundChild().id, { profile: patch }, session(), now));
        },
        addChild(profile, code) {
          const now = new Date();
          assertParent(session(), now);
          const start = newChildStart(profile, null, hh().uiLang);
          const { household: next, id } = addChild(hh(), { profile, code, settings: start.settings, record: { tickets: start.tickets } }, session(), now);
          commit(next);
          touch(now);
          return id;
        },
        updateChild(childId, patch) {
          asParentHousehold((h, now) => updateChild(h, childId, patch, session(), now));
        },
        removeChild(childId) {
          asParentHousehold((h, now) => removeChild(h, childId, session(), now));
          if (activeRef.current === childId) setActive(null);
          actionCache.current.delete(childId);
        },
        resetAll() {
          assertParent(session(), new Date());
          setSession(null);
          setLastOutcome(null);
          setActive(null);
          void repository.clear();
          const fresh = createInitialHousehold(hh().uiLang);
          hhRef.current = fresh;
          setHousehold(fresh);
        },
        resetToDemo() {
          assertParent(session(), new Date());
          setLastOutcome(null);
          setActive(null);
          commit(createDemoHousehold(new Date()));
        },
      };
      actionCache.current.set(boundId, actions);
      return actions;
    },
    [commit, repository, setActive],
  );

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
    if (!household) return null;
    const active = findChild(household, activeChildId);
    const lang: Lang = active ? active.settings.uiLang : household.uiLang;
    const t = (he: string, en: string) => (lang === 'he' ? he : en);
    const parentUnlocked = parentSession !== null;
    const scopedCache = new Map<string, Store>();

    const build = (childId: string | null): Store => {
      const child = findChild(household, childId);
      return {
        state: child ? childView(household, child) : emptyView(household),
        household,
        childId: child?.id ?? null,
        activeChildId: active?.id ?? null,
        lang,
        t,
        parentUnlocked,
        lastOutcome,
        forChild(id) {
          let s = scopedCache.get(id);
          if (!s) {
            s = build(id);
            scopedCache.set(id, s);
          }
          return s;
        },
        actions: actionsFor(child?.id ?? null),
      };
    };
    return build(active?.id ?? null);
  }, [household, activeChildId, parentSession, lastOutcome, actionsFor]);

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
