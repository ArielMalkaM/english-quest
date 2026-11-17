import { describe, expect, it } from 'vitest';
import { CURRICULA, LESSON_ORDER, findLesson, lessonOrder, weeksFor } from '../data/curriculum';
import { MIGRATED_CHILD_ID, parseSaved } from '../data/repository';
import { DEFAULT_SETTINGS, DEMO_CHILD_CODE, createDemoHousehold, createDemoState, createInitialHousehold, createInitialState, startProfile } from '../data/seed';
import { buildAiReport } from './aiReport';
import { buildWarmup, stepActivities } from './dailyPlan';
import {
  HouseholdError,
  addChild,
  childView,
  findChild,
  mergeChildView,
  removeChild,
  updateChild,
  verifyChildCode,
} from './household';
import { NotAuthorizedError, setPin } from './parentAuth';
import { badgesFor, isLessonComplete, isLessonUnlocked, nextLessonId } from './progress';
import { completeStep } from './session';
import { balance } from './tickets';
import { CORE_STEPS, GRADES } from './types';
import type { AppState, Grade, LearnerProfile, StepId } from './types';

const NOW = new Date(2026, 10, 16, 17, 0, 0);
const parent = { unlockedAt: NOW.getTime() };

const profile = (name: string, grade: Grade): LearnerProfile => ({
  name,
  grade,
  avatar: { emoji: '🦊', color: '#fff', gear: '🧭' },
  favoriteTheme: 'Animals',
  dailyGoalMinutes: 15,
  createdAt: NOW.toISOString(),
});

function playLesson(state: AppState, lessonId: string): AppState {
  return CORE_STEPS.reduce(
    (s, step) =>
      completeStep(s, lessonId, step, [{ activityType: 'choice', skill: 'grammar', seconds: 60, items: [{ key: 'k', firstTry: true, solved: true }] }], NOW).state,
    state,
  );
}

describe('saved data from before multi-child support', () => {
  it('upgrades a version-1 save into a household and keeps every quest, ticket and request', () => {
    const v1 = createDemoState(NOW);
    const { profile: p, ...rest } = v1;
    const legacy = { ...rest, version: 1, profile: { ...p!, grade: undefined } };
    const result = parseSaved(JSON.stringify(legacy));
    expect(result?.migrated).toBe(true);
    const h = result!.household;
    expect(h.children).toHaveLength(1);
    const child = h.children[0];
    expect(child.id).toBe(MIGRATED_CHILD_ID);
    expect(child.profile.grade).toBe(6);
    expect(child.profile.name).toBe('Noam');
    expect(child.progress).toEqual(v1.progress);
    expect(child.tickets).toEqual(v1.tickets);
    expect(child.requests).toEqual(v1.requests);
    expect(h.parent).toEqual(v1.parent);
    expect(h.rewards).toEqual(v1.rewards);
    expect(child.codeHash).toBeNull();
    // Same view as before, so the grade 6 plan continues where it stopped.
    const view = childView(h, child);
    expect(balance(view.tickets)).toBe(balance(v1.tickets));
    expect(nextLessonId(view.progress, 6)).toBe('w2d2');
  });

  it('reads a household save as-is and ignores unfinished or unknown saves', () => {
    const h = createDemoHousehold(NOW);
    expect(parseSaved(JSON.stringify(h))).toEqual({ household: h, migrated: false });
    expect(parseSaved(JSON.stringify({ ...createInitialState(), version: 1 }))).toBeNull();
    expect(parseSaved(JSON.stringify({ version: 99 }))).toBeNull();
  });
});

