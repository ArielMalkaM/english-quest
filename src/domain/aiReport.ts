import { GRADE_INFO, GRAMMAR, findLesson, findWord, lessonOrder, weeksFor } from '../data/curriculum';
import { addDays, isInWeekOf, localDate } from './dates';
import { computeStreak, gradeOf, isLessonComplete, nextLessonId, wordMastery } from './progress';
import type { AppState, Lang, Skill, Tally } from './types';

/**
 * A plain-text (Markdown) report a parent can paste into an AI assistant to get advice on
 * what this child should focus on. It contains learning data only: no contact details,
 * and the child's nickname only when the parent chooses to include it.
 */

export interface AiReportOptions {
  includeName: boolean;
  /** Language the AI should answer in. */
  answerLang: Lang;
  now: Date;
}

const SKILL_NAMES: Record<Skill, string> = {
  vocabulary: 'Vocabulary',
  grammar: 'Grammar / literacy patterns',
  reading: 'Reading comprehension',
  listening: 'Listening',
  writing: 'Writing',
  speaking: 'Speaking / dialogue',
  creative: 'Creative tasks',
};

const pct = (t: Tally | undefined) => (t && t.seen > 0 ? `${Math.round((t.correct / t.seen) * 100)}%` : '—');

export function buildAiReport(state: AppState, opts: AiReportOptions): string {
  const { progress, profile } = state;
  const grade = gradeOf(state);
  const info = GRADE_INFO[grade];
  const weeks = weeksFor(grade);
  const order = lessonOrder(grade);
  const who = opts.includeName && profile?.name ? profile.name : 'my child';
  const now = opts.now;
  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);

  // ── Request ──
  push(
    `# English learning report – ${who} (grade ${grade}, Israel)`,
    '',
    '## What I would like from you',
    `You are an experienced teacher of English as a foreign language who knows the Israeli Ministry of Education English curriculum (2020). ${who === 'my child' ? 'My child' : who} is a Hebrew-speaking student in grade ${grade} (${info.he}). Below is data from an English practice app. Please:`,
    '1. Name the 3 most important things to focus on next, and explain why, based on the data.',
    '2. Point out real strengths I can praise.',
    '3. Suggest a 2-week plan of short (10–15 minute) home activities that a Hebrew-speaking parent can run, even with limited English. Keep them playful and age-appropriate.',
    '4. Look at the writing samples: name recurring mistakes (gently) and one concrete improvement for each sample.',
    '5. Tell me if anything in the data suggests the grade level is too easy or too hard.',
    `Please answer in ${opts.answerLang === 'he' ? 'Hebrew' : 'English'}, in short practical points.`,
    '',
  );

  // ── Learner ──
  const firstSession = progress.sessions[0]?.date;
  push(
    '## Learner',
    `- Grade: ${grade} (${info.he})`,
    `- Curriculum stage: ${info.stage}`,
    `- What this stage focuses on: ${info.focus}`,
    '- First language: Hebrew',
    `- Daily goal in the app: ${profile?.dailyGoalMinutes ?? 15} minutes`,
    `- Practising since: ${firstSession ?? 'not started yet'}`,
    '',
  );

  // ── Plan position ──
  const completed = order.filter((id) => isLessonComplete(progress, id)).length;
  const nextId = nextLessonId(progress, grade);
  const next = nextId ? findLesson(nextId) : null;
  const allMinutes = Math.round(progress.attempts.reduce((s, a) => s + a.seconds, 0) / 60);
  const last14 = new Set(progress.sessions.filter((s) => s.date >= localDate(addDays(now, -13))).map((s) => s.date)).size;
  push(
    '## Progress in the grade plan',
    `- Quests completed: ${completed} of ${order.length} (${weeks.length} weekly units, 5 quests each)`,
    next
      ? `- Now in week ${next.week.number}: “${next.week.theme}” – focus: ${next.week.grammarFocus}. Next quest: “${next.lesson.title}”.`
      : '- Every quest in the grade plan is finished.',
    `- Units finished: ${weeks.filter((w) => isLessonComplete(progress, w.lessons[w.lessons.length - 1].id)).map((w) => `${w.number}. ${w.theme} (${w.grammarFocus})`).join('; ') || 'none yet'}`,
    `- Days with a finished quest in the last 14 days: ${last14} · current streak: ${computeStreak(progress.sessions, now)} days`,
    `- Total practice time: about ${allMinutes} minutes over ${progress.sessions.length} quests`,
    '',
  );

  // ── Skills ──
  const skills = (Object.keys(SKILL_NAMES) as Skill[]).filter((k) => (progress.skillStats[k]?.seen ?? 0) > 0);
  push('## Accuracy by skill (answered right on the first try, all time)');
  if (skills.length === 0) push('No answers recorded yet.');
  else {
    push('| Skill | Items answered | First-try correct |', '|---|---|---|');
    for (const k of skills.sort((a, b) => ratio(progress.skillStats[a]) - ratio(progress.skillStats[b]))) {
      push(`| ${SKILL_NAMES[k]} | ${progress.skillStats[k]?.seen ?? 0} | ${pct(progress.skillStats[k])} |`);
    }
  }
  push('');

  // ── Grammar ──
  const grammar = Object.entries(progress.grammarStats).filter(([, t]) => t.seen > 0).sort(([, a], [, b]) => ratio(a) - ratio(b));
  push('## Grammar and literacy topics (weakest first)');
  if (grammar.length === 0) push('No grammar items yet.');
  else {
    push('| Topic | Items | First-try correct |', '|---|---|---|');
    for (const [id, t] of grammar) push(`| ${GRAMMAR[id]?.en ?? id} | ${t.seen} | ${pct(t)} |`);
  }
  push('');

  // ── Words ──
  const lapses = new Map(progress.reviewQueue.filter((r) => r.wordId).map((r) => [r.wordId as string, r.lapses]));
  const weak = Object.entries(progress.wordStats)
    .filter(([id, s]) => (s.seen >= 2 && s.correct / s.seen < 0.6) || (lapses.get(id) ?? 0) > 0)
    .sort(([a, x], [b, y]) => ratio(x) - ratio(y) || (lapses.get(b) ?? 0) - (lapses.get(a) ?? 0))
    .slice(0, 20);
  push('## Words that need more practice');
  if (weak.length === 0) push('None so far.');
  for (const [id, s] of weak) {
    const w = findWord(id);
    if (!w) continue;
    const missed = lapses.get(id);
    push(`- ${w.en} (${w.he}) – ${s.correct}/${s.seen} right first try${missed ? `, missed ${missed}×, scheduled for review` : ''}`);
  }
  const mastered = Object.entries(progress.wordStats).filter(([, s]) => wordMastery(s) === 3).map(([id]) => findWord(id)?.en).filter(Boolean);
  push('', `## Words already mastered (${mastered.length})`, mastered.length ? (mastered as string[]).slice(0, 40).join(', ') : 'None yet.', '');

  // ── Sentences to review ──
  const sentences = progress.reviewQueue.filter((r) => r.kind === 'sentence' && r.sentence).sort((a, b) => b.lapses - a.lapses).slice(0, 8);
  if (sentences.length > 0) {
    push('## Sentences answered wrong and waiting for review');
    for (const r of sentences) push(`- “${r.sentence}”${r.grammar && GRAMMAR[r.grammar] ? ` (${GRAMMAR[r.grammar].en})` : ''}`);
    push('');
  }

  // ── This week ──
  const week = progress.attempts.filter((a) => isInWeekOf(a.finishedAt, now));
  const weekSessions = progress.sessions.filter((s) => isInWeekOf(s.completedAt, now));
  push(
    '## This week (Sunday–Saturday)',
    `- Quests finished: ${weekSessions.length} · minutes: ${Math.round(week.reduce((s, a) => s + a.seconds, 0) / 60)}`,
    `- Activities: ${week.length ? summarizeSkills(week.map((a) => a.skill)) : 'none yet'}`,
    '',
  );

  // ── Writing ──
  const writing = progress.attempts.filter((a) => a.text && a.text.trim()).slice(-6);
  push('## Writing samples (most recent, exactly as typed)');
  if (writing.length === 0) push(grade === 2 ? 'Grade 2 is oral only – no writing tasks.' : 'No writing yet.');
  writing.forEach((a, i) => {
    const lesson = findLesson(a.lessonId);
    const task = lesson ? `${lesson.lesson.title} – ${a.step === 'create' ? lesson.lesson.create.title : a.step}` : a.step;
    push(`${i + 1}. “${(a.text ?? '').trim()}” (${a.finishedAt.slice(0, 10)}, task: ${task})`);
  });
  push(
    '',
    '## How to read this data',
    '- “First try” = correct without help. After a miss the app gives one clue; after a second miss it shows the answer and brings the item back on a later day in a different game format.',
    '- Mistakes never cost points, and speed is not rewarded, so low accuracy means “needs practice”, not “rushed”.',
    `- Report created ${localDate(now)} by the English Quest app.`,
  );
  return lines.join('\n');
}

function ratio(t: Tally | undefined): number {
  return t && t.seen > 0 ? t.correct / t.seen : 1;
}

function summarizeSkills(skills: Skill[]): string {
  const counts = new Map<Skill, number>();
  for (const s of skills) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${SKILL_NAMES[s].toLowerCase()} ×${n}`).join(', ');
}
