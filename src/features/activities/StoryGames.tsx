import { useCallback, useMemo, useState } from 'react';
import { En, SpeakButton } from '../../components/ui';
import type { DialogueActivity, ReadingActivity } from '../../domain/types';
import { seededShuffle } from '../../lib/text';
import { useStore } from '../../state/store';
import { Counter, FeedbackBar, useRound } from './shared';
import type { GameProps } from './shared';

// ───────────────────────── Reading: tap the clue / detective mode ─────────────────────────

export function ReadingGame({ activity, onDone }: GameProps<ReadingActivity>) {
  const { t } = useStore();
  const meta = useCallback((i: number) => ({ key: `${activity.id}:${i}` }), [activity]);
  const round = useRound(activity.questions.length, meta, onDone);
  const [wrong, setWrong] = useState<number[]>([]);
  const [answered, setAnswered] = useState(false);
  const [badTap, setBadTap] = useState<number | null>(null);
  const question = activity.questions[round.index];
  const detective = activity.mode === 'detective';
  const hasOptions = Boolean(question.options);
  // Lines can be tapped for "tap the clue" questions and for the detective's proof stage.
  const tapStage = !round.finished && (!hasOptions || (detective && answered));
  // Story mode: a miss highlights the clue sentence. Detective mode keeps the proof hidden.
  const showEvidence = round.finished || (round.phase === 'clue' && hasOptions && !detective);

  const pick = (i: number) => {
    if (i === question.answer) {
      if (detective && question.evidence !== undefined) setAnswered(true);
      else round.submit(true);
    } else {
      setWrong((w) => [...w, i]);
      round.submit(false);
    }
  };
  const tapLine = (i: number) => {
    if (i === question.evidence) round.submit(true);
    else {
      setBadTap(i);
      round.submit(false);
    }
  };

  return (
    <div className="game reading">
      <article className={`text-card ${detective ? 'detective' : ''}`} dir="ltr" lang="en">
        <header>
          <span className="genre-chip">{activity.emoji} {activity.genre}</span>
          {detective && <span className="genre-chip dark">🔎 Detective mode</span>}
          <SpeakButton text={activity.lines.join(' ')} label={t('הקראת הטקסט', 'Read the text aloud')} />
        </header>
        <h3>{activity.textTitle}</h3>
        {activity.lines.map((line, i) => {
          const cls = `line ${showEvidence && i === question.evidence ? 'evidence' : ''} ${badTap === i && !round.finished ? 'bad' : ''}`;
          return tapStage ? (
            <button key={i} type="button" className={`${cls} tappable`} onClick={() => tapLine(i)}>
              {line}
            </button>
          ) : (
            <p key={i} className={cls}>{line}</p>
          );
        })}
      </article>

      <section className="question-panel">
        <Counter index={round.index} total={round.total} />
        <En as="p" className="prompt">{question.q}</En>
        {hasOptions && !(detective && answered) && (
          <div className="options stacked" dir="ltr">
            {(question.options ?? []).map((o, i) => (
              <button
                key={`${round.index}-${i}`}
                type="button"
                lang="en"
                className={`option ${round.finished && i === question.answer ? 'correct' : ''} ${wrong.includes(i) ? 'wrong' : ''}`}
                disabled={round.finished || wrong.includes(i)}
                onClick={() => pick(i)}
              >
                {o}
              </button>
            ))}
          </div>
        )}
        {detective && answered && !round.finished && (
          <div className="proof-ask">
            <En as="div" className="answer-word">✔ {question.options?.[question.answer ?? 0]}</En>
            <strong>🔎 {t('עכשיו מצאו הוכחה: הקישו על השורה בטקסט שמוכיחה את זה.', 'Now find the evidence: tap the line in the text that proves it.')}</strong>
          </div>
        )}
        {!hasOptions && !round.finished && (
          <p className="soft-note">👆 {t('הקישו על השורה המתאימה בטקסט.', 'Tap the right line in the text.')}</p>
        )}
        <FeedbackBar
          phase={round.phase}
          index={round.index}
          clue={<span dir="rtl" lang="he">{question.hint}</span>}
          explain={question.evidence !== undefined ? <En>“{activity.lines[question.evidence]}”</En> : undefined}
          answer={
            <>
              {hasOptions && <En as="div" className="answer-word">{question.options?.[question.answer ?? 0]}</En>}
              {question.evidence !== undefined && <En as="div">“{activity.lines[question.evidence]}”</En>}
            </>
          }
          last={round.index + 1 === round.total}
          onNext={() => {
            setWrong([]);
            setAnswered(false);
            setBadTap(null);
            round.next();
          }}
        />
      </section>
    </div>
  );
}

// ───────────────────────── Dialogue: help the character reply ─────────────────────────

export function DialogueGame({ activity, onDone }: GameProps<DialogueActivity>) {
  const { t } = useStore();
  const meta = useCallback((i: number) => ({ key: `${activity.id}:${i}` }), [activity]);
  const round = useRound(activity.turns.length, meta, onDone);
  const [wrong, setWrong] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const turn = activity.turns[round.index];
  const options = useMemo(() => seededShuffle(turn.options, `${activity.id}:${round.index}`), [activity, round.index, turn]);
  const right = turn.options.find((o) => o.ok)?.text ?? '';

  return (
    <div className="game">
      <En as="p" className="story-intro">{activity.partner.emoji} {activity.scene}</En>
      <Counter index={round.index} total={round.total} />
      <div className="chat" dir="ltr" lang="en">
        {activity.turns.slice(0, round.index).map((prev, i) => (
          <div key={i} className="chat-pair past">
            <div className="bubble them"><span className="who" aria-hidden="true">{activity.partner.emoji}</span>{prev.says}</div>
            <div className="bubble me">{prev.options.find((o) => o.ok)?.text}</div>
          </div>
        ))}
        <div className="bubble them now">
          <span className="who" aria-hidden="true">{activity.partner.emoji}</span>
          <span>
            <b className="sr-only">{activity.partner.name}: </b>
            {turn.says}
          </span>
          <SpeakButton text={turn.says} />
        </div>
        {round.finished && <div className="bubble me now">{right}</div>}
      </div>
      {!round.finished && (
        <div className="options stacked" dir="ltr">
          {options.map((o) => (
            <button
              key={o.text}
              type="button"
              lang="en"
              className={`option reply ${wrong.includes(o.text) ? 'wrong' : ''}`}
              disabled={wrong.includes(o.text)}
              onClick={() => {
                if (o.ok) round.submit(true);
                else {
                  setWrong((w) => [...w, o.text]);
                  setNote(o.note ?? t('קראו שוב את השאלה: על מה שואלים?', 'Read the question again: what is it asking?'));
                  round.submit(false);
                }
              }}
            >
              {o.text}
            </button>
          ))}
        </div>
      )}
      <FeedbackBar
        phase={round.phase}
        index={round.index}
        clue={<span dir="auto">{note}</span>}
        answer={<En>{right}</En>}
        last={round.index + 1 === round.total}
        onNext={() => {
          setWrong([]);
          round.next();
        }}
      />
    </div>
  );
}
