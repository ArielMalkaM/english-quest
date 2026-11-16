import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, En, SpeakButton } from '../../components/ui';
import type { ChoiceActivity, ItemResult, ListenActivity, SpeedActivity, SpellActivity } from '../../domain/types';
import { canSpeak, chime, speak } from '../../lib/speech';
import { normalize } from '../../lib/text';
import { useStore } from '../../state/store';
import { Counter, FeedbackBar, useRound } from './shared';
import type { GameProps } from './shared';

// ───────────────────────── Story gaps (grammar in context) ─────────────────────────

export function ChoiceGame({ activity, onDone }: GameProps<ChoiceActivity>) {
  const meta = useCallback(
    (i: number) => {
      const it = activity.items[i];
      return { key: `${activity.id}:${i}`, grammar: activity.grammar, sentence: it.prompt.replace('___', it.options[it.answer]) };
    },
    [activity],
  );
  const round = useRound(activity.items.length, meta, onDone);
  const [wrong, setWrong] = useState<number[]>([]);
  const item = activity.items[round.index];
  const [before, after] = item.prompt.split('___');
  const answer = item.options[item.answer];

  const pick = (i: number) => {
    if (i === item.answer) round.submit(true);
    else {
      setWrong((w) => [...w, i]);
      round.submit(false);
    }
  };

  return (
    <div className="game">
      {activity.intro && <En as="p" className="story-intro">{activity.intro}</En>}
      <Counter index={round.index} total={round.total} />
      <En as="p" className="prompt-big">
        {before}
        <span className={`blank ${round.finished ? 'filled' : ''}`}>{round.finished ? answer : '     '}</span>
        {after}
      </En>
      <div className="options" dir="ltr">
        {item.options.map((o, i) => (
          <button
            key={`${round.index}-${i}`}
            type="button"
            lang="en"
            className={`option ${round.finished && i === item.answer ? 'correct' : ''} ${wrong.includes(i) ? 'wrong' : ''}`}
            disabled={round.finished || wrong.includes(i)}
            onClick={() => pick(i)}
          >
            {o.trim()}
          </button>
        ))}
      </div>
      <FeedbackBar
        phase={round.phase}
        index={round.index}
        clue={<span dir="rtl" lang="he">{item.why}</span>}
        explain={<span dir="rtl" lang="he">{item.why}</span>}
        answer={<><En as="div">{meta(round.index).sentence}</En><span dir="rtl" lang="he">{item.why}</span></>}
        last={round.index + 1 === round.total}
        onNext={() => {
          setWrong([]);
          round.next();
        }}
      />
    </div>
  );
}

// ───────────────────────── Spell to unlock ─────────────────────────

function letterPattern(answer: string, shown: number): string {
  return answer
    .split('')
    .map((ch, i) => (ch === ' ' ? '  ' : i < shown || !/[A-Za-z]/.test(ch) ? ch : '_'))
    .join(' ');
}

export function SpellGame({ activity, onDone }: GameProps<SpellActivity>) {
  const { t } = useStore();
  const meta = useCallback(
    (i: number) => {
      const it = activity.items[i];
      return { key: `${activity.id}:${i}`, grammar: activity.grammar, wordId: it.wordId, sentence: it.wordId ? undefined : it.sentence };
    },
    [activity],
  );
  const round = useRound(activity.items.length, meta, onDone);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const item = activity.items[round.index];
  const [before, after] = item.clue.split('___');

  useEffect(() => {
    if (round.phase === 'play') inputRef.current?.focus();
  }, [round.index, round.phase]);

  const check = () => {
    if (!value.trim()) return;
    round.submit(normalize(value) === normalize(item.answer));
  };

  return (
    <div className="game">
      <Counter index={round.index} total={round.total} />
      <div className="spell-card">
        <span className={`lock ${round.phase === 'right' ? 'open' : ''}`} aria-hidden="true">{round.phase === 'right' ? '🔓' : '🔒'}</span>
        {item.emoji && <span className="spell-emoji" aria-hidden="true">{item.emoji}</span>}
        <En as="p" className="prompt-big">
          {before}
          <span className={`blank ${round.finished ? 'filled' : ''}`}>{round.finished ? item.answer : letterPattern(item.answer, 0)}</span>
          {after}
        </En>
        {item.say && <div className="row-center"><SpeakButton text={item.say} /><SpeakButton text={item.say} slow /></div>}
      </div>
      <form
        className="spell-form"
        dir="ltr"
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
      >
        <input
          ref={inputRef}
          className="text-input"
          lang="en"
          dir="ltr"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={round.finished}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label={t('הקלידו את המילה החסרה באנגלית', 'Type the missing English word')}
          placeholder="…"
        />
        <Button type="submit" disabled={round.finished || !value.trim()}>{t('בדיקה', 'Check')}</Button>
      </form>
      <FeedbackBar
        phase={round.phase}
        index={round.index}
        clue={
          <>
            {item.he && <span dir="rtl" lang="he">{item.he} </span>}
            <En className="pattern">{letterPattern(item.answer, 1)}</En>
          </>
        }
        explain={<En>{item.clue.replace(/^.*→\s*/, '').replace('___', item.answer)}</En>}
        answer={<En className="answer-word">{item.answer}</En>}
        last={round.index + 1 === round.total}
        onNext={() => {
          setValue('');
          round.next();
        }}
      />
    </div>
  );
}

// ───────────────────────── Listen and choose ─────────────────────────