describe('several children on one device', () => {
  const base = () => {
    const h = createInitialHousehold('he');
    const first = addChild({ ...h, parent: setPin(h.parent, '1234') }, { profile: profile('Dana', 5), code: null, settings: DEFAULT_SETTINGS }, null, NOW);
    return first;
  };

  it('adds the first child without a parent session but needs the parent for more', () => {
    const { household, id } = base();
    expect(findChild(household, id)?.profile.grade).toBe(5);
    expect(() => addChild(household, { profile: profile('Ori', 3), code: null, settings: DEFAULT_SETTINGS }, null, NOW)).toThrowError(NotAuthorizedError);
    const second = addChild(household, { profile: profile('Ori', 3), code: '2468', settings: DEFAULT_SETTINGS }, parent, NOW);
    expect(second.household.children).toHaveLength(2);
    expect(second.id).not.toBe(id);
  });

  it('keeps each child’s progress, tickets and requests separate', () => {
    const { household, id: dana } = base();
    const { household: h2, id: ori } = addChild(household, { profile: profile('Ori', 3), code: null, settings: DEFAULT_SETTINGS }, parent, NOW);
    const danaView = playLesson(childView(h2, findChild(h2, dana)!), 'g5w1d1');
    const h3 = mergeChildView(h2, dana, danaView);
    expect(findChild(h3, dana)!.progress.sessions).toHaveLength(1);
    expect(findChild(h3, ori)!.progress.sessions).toHaveLength(0);
    expect(balance(findChild(h3, dana)!.tickets)).toBeGreaterThan(balance(findChild(h3, ori)!.tickets));
  });

  it('checks each child’s sign-in code and stores only a hash', () => {
    const { household } = base();
    const { household: h, id } = addChild(household, { profile: profile('Ori', 3), code: '2468', settings: DEFAULT_SETTINGS }, parent, NOW);
    expect(findChild(h, id)!.codeHash).not.toBe('2468');
    expect(verifyChildCode(h, id, '2468')).toBe(true);
    expect(verifyChildCode(h, id, '1111')).toBe(false);
    expect(verifyChildCode(h, 'missing', '2468')).toBe(false);
    expect(() => addChild(h, { profile: profile('X', 4), code: '12', settings: DEFAULT_SETTINGS }, parent, NOW)).toThrowError(HouseholdError);
  });

  it('lets only a parent edit grade and code, or remove a child — never the last one', () => {
    const { household, id } = base();
    expect(() => updateChild(household, id, { profile: { grade: 3 } }, null, NOW)).toThrowError(NotAuthorizedError);
    const edited = updateChild(household, id, { profile: { grade: 3 }, code: '1357' }, parent, NOW);
    expect(findChild(edited, id)!.profile.grade).toBe(3);
    expect(verifyChildCode(edited, id, '1357')).toBe(true);
    const cleared = updateChild(edited, id, { code: null }, parent, NOW);
    expect(verifyChildCode(cleared, id, '')).toBe(true);
    expect(() => removeChild(cleared, id, parent, NOW)).toThrowError(HouseholdError);
    const { household: two, id: other } = addChild(cleared, { profile: profile('Ori', 2), code: null, settings: DEFAULT_SETTINGS }, parent, NOW);
    expect(() => removeChild(two, other, null, NOW)).toThrowError(NotAuthorizedError);
    expect(removeChild(two, other, parent, NOW).children).toHaveLength(1);
  });

  it('seeds a two-child demo with a protected second child', () => {
    const h = createDemoHousehold(NOW);
    expect(h.children.map((c) => [c.profile.name, c.profile.grade])).toEqual([['Noam', 6], ['Maya', 3]]);
    const maya = h.children[1];
    expect(verifyChildCode(h, maya.id, DEMO_CHILD_CODE)).toBe(true);
    expect(maya.progress.sessions).toHaveLength(3);
    expect(nextLessonId(maya.progress, 3)).toBe('g3w1d4');
    expect(createDemoHousehold(NOW)).toEqual(h);
  });
});

