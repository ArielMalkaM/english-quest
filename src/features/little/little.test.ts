import { describe, expect, it } from 'vitest';
import { MAX_STARS, ROUNDS, buildRounds, choicesFor, parseProgress, starsOf, withGame, withLooked } from './game';
import { LITTLE_TOPICS, askFor, findTopic } from './topics';

describe('Little Explorers topics', () => {
  it('has picture words with unique ids in every topic', () => {
    const ids = LITTLE_TOPICS.flatMap((t) => t.words.map((w) => w.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(LITTLE_TOPICS.map((t) => t.id)).size).toBe(LITTLE_TOPICS.length);
    for (const topic of LITTLE_TOPICS) {
      expect(topic.words.length).toBeGreaterThanOrEqual(5);
      for (const w of topic.words) {
        expect(w.emoji.trim()).not.toBe('');
        expect(w.he.trim()).not.toBe('');
        expect(w.en).toMatch(/^[a-z ]+$/);
      }
      // Pictures must look different, or the game cannot be solved.
      expect(new Set(topic.words.map((w) => `${w.emoji}×${w.count ?? 1}`)).size).toBe(topic.words.length);
    }
  });

  it('stays away from the newest emoji block, which Windows 10 cannot draw', () => {
    for (const e of LITTLE_TOPICS.flatMap((t) => [...t.words.map((x) => x.emoji), t.emoji])) {
      for (const ch of e) expect(ch.codePointAt(0) ?? 0).toBeLessThan(0x1fa70);
    }
  });

  it('asks with or without "the"', () => {
    const animals = findTopic('animals')!;
    const colors = findTopic('colors')!;
    expect(askFor(animals, animals.words[0])).toBe('Find the dog!');
    expect(askFor(colors, colors.words[0])).toBe('Find red!');
  });
});

describe('Find it! rounds', () => {
  it('starts easy and always includes the target once among different pictures', () => {
    for (const topic of LITTLE_TOPICS) {
      for (const seed of [1, 42, 2026]) {
        const rounds = buildRounds(topic, seed);
        expect(rounds).toHaveLength(ROUNDS);
        rounds.forEach((r, i) => {
          expect(r.options).toHaveLength(choicesFor(i));
          expect(r.options.filter((o) => o.id === r.target.id)).toHaveLength(1);
          expect(new Set(r.options.map((o) => o.id)).size).toBe(r.options.length);
        });
      }
    }
    expect(choicesFor(0)).toBe(2);
    expect(choicesFor(2)).toBe(3);
  });

  it('asks every word before repeating and never the same word twice in a row', () => {
    const numbers = findTopic('numbers')!; // 5 words, 6 rounds
    for (let seed = 1; seed < 50; seed++) {
      const targets = buildRounds(numbers, seed).map((r) => r.target.id);
      expect(new Set(targets.slice(0, 5)).size).toBe(5);
      targets.forEach((id, i) => {
        if (i > 0) expect(id).not.toBe(targets[i - 1]);
      });
    }
  });

  it('is the same game for the same seed', () => {
    const animals = findTopic('animals')!;
    expect(buildRounds(animals, 7)).toEqual(buildRounds(animals, 7));
  });
});

describe('Little Explorers stars', () => {
  it('gives a star for meeting the words and one per game, up to three', () => {
    let p = {};
    expect(starsOf(p, 'animals')).toBe(0);
    p = withLooked(p, 'animals');
    expect(starsOf(p, 'animals')).toBe(1);
    p = withLooked(p, 'animals');
    expect(starsOf(p, 'animals')).toBe(1);
    for (let i = 0; i < 5; i++) p = withGame(p, 'animals');
    expect(starsOf(p, 'animals')).toBe(MAX_STARS);
    expect(starsOf(p, 'colors')).toBe(0);
  });

  it('reads saved stars safely', () => {
    expect(parseProgress(null)).toEqual({});
    expect(parseProgress('not json')).toEqual({});
    expect(parseProgress('[1,2]')).toEqual({});
    expect(parseProgress(JSON.stringify({ animals: { looked: true, games: 2 }, fruit: { games: -3 }, bad: 5 }))).toEqual({
      animals: { looked: true, games: 2 },
      fruit: { looked: false, games: 0 },
    });
  });
});
