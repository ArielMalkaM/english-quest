import { describe, expect, it } from 'vitest';
import { rankVoice } from './speech';

const voice = (name: string, lang = 'en-US', localService = true) => ({ name, lang, localService });

function best(voices: ReturnType<typeof voice>[]): string | undefined {
  return voices
    .map((v) => ({ v, score: rankVoice(v) }))
    .filter((x): x is { v: ReturnType<typeof voice>; score: number } => x.score !== null)
    .sort((a, b) => a.score - b.score)[0]?.v.name;
}

describe('rankVoice', () => {
  it('prefers a natural American voice over robotic and British ones', () => {
    expect(
      best([
        voice('Microsoft Hazel - English (United Kingdom)', 'en-GB'),
        voice('Microsoft David - English (United States)'),
        voice('Microsoft Zira - English (United States)'),
        voice('Microsoft Jenny Online (Natural) - English (United States)', 'en-US', false),
      ]),
    ).toBe('Microsoft Jenny Online (Natural) - English (United States)');
  });

  it('picks Google US English in Chrome over the Windows voices', () => {
    expect(
      best([
        voice('Microsoft David - English (United States)'),
        voice('Microsoft Zira - English (United States)'),
        voice('Google UK English Female', 'en-GB', false),
        voice('Google US English', 'en-US', false),
      ]),
    ).toBe('Google US English');
  });

  it('picks the clear female Windows voice when that is all there is', () => {
    expect(
      best([
        voice('Microsoft David - English (United States)'),
        voice('Microsoft Mark - English (United States)'),
        voice('Microsoft Zira - English (United States)'),
      ]),
    ).toBe('Microsoft Zira - English (United States)');
  });

  it('never uses novelty voices or non-English voices', () => {
    expect(rankVoice(voice('Bubbles'))).toBeNull();
    expect(rankVoice(voice('Zarvox'))).toBeNull();
    expect(rankVoice(voice('Grandma (English (US))'))).toBeNull();
    expect(rankVoice(voice('Microsoft Asaf - Hebrew (Israel)', 'he-IL'))).toBeNull();
    expect(best([voice('Bells'), voice('Samantha')])).toBe('Samantha');
  });

  it('handles Android-style language tags', () => {
    expect(rankVoice(voice('English United States', 'en_US'))).not.toBeNull();
  });
});