export function ListenGame({ activity, onDone }: GameProps<ListenActivity>) {
  const { t } = useStore();
  const meta = useCallback((i: number) => ({ key: `${activity.id}:${i}`, wordId: activity.items[i].wordId }), [activity]);
  const round = useRound(activity.items.length, meta, onDone);
  const [wrong, setWrong] = useState<number[]>([]);
  const [showText, setShowText] = useState(!canSpeak());
  const item = activity.items[round.index];

  useEffect(() => {
    speak(activity.items[round.index].say);
  }, [activity, round.index]);

  const pick = (i: number) => {
    if (i === item.answer) round.submit(true);
    else {
      setWrong((w) => [...w, i]);
      round.submit(false);
      speak(item.say, true);
    }
  };

  return (
    <div className="game">
      <Counter index={round.index} total={round.total} />
      <div className="listen-stage">
        <div className="listen-controls">
          <button type="button" className="play-big" onClick={() => speak(item.say)} aria-label={t('השמיעו שוב', 'Play again')}>
            <span aria-hidden="true">🔊</span>
          </button>
          <button type="button" className="play-slow" onClick={() => speak(item.say, true)}>
            <span aria-hidden="true">🐢</span> {t('לאט', 'Slow')}
          </button>
          <button type="button" className="play-slow" aria-pressed={showText} onClick={() => setShowText((s) => !s)}>
            <span aria-hidden="true">📄</span> {t('הצגת הטקסט', 'Show text')}
          </button>
        </div>
        {(showText || round.finished) && <En as="p" className="transcript">{item.say}</En>}
        <En as="p" className="prompt">{item.question}</En>
      </div>
      <div className="options picture-options" dir="ltr">
        {item.options.map((o, i) => (
          <button
            key={`${round.index}-${i}`}
            type="button"
            className={`option ${o.emoji ? 'with-emoji' : ''} ${round.finished && i === item.answer ? 'correct' : ''} ${wrong.includes(i) ? 'wrong' : ''}`}
            disabled={round.finished || wrong.includes(i)}
            onClick={() => pick(i)}
          >
            {o.emoji && <span className="option-emoji" aria-hidden="true">{o.emoji}</span>}
            <span dir="auto">{o.label}</span>
          </button>
        ))}
      </div>
      <FeedbackBar
        phase={round.phase}
        index={round.index}
        clue={t('הקשיבו שוב, לאט. 🐢 אפשר גם להציג את הטקסט.', 'Listen again, slowly. 🐢 You can also show the text.')}
        answer={<span dir="auto">{item.options[item.answer].emoji} {item.options[item.answer].label}</span>}
        last={round.index + 1 === round.total}
        onNext={() => {
          setWrong([]);
          round.next();
        }}
      />
    </div>
  );
}

// ───────────────────────── Optional speed round ─────────────────────────

export function SpeedGame({ activity, onDone }: GameProps<SpeedActivity>) {
  const { t, state } = useStore();
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(activity.seconds);
  const [last, setLast] = useState<{ ok: boolean; answer: string } | null>(null);
  const results = useRef<ItemResult[]>([]);
  const over = left <= 0 || index >= activity.items.length;

  useEffect(() => {
    if (over) return;
    const id = window.setInterval(() => setLeft((s) => s - 1), 1000);
    return () => window.clearInterval(id);
  }, [over]);

  const score = results.current.filter((r) => r.firstTry).length;

  if (over) {
    return (
      <div className="game center">
        <div className="big-emoji" aria-hidden="true">🎈</div>
        <h2>{t(`ענית נכון על ${score} מילים!`, `You got ${score} words!`)}</h2>
        <p>{t('הבלון נחת בשלום. כל תשובה עוזרת למוח לזכור.', 'The balloon landed safely. Every answer helps your brain remember.')}</p>
        <Button onClick={() => onDone(results.current)}>{t('סיום', 'Finish')}</Button>
      </div>
    );
  }

  const item = activity.items[index];
  const pick = (i: number) => {
    const ok = i === item.answer;
    results.current.push({ key: `${activity.id}:${index}`, wordId: item.wordId, firstTry: ok, solved: ok });
    if (ok && state.settings.sound) chime('right');
    setLast({ ok, answer: item.options[item.answer] });
    setIndex(index + 1);
  };

  return (
    <div className="game">
      <div className="balloon-track" aria-hidden="true">
        <span className="balloon" style={{ insetInlineStart: `${(1 - left / activity.seconds) * 92}%` }}>🎈</span>
      </div>
      <p className="soft-note">{t('בלי לחץ — הבלון פשוט מטייל.', 'No pressure — the balloon is just floating by.')}</p>
      <div className="speed-prompt" dir="auto">{item.prompt}</div>
      <div className="options" dir="ltr">
        {item.options.map((o, i) => (
          <button key={`${index}-${i}`} type="button" className="option" lang="en" onClick={() => pick(i)}>
            {o}
          </button>
        ))}
      </div>
      <div className="speed-last" role="status" aria-live="polite">
        {last && (last.ok ? <span>⭐ <En>{last.answer}</En></span> : <span>{t('זה היה:', 'It was:')} <En>{last.answer}</En></span>)}
      </div>
      <div className="row-center">
        <span className="chip">⭐ {score}</span>
        <Button variant="ghost" onClick={() => setLeft(0)}>{t('מספיק לי', 'I’m done')}</Button>
      </div>
    </div>
  );
}
