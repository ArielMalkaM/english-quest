import type { ItemResult, ReviewFormat, ReviewItem } from './types';

/** Sessions to wait before a review item comes back, by Leitner box. */
export const REVIEW_INTERVALS = [1, 2, 4, 7];

const WORD_FORMATS: ReviewFormat[] = ['match', 'spell', 'listen'];
const SENTENCE_FORMATS: ReviewFormat[] = ['bridge', 'gap'];

/** A mistake always returns in a different game format than the one it was missed in. */
export function nextFormat(kind: ReviewItem['kind'], last: ReviewFormat): ReviewFormat {
  const formats = kind === 'word' ? WORD_FORMATS : SENTENCE_FORMATS;
  const i = formats.indexOf(last);
  return formats[(i + 1) % formats.length];
}

function reviewKey(r: ItemResult): { key: string; kind: ReviewItem['kind'] } | null {
  if (r.wordId) return { key: `w:${r.wordId}`, kind: 'word' };
  if (r.sentence) return { key: `s:${r.sentence}`, kind: 'sentence' };
  return null;
}

/**
 * Updates the review queue with one answered item.
 * - Missed (not first try): goes to box 0 and comes back after the NEXT session at the
 *   earliest — never immediately.
 * - Answered first try while due: moves up a box and waits longer; leaves the queue
 *   after the last box (mastered).
 */
export function scheduleReview(
  queue: ReviewItem[],
  result: ItemResult,
  format: ReviewFormat,
  sessionsCompleted: number,
): ReviewItem[] {
  const id = reviewKey(result);
  if (!id) return queue;
  const existing = queue.find((q) => q.key === id.key);

  if (!result.firstTry) {
    const item: ReviewItem = {
      key: id.key,
      kind: id.kind,
      wordId: result.wordId,
      sentence: result.sentence,
      grammar: result.grammar,
      box: 0,
      dueAfterSession: sessionsCompleted + REVIEW_INTERVALS[0],
      lastFormat: format,
      lapses: (existing?.lapses ?? 0) + 1,
    };
    return existing ? queue.map((q) => (q.key === id.key ? item : q)) : [...queue, item];
  }

  if (!existing || existing.dueAfterSession > sessionsCompleted) return queue;
  const box = existing.box + 1;
  if (box >= REVIEW_INTERVALS.length) return queue.filter((q) => q.key !== id.key);
  return queue.map((q) =>
    q.key === id.key
      ? { ...q, box, dueAfterSession: sessionsCompleted + REVIEW_INTERVALS[box], lastFormat: format }
      : q,
  );
}

/** Items ready to return now, most-missed first. */
export function dueReviews(queue: ReviewItem[], sessionsCompleted: number, limit: number): ReviewItem[] {
  return queue
    .filter((q) => q.dueAfterSession <= sessionsCompleted)
    .sort((a, b) => a.box - b.box || b.lapses - a.lapses || a.key.localeCompare(b.key))
    .slice(0, limit);
}