describe('a separate plan for every grade', () => {
  it('has six weeks of five quests with twelve words for grades 2–6, and unique ids across grades', () => {
    const all: string[] = [];
    for (const g of GRADES) {
      const weeks = weeksFor(g);
      expect(weeks).toHaveLength(6);
      for (const w of weeks) {
        expect(w.grade).toBe(g);
        expect(w.lessons).toHaveLength(5);
        expect(w.words).toHaveLength(12);
        expect(w.lessons[4].boss).toBe(true);
        for (const word of w.words) expect(word.example.toLowerCase()).toContain(word.en.toLowerCase());
      }
      all.push(...lessonOrder(g));
    }
    expect(new Set(all).size).toBe(all.length);
    expect(lessonOrder(6)).toEqual(LESSON_ORDER);
    expect(LESSON_ORDER[0]).toBe('w1d1'); // grade 6 ids unchanged, so saved progress still matches
  });

  it('has valid answers in every generated activity', () => {
    for (const g of [2, 3, 4, 5] as Grade[]) {
      const acts = CURRICULA[g].flatMap((w) => w.lessons.flatMap((l) => [l.learn, l.mission, l.create]));
      expect(new Set(acts.map((a) => a.id)).size).toBe(acts.length);
      for (const a of acts) {
        if (a.type === 'choice') for (const it of a.items) {
          expect(it.prompt).toContain('___');
          expect(it.options[it.answer]).toBeDefined();
          expect(new Set(it.options).size).toBe(it.options.length);
        }
        if (a.type === 'listen') for (const it of a.items) {
          expect(it.options[it.answer]).toBeDefined();
          expect(new Set(it.options.map((o) => o.label)).size).toBe(it.options.length);
        }
        if (a.type === 'match') expect(new Set(a.pairs.map((p) => p.b)).size).toBe(a.pairs.length);
        if (a.type === 'reading') for (const q of a.questions) {
          if (q.options) expect(q.options[q.answer ?? -1]).toBeDefined();
          if (q.evidence !== undefined) expect(a.lines[q.evidence]).toBeDefined();
        }
        if (a.type === 'dialogue') for (const turn of a.turns) expect(turn.options.filter((o) => o.ok)).toHaveLength(1);
        if (a.type === 'sort') for (const it of a.items) expect(a.buckets[it.bucket]).toBeDefined();
        if (a.type === 'spell') for (const it of a.items) expect(it.clue).toContain('___');
      }
    }
  });

  it('keeps grade 2 oral: nothing to read on your own or type, in any step', () => {
    const progress = createInitialState().progress;
    const written = new Set(['spell', 'write', 'build', 'scene', 'bridge', 'choice', 'reading', 'speed']);
    for (const id of lessonOrder(2)) {
      for (const step of [...CORE_STEPS, 'bonus'] as StepId[]) {
        const acts = stepActivities(id, step, progress);
        expect(acts.length).toBeGreaterThanOrEqual(1);
        for (const a of acts) expect(written.has(a.type), `${id} ${step} ${a.type}`).toBe(false);
      }
    }
  });

  it('gives every quest of grades 3–5 a warm-up, three activities and a bonus', () => {
    const progress = createInitialState().progress;
    for (const g of [3, 4, 5] as Grade[]) {
      for (const id of lessonOrder(g)) {
        for (const step of [...CORE_STEPS, 'bonus'] as StepId[]) expect(stepActivities(id, step, progress).length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('brings grade 2 mistakes back by listening, never spelling', () => {
    let s = startProfile(createInitialState(), profile('Tal', 2), null, NOW);
    const word = weeksFor(2)[0].words[0];
    s = completeStep(s, 'g2w1d1', 'learn', [{ activityType: 'listen', skill: 'listening', seconds: 30, items: [{ key: 'x', wordId: word.id, firstTry: false, solved: true }] }], NOW).state;
    s = completeStep(s, 'g2w1d1', 'warmup', [], NOW).state;
    s = completeStep(s, 'g2w1d1', 'mission', [], NOW).state;
    s = completeStep(s, 'g2w1d1', 'create', [], NOW).state;
    const warm = buildWarmup(weeksFor(2)[0], 1, s.progress);
    expect(warm.some((a) => a.id.startsWith('review-'))).toBe(true);
    expect(warm.some((a) => a.type === 'spell')).toBe(false);
  });

  it('unlocks quests within the child’s own grade plan, and has week badges per grade', () => {
    const s = startProfile(createInitialState(), profile('Ori', 4), null, NOW);
    expect(nextLessonId(s.progress, 4)).toBe('g4w1d1');
    expect(isLessonUnlocked(s.progress, 'g4w1d1')).toBe(true);
    expect(isLessonUnlocked(s.progress, 'g4w1d2')).toBe(false);
    expect(findLesson('g4w1d1')?.week.grade).toBe(4);
    let p = s;
    for (const id of lessonOrder(4).slice(0, 5)) p = playLesson(p, id);
    expect(isLessonComplete(p.progress, 'g4w1d5')).toBe(true);
    expect(p.progress.badges.map((b) => b.id)).toContain('g4-week-1');
    expect(badgesFor(6).some((b) => b.id === 'week-1')).toBe(true);
  });
});

describe('data ready for several devices', () => {
  it('upgrades a version-2 save: adds versions, keeps every record and id', () => {
    const v3 = createDemoHousehold(NOW);
    const v2 = {
      ...v3,
      version: 2,
      rev: undefined,
      updatedAt: undefined,
      children: v3.children.map((c) => ({ ...c, rev: undefined, updatedAt: undefined })),
    };
    const result = parseSaved(JSON.stringify(v2), NOW);
    expect(result?.migrated).toBe(true);
    const h = result!.household;
    expect(h.version).toBe(3);
    expect(h.rev).toBe(1);
    expect(h.children.every((c) => c.rev === 1 && c.updatedAt === NOW.toISOString())).toBe(true);
    expect(h.children.map((c) => c.tickets)).toEqual(v3.children.map((c) => c.tickets));
    expect(h.children.map((c) => c.progress)).toEqual(v3.children.map((c) => c.progress));
  });

  it('gives new tickets, attempts and requests ids that two devices will not both create', () => {
    const start = startProfile(createInitialState(), profile('Dana', 5), null, NOW);
    const deviceA = playLesson(start, 'g5w1d1');
    const deviceB = playLesson(start, 'g5w1d1');
    const shared = new Set(start.tickets.map((x) => x.id)); // the welcome gift both devices started from
    const idsA = [...deviceA.tickets, ...deviceA.progress.attempts].map((x) => x.id).filter((id) => !shared.has(id));
    const idsB = new Set([...deviceB.tickets, ...deviceB.progress.attempts].map((x) => x.id));
    expect(new Set(idsA).size).toBe(idsA.length);
    expect(idsA.some((id) => idsB.has(id))).toBe(false);
    expect(idsA.every((id) => /^(tx|at)-[0-9a-z]{16}$/.test(id))).toBe(true);
  });

  it('counts a version up for the child that changed, and for the shared part only when it changed', () => {
    const h = createDemoHousehold(NOW);
    const [noam, maya] = h.children;
    const later = new Date(NOW.getTime() + 60_000);
    const played = mergeChildView(h, noam.id, { ...childView(h, noam), settings: { ...noam.settings, sound: false } }, later);
    expect(findChild(played, noam.id)!.rev).toBe(noam.rev + 1);
    expect(findChild(played, noam.id)!.updatedAt).toBe(later.toISOString());
    expect(findChild(played, maya.id)).toBe(maya);
    expect(played.rev).toBe(h.rev);
    const rewards = mergeChildView(h, noam.id, { ...childView(h, noam), rewards: h.rewards.slice(1) }, later);
    expect(rewards.rev).toBe(h.rev + 1);
    const edited = updateChild(h, maya.id, { profile: { grade: 4 } }, parent, later);
    expect(findChild(edited, maya.id)!.rev).toBe(maya.rev + 1);
  });
});

describe('AI report', () => {
  it('describes grade, curriculum stage, weak spots and writing, without the name by default', () => {
    const h = createDemoHousehold(NOW);
    const noam = childView(h, h.children[0]);
    const report = buildAiReport(noam, { includeName: false, answerLang: 'he', now: NOW });
    expect(report).toContain('grade 6');
    expect(report).toContain('Band I');
    expect(report).toContain('Please answer in Hebrew');
    expect(report).toContain('## Writing samples');
    expect(report).toContain('Quests completed: 6 of 30');
    expect(report).not.toContain('Noam');
    expect(buildAiReport(noam, { includeName: true, answerLang: 'en', now: NOW })).toContain('Noam');
  });

  it('works for a grade 2 child who has not played yet', () => {
    const s = startProfile(createInitialState(), profile('Tal', 2), null, NOW);
    const report = buildAiReport(s, { includeName: false, answerLang: 'en', now: NOW });
    expect(report).toContain('Pre-Foundation');
    expect(report).toContain('Quests completed: 0 of 30');
  });
});
