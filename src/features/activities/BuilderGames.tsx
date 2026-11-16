import { useCallback, useMemo, useRef, useState } from 'react';
import { Arrow, Button, En, SpeakButton } from '../../components/ui';
import type { BridgeActivity, BuildActivity, ItemResult, MatchActivity, SortActivity } from '../../domain/types';
import { chime } from '../../lib/speech';
import { countWords, looksEnglish, seededShuffle } from '../../lib/text';
import { useStore } from '../../state/store';
import { Counter, FeedbackBar, useRound } from './shared';
import type { GameProps } from './shared';

// ───────────────────────── Sentence builder (tap, keyboard or drag) ─────────────────────────

function SentenceBuilder({
  sentence,
  locked,
  onCheck,
}: {
  sentence: string;
  locked: boolean;
  onCheck: (correct: boolean, nextWord: string) => void;
}) {
  const { t } = useStore();
  const tokens = useMemo(() => sentence.split(' '), [sentence]);
  const bank = useMemo(() => {
    const order = seededShuffle(tokens.map((_, i) => i), sentence);
    if (order.every((v, i) => v === i) && order.length > 1) order.push(order.shift() as number);
    return order;
  }, [tokens, sentence]);
  const [placed, setPlaced] = useState<number[]>([]);
  const shown = locked ? tokens.map((_, i) => i) : placed;

  const place = (i: number) => {
    if (!locked && !placed.includes(i)) setPlaced([...placed, i]);
  };
  const check = () => {
    const correct = placed.map((i) => tokens[i]).join(' ') === sentence;
    if (!correct) {
      // Keep the part that is already right, so the retry starts from a real clue.
      let keep = 0;
      while (keep < placed.length && tokens[placed[keep]] === tokens[keep]) keep++;
      setPlaced(placed.slice(0, keep));
      onCheck(false, tokens[keep] ?? '');
    } else onCheck(true, '');
  };

  return (
    <div className="builder" dir="ltr" lang="en">
      <div
        className={`bridge ${locked ? 'fixed' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const i = Number(e.dataTransfer.getData('text/plain'));
          if (Number.isInteger(i)) place(i);
        }}
        aria-label={t('הגשר: המילים שסידרתם', 'The bridge: your words in order')}
      >
        {shown.length === 0 && <span className="bridge-empty">{t('הקישו או גררו מילים לכאן', 'Tap or drag words here')}</span>}
        {shown.map((i, pos) => (
          <button
            key={`${i}-${pos}`}
            type="button"
            className="plank placed"
            disabled={locked}
            onClick={() => setPlaced(placed.filter((p) => p !== i))}
            aria-label={`${tokens[i]} – ${t('הקישו להסרה', 'tap to remove')}`}
          >
            {tokens[i]}
          </button>
        ))}
      </div>
      {!locked && (
        <>
          <div className="plank-bank">
            {bank.map((i) => (
              <button
                key={i}
                type="button"
                className={`plank ${placed.includes(i) ? 'used' : ''}`}
                disabled={placed.includes(i)}
                draggable={!placed.includes(i)}
                onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
                onClick={() => place(i)}
              >
                {tokens[i]}
              </button>
            ))}
          </div>
          <div className="row-center">
            <Button variant="ghost" onClick={() => setPlaced([])} disabled={placed.length === 0}>{t('התחלה מחדש', 'Start over')}</Button>
            <Button onClick={check} disabled={placed.length !== tokens.length}>{t('בדיקה', 'Check')}</Button>
          </div>
        </>
      )}
    </div>
  );
}

function BuilderRound({
  sentences,
  activityId,
  grammar,
  onDone,
}: {
  sentences: string[];
  activityId: string;
  grammar?: string;
  onDone: (items: ItemResult[]) => void;
}) {
  const { t } = useStore();
  const meta = useCallback((i: number) => ({ key: `${activityId}:${i}`, grammar, sentence: sentences[i] }), [activityId, grammar, sentences]);
  const round = useRound(sentences.length, meta, onDone);
  const [hint, setHint] = useState('');
  const sentence = sentences[round.index];
  return (
    <>
      <Counter index={round.index} total={round.total} />
      <SentenceBuilder
        key={round.index}
        sentence={sentence}
        locked={round.finished}
        onCheck={(ok, nextWord) => {
          setHint(nextWord);
          round.submit(ok);
        }}
      />
      <FeedbackBar
        phase={round.phase}
        index={round.index}
        clue={<>{t('שמרנו את החלק הנכון. המילה הבאה היא:', 'We kept the right part. The next word is:')} <En className="answer-word">{hint}</En></>}
        explain={<span className="row-center"><En>{sentence}</En> <SpeakButton text={sentence} /></span>}
        answer={<span className="row-center"><En>{sentence}</En> <SpeakButton text={sentence} /></span>}
        last={round.index + 1 === round.total}
        onNext={round.next}
      />
    </>
  );
}

export function BridgeGame({ activity, onDone }: GameProps<BridgeActivity>) {
  const sentences = useMemo(() => activity.items.map((i) => i.sentence), [activity]);
  return (
    <div className="game">
      <div className="bridge-scene" aria-hidden="true">🏝️ 〰️〰️〰️ 🏝️</div>
      <BuilderRound sentences={sentences} activityId={activity.id} grammar={activity.grammar} onDone={onDone} />
    </div>
  );
}

// ───────────────────────── Build a message, then type it ─────────────────────────

export function BuildGame({ activity, onDone }: GameProps<BuildActivity>) {
  const { t } = useStore();
  const [built, setBuilt] = useState<ItemResult[] | null>(null);
  const [text, setText] = useState('');
  const [nudge, setNudge] = useState(false);
  const target = Math.ceil(countWords(activity.lines.join(' ')) * 0.6);

  if (!built) {
    return (
      <div className="game">
        <En as="p" className="goal-card">✉️ {activity.goal}</En>
        <BuilderRound sentences={activity.lines} activityId={activity.id} onDone={setBuilt} />
      </div>
    );
  }

  const ready = countWords(text) >= target && looksEnglish(text);
  return (
    <div className="game">
      <En as="p" className="goal-card">✉️ {activity.goal}</En>
      <div className="message-preview" dir="ltr" lang="en">
        {activity.lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
      <label className="field-label" htmlFor="final-message">
        {t('עכשיו הקלידו את ההודעה הסופית. אפשר לשנות פרט אחד כדי שתהיה שלכם!', 'Now type your final message. Change one detail to make it yours!')}
      </label>
      <textarea
        id="final-message"
        className="text-area"
        dir="ltr"
        lang="en"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <div className="row-between">
        <span className={`word-count ${ready ? 'ok' : ''}`}><span className="num">{countWords(text)} / {target}+</span> {t('מילים', 'words')}</span>
        <Button
          onClick={() => {
            if (ready) onDone(built, text.trim());
            else setNudge(true);
          }}
        >
          {t('שליחה', 'Send')} ✉️
        </Button>
      </div>
      {nudge && !ready && (
        <div className="feedback feedback-clue" role="status">
          <strong>{t('עוד לא — נסו את הרמז הזה:', 'Not yet — try this clue:')}</strong>
          <div className="feedback-body">{t(`כתבו באנגלית לפחות ${target} מילים. אפשר להיעזר במשפטים למעלה.`, `Write at least ${target} words in English. The sentences above can help.`)}</div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Match pairs ─────────────────────────

export function MatchGame({ activity, onDone }: GameProps<MatchActivity>) {
  const { t, state } = useStore();
  const n = activity.pairs.length;
  const left = useMemo(() => seededShuffle(activity.pairs.map((_, i) => i), `${activity.id}L`), [activity]);
  const right = useMemo(() => seededShuffle(activity.pairs.map((_, i) => i), `${activity.id}R`), [activity]);
  const [selL, setSelL] = useState<number | null>(null);
  const [selR, setSelR] = useState<number | null>(null);
  const [matched, setMatched] = useState<number[]>([]);
  const [miss, setMiss] = useState<[number, number] | null>(null);
  const misses = useRef<Record<number, number>>({});
  // The ref is the source of truth so two very fast taps can never read a stale selection.
  const sel = useRef<{ l: number | null; r: number | null }>({ l: null, r: null });

  const choose = (side: 'L' | 'R', i: number) => {
    if (side === 'L') sel.current.l = sel.current.l === i ? null : i;
    else sel.current.r = sel.current.r === i ? null : i;
    const { l, r } = sel.current;
    if (l !== null && r !== null) {
      if (l === r) {
        setMatched((m) => (m.includes(l) ? m : [...m, l]));
        setMiss(null);
        if (state.settings.sound) chime('right');
      } else {
        misses.current[l] = (misses.current[l] ?? 0) + 1;
        setMiss([l, r]);
        if (state.settings.sound) chime('soft');
      }
      sel.current = { l: null, r: null };
    }
    setSelL(sel.current.l);
    setSelR(sel.current.r);
  };

  const finish = () =>
    onDone(
      activity.pairs.map((p, i) => ({
        key: `${activity.id}:${i}`,
        wordId: p.wordId,
        grammar: activity.grammar,
        firstTry: !misses.current[i],
        solved: true,
      })),
    );

  const card = (i: number, side: 'L' | 'R') => {
    const done = matched.includes(i);
    const selected = side === 'L' ? selL === i : selR === i;
    const missed = miss !== null && (side === 'L' ? miss[0] === i : miss[1] === i);
    const label = side === 'L' ? activity.pairs[i].a : activity.pairs[i].b;
    return (
      <button
        key={`${side}${i}`}
        type="button"
        dir="auto"
        className={`match-card ${done ? 'done' : ''} ${selected ? 'selected' : ''} ${missed ? 'missed' : ''}`}
        disabled={done}
        aria-pressed={selected}
        onClick={() => choose(side, i)}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="game">
      <div className="counter-text">{matched.length} / {n}</div>
      <div className="match-grid" dir="ltr">
        <div className="match-col">{left.map((i) => card(i, 'L'))}</div>
        <div className="match-col">{right.map((i) => card(i, 'R'))}</div>
      </div>
      <div className={`feedback ${matched.length === n ? 'feedback-right' : miss ? 'feedback-clue' : 'feedback-play'}`} role="status" aria-live="polite">
        {matched.length === n ? (
          <>
            <strong dir="ltr" lang="en">All matched! 🌟</strong>
            <Button className="feedback-next" autoFocus onClick={finish}>{t('סיום', 'Finish')} <Arrow /></Button>
          </>
        ) : miss ? (
          <strong>{t('עוד לא — אלה לא זוג. נסו כרטיס אחר.', 'Not yet — these are not a pair. Try another card.')}</strong>
        ) : null}
      </div>
    </div>
  );
}

// ───────────────────────── Sort into crates ─────────────────────────

export function SortGame({ activity, onDone }: GameProps<SortActivity>) {
  const { t, state } = useStore();
  const order = useMemo(() => seededShuffle(activity.items.map((_, i) => i), activity.id), [activity]);
  const [placed, setPlaced] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [note, setNote] = useState<'none' | 'pick' | 'wrong'>('none');
  const misses = useRef<Record<number, number>>({});
  const remaining = order.filter((i) => placed[i] === undefined);
  const allDone = remaining.length === 0;

  const drop = (item: number | null, bucket: number) => {
    if (item === null) {
      setNote('pick');
      return;
    }
    if (activity.items[item].bucket === bucket) {
      setPlaced((p) => ({ ...p, [item]: bucket }));
      setNote('none');
      if (state.settings.sound) chime('right');
    } else {
      misses.current[item] = (misses.current[item] ?? 0) + 1;
      setNote('wrong');
      if (state.settings.sound) chime('soft');
    }
    setSelected(null);
  };

  const finish = () =>
    onDone(
      activity.items.map((_, i) => ({ key: `${activity.id}:${i}`, grammar: activity.grammar, firstTry: !misses.current[i], solved: true })),
    );

  return (
    <div className="game">
      <div className="counter-text">{activity.items.length - remaining.length} / {activity.items.length}</div>
      <div className="sort-tray" dir="ltr" lang="en" aria-label={t('כרטיסים למיון', 'Cards to sort')}>
        {remaining.map((i) => (
          <button
            key={i}
            type="button"
            className={`plank ${selected === i ? 'selected' : ''}`}
            aria-pressed={selected === i}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
            onClick={() => setSelected(selected === i ? null : i)}
          >
            {activity.items[i].text}
          </button>
        ))}
        {allDone && <span aria-hidden="true">✨</span>}
      </div>
      <div className="crates" dir="ltr" style={{ gridTemplateColumns: `repeat(${activity.buckets.length}, 1fr)` }}>
        {activity.buckets.map((b, bi) => (
          <button
            key={b}
            type="button"
            className={`crate ${selected !== null ? 'ready' : ''}`}
            disabled={allDone}
            onClick={() => drop(selected, bi)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const i = Number(e.dataTransfer.getData('text/plain'));
              if (Number.isInteger(i) && placed[i] === undefined) drop(i, bi);
            }}
            aria-label={`${t('ארגז', 'Crate')}: ${b}`}
          >
            <span className="crate-label" lang="en">{b}</span>
            <span className="crate-items" lang="en">
              {order.filter((i) => placed[i] === bi).map((i) => (
                <span key={i} className="mini-chip">{activity.items[i].text}</span>
              ))}
            </span>
          </button>
        ))}
      </div>
      <div className={`feedback ${allDone ? 'feedback-right' : note === 'none' ? 'feedback-play' : 'feedback-clue'}`} role="status" aria-live="polite">
        {allDone ? (
          <>
            <strong dir="ltr" lang="en">All sorted! 🌟</strong>
            <div className="feedback-body" dir="rtl" lang="he">{activity.why}</div>
            <Button className="feedback-next" autoFocus onClick={finish}>{t('סיום', 'Finish')} <Arrow /></Button>
          </>
        ) : note === 'wrong' ? (
          <>
            <strong>{t('עוד לא — נסו את הרמז הזה:', 'Not yet — try this clue:')}</strong>
            <div className="feedback-body" dir="rtl" lang="he">{activity.why}</div>
          </>
        ) : note === 'pick' ? (
          <strong>{t('קודם בחרו כרטיס, ואז ארגז.', 'Choose a card first, then a crate.')}</strong>
        ) : null}
      </div>
    </div>
  );
}
