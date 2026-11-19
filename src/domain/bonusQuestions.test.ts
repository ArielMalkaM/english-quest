import { describe, expect, it } from 'vitest';
import { findLesson, findWord, lessonOrder, weekOfWord, weeksFor } from '../data/curriculum';
import { childAfter, newChild } from '../test/bonusFixtures';
import type { GateQuestion, QuestionKind } from './bonusQuestions';
import { GATE_SECONDS, createQuestionDeck, isValidQuestion } from './bonusQuestions';
import type { AppState, Grade } from './types';
import { GRADES } from './types';

const HEBREW = /[֐-׿]/;

/** Small deterministic random generator so failures can be reproduced. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const ALLOWED: Record<Grade, QuestionKind[]> = {
  2: ['listen-pick'],
  3: ['he-to-en', 'en-to-pic'],
  4: ['he-to-en', 'en-to-pic', 'gap', 'grammar'],
  5: ['he-to-en', 'gap', 'grammar', 'reply'],
  6: ['he-to-en', 'gap', 'grammar', 'reply'],
};

const label = (o: GateQuestion['options'][number]) => o.text || o.emoji || '';

/** Checks that the marked answer really is right, against the curriculum the question came from. */
function checkAnswer(q: GateQuestion) {
  const right = q.options[q.answer];
  if (q.wordId) {
    const w = findWord(q.wordId);
    expect(w, q.key).toBeDefined();
    if (!w) return;
    if (q.kind === 'listen-pick' || q.kind === 'en-to-pic') {
      expect(right.emoji, q.key).toBe(w.emoji);
      // Every picture carries its Hebrew word, like the app's listening games.
      expect(right.he, q.key).toBe(w.he);
      expect(q.options.every((o) => o.emoji && o.he && HEBREW.test(o.he)), q.key).toBe(true);
      expect(q.prompt).toBe(w.en);
    } else {
      expect(right.text, q.key).toBe(w.en);
    }
    if (q.kind === 'he-to-en') expect(q.prompt).toBe(w.he);
    if (q.kind === 'gap') expect(q.prompt.replace('___', w.en).toLowerCase()).toBe(w.example.toLowerCase());
    // Distractors are other real words, never the answer again.
    for (const [i, o] of q.options.entries()) {
      if (i === q.answer) continue;
      expect(label(o), q.key).not.toBe(label(right));
      if (o.he) expect(o.he, q.key).not.toBe(right.he);
    }
    return;
  }
  const [kind, lessonId] = q.key.split(':');
  const lesson = findLesson(lessonId)?.lesson;
  expect(lesson, q.key).toBeDefined();
  if (!lesson) return;
  const acts = [lesson.learn, lesson.mission, lesson.create];
  if (kind === 'grammar') {
    const item = acts.flatMap((a) => (a.type === 'choice' ? a.items : [])).find((it) => it.prompt === q.prompt);
    expect(item, q.key).toBeDefined();
    expect(right.text).toBe(item?.options[item.answer]);
    expect(q.options.every((o) => item?.options.includes(o.text))).toBe(true);
  } else if (kind === 'reply') {
    const turn = acts.flatMap((a) => (a.type === 'dialogue' ? a.turns : [])).find((t) => t.says === q.prompt);
    expect(turn, q.key).toBeDefined();
    expect(turn?.options.find((o) => o.text === right.text)?.ok).toBe(true);
    for (const [i, o] of q.options.entries()) if (i !== q.answer) expect(turn?.options.find((x) => x.text === o.text)?.ok).toBe(false);
  }
}

function draw(state: AppState, n: number, seed = 7): GateQuestion[] {
  const deck = createQuestionDeck(state, seeded(seed));
  return Array.from({ length: n }, () => deck.next());
}

/** Progress points to test per grade: just started, mid week 1, end of week 1, mid-plan, plan finished. */
function checkpoints(grade: Grade): number[] {
  const total = lessonOrder(grade).length;
  return [...new Set([1, 3, 5, 6, Math.floor(total / 2), total])];
}

describe.each(GRADES)('grade %i', (grade) => {
  it.each(checkpoints(grade))('after %i quests: valid, correct, on-level questions', (done) => {
    for (const metWords of [false, true]) {
      const state = childAfter(grade, done, { metWords });
      const reachedLessons = lessonOrder(grade).slice(0, Math.min(done + 1, lessonOrder(grade).length));
      const reachedWeeks = new Set(reachedLessons.map((id) => findLesson(id)?.week.number));
      const completed = new Set(lessonOrder(grade).slice(0, done));
      const qs = draw(state, 120, done * 31 + (metWords ? 1 : 0));

      for (const q of qs) {
        expect(isValidQuestion(q), q.key).toBe(true);
        expect(ALLOWED[grade], q.key).toContain(q.kind);
        checkAnswer(q);
        // Gates are English (or pictures); the length limit keeps them readable on a phone.
        for (const o of q.options) {
          expect(HEBREW.test(o.text), q.key).toBe(false);
          expect(o.text.length, q.key).toBeLessThanOrEqual(q.kind === 'reply' ? 26 : 24);
        }
        if (q.kind === 'he-to-en') expect(HEBREW.test(q.prompt)).toBe(true);
        else expect(HEBREW.test(q.prompt), q.key).toBe(false);
        // Never beyond what the child has reached in their own grade's plan.
        if (q.wordId) {
          const week = weekOfWord(q.wordId);
          expect(week?.grade, q.key).toBe(grade);
          expect(reachedWeeks.has(week?.number), q.key).toBe(true);
          if (metWords) expect(state.progress.wordStats[q.wordId], `${q.key} should be a word already met`).toBeDefined();
        } else {
          expect(completed.has(q.key.split(':')[1]), `${q.key} should come from a finished quest`).toBe(true);
        }
      }
      // No question (or word) twice in a row.
      for (let i = 1; i < qs.length; i++) {
        expect(qs[i].key).not.toBe(qs[i - 1].key);
        if (qs[i].wordId) expect(qs[i].wordId).not.toBe(qs[i - 1].wordId);
      }
      // Every available question is asked once before any comes back.
      const poolSize = new Set(draw(state, 600, 99).map((q) => q.key)).size;
      const firstRound = Math.min(poolSize, qs.length);
      expect(new Set(qs.slice(0, firstRound).map((q) => q.key)).size).toBe(firstRound);
    }
  });

  it('every kind of question for the grade actually appears', () => {
    const qs = draw(childAfter(grade, lessonOrder(grade).length), 200);
    expect(new Set(qs.map((q) => q.kind))).toEqual(new Set(ALLOWED[grade]));
  });

  it('answer positions are spread over the gates', () => {
    const qs = draw(childAfter(grade, 10), 150);
    const counts = [0, 0, 0];
    for (const q of qs) counts[q.answer]++;
    for (const c of counts) expect(c).toBeGreaterThan(qs.length * 0.15);
  });
});

describe('content selection', () => {
  it('grade 2 is listening only: every question is spoken and answered with pictures', () => {
    for (const q of draw(childAfter(2, 10), 60)) {
      expect(q.say).toBe(q.prompt);
      expect(q.options.every((o) => o.text === '' && Boolean(o.emoji))).toBe(true);
    }
  });

  it('words the child often gets wrong come back more often', () => {
    const base = childAfter(3, 5, { metWords: true });
    const weak = weeksFor(3)[0].words[0];
    const state: AppState = {
      ...base,
      progress: { ...base.progress, wordStats: { ...base.progress.wordStats, [weak.id]: { seen: 6, correct: 1, streak: 0 } } },
    };
    const avgFirst = (s: AppState) => {
      let sum = 0;
      for (let seed = 1; seed <= 150; seed++) {
        const i = draw(s, 30, seed).findIndex((q) => q.wordId === weak.id);
        sum += i < 0 ? 30 : i;
      }
      return sum / 150;
    };
    const reinforced = avgFirst(state);
    // Asked within the first few questions, much earlier than the same word would come normally.
    expect(reinforced).toBeLessThan(3);
    expect(reinforced).toBeLessThan(avgFirst(base) / 2);
  });

  it('a child whose grade was changed gets the first week of the new plan', () => {
    const sixth = childAfter(6, 8);
    const moved: AppState = { ...sixth, profile: sixth.profile && { ...sixth.profile, grade: 3 } };
    for (const q of draw(moved, 40)) {
      expect(q.wordId && weekOfWord(q.wordId)).toMatchObject({ grade: 3, number: 1 });
    }
  });

  it('a brand-new child (nothing finished) still gets a working game', () => {
    for (const grade of GRADES) {
      const qs = draw(newChild(grade), 20);
      expect(qs.every(isValidQuestion)).toBe(true);
    }
  });

  it('gives younger children more time per gate', () => {
    for (let i = 1; i < GRADES.length; i++) expect(GATE_SECONDS[GRADES[i]]).toBeLessThanOrEqual(GATE_SECONDS[GRADES[i - 1]]);
    expect(GATE_SECONDS[6]).toBeGreaterThanOrEqual(5);
  });

  it('rejects malformed questions', () => {
    const ok: GateQuestion = { key: 'k', kind: 'he-to-en', ask: { en: '', he: '' }, prompt: 'x', promptLang: 'he', options: [{ text: 'a' }, { text: 'b' }], answer: 1 };
    expect(isValidQuestion(ok)).toBe(true);
    expect(isValidQuestion({ ...ok, answer: 2 })).toBe(false);
    expect(isValidQuestion({ ...ok, answer: -1 })).toBe(false);
    expect(isValidQuestion({ ...ok, options: [{ text: 'a' }, { text: 'a' }] })).toBe(false);
    expect(isValidQuestion({ ...ok, options: [{ text: 'a' }] })).toBe(false);
    expect(isValidQuestion({ ...ok, options: [{ text: 'a' }, { text: ' ' }] })).toBe(false);
    expect(isValidQuestion({ ...ok, options: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }] })).toBe(false);
  });
});
