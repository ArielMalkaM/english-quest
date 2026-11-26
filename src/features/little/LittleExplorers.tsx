import { useEffect, useMemo, useRef, useState } from 'react';
import { Confetti, En } from '../../components/ui';
import { navigate } from '../../lib/router';
import { canSpeak, chime, speak, stopSpeaking } from '../../lib/speech';
import { useStore } from '../../state/store';
import {
  MAX_STARS,
  ROUNDS,
  buildMemory,
  buildRounds,
  loadProgress,
  memoryPairs,
  saveProgress,
  starsOf,
  withGame,
  withLooked,
} from './game';
import type { LittleProgress, MemoryCard } from './game';
import { LITTLE_TOPICS, askFor } from './topics';
import type { LittleTopic, LittleWord } from './topics';
import './little.css';

/** "Find it!" (hear a word, tap its picture) or Memory (match the pairs). */
type Mode = 'find' | 'memory';

type View =
  | { kind: 'topics' }
  | { kind: 'look'; topic: LittleTopic }
  | { kind: 'game'; topic: LittleTopic; seed: number; mode: Mode }
  | { kind: 'done'; topic: LittleTopic; mode: Mode };

/** Waits a moment before talking, so the new screen is on show first. */
function useLater() {
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);
  return (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
}

/** A word's picture; numbers show the picture several times, wrapping to fit. */
function Picture({ word, className }: { word: LittleWord; className: string }) {
  const n = word.count ?? 1;
  return (
    <span className={`${className} ${n > 1 ? 'many' : ''}`} aria-hidden="true">
      {n > 1 ? Array.from({ length: n }, (_, i) => <i key={i}>{word.emoji}</i>) : word.emoji}
    </span>
  );
}

function Stars({ count, label }: { count: number; label: string }) {
  return (
    <span className="little-stars" role="img" aria-label={label}>
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <span key={i} className={i < count ? 'on' : ''} aria-hidden="true">⭐</span>
      ))}
    </span>
  );
}

/** Little Explorers: first English words for a 4-year-old, all pictures and sound. */
export function LittleExplorers() {
  const { t } = useStore();
  const [view, setView] = useState<View>({ kind: 'topics' });
  const [progress, setProgress] = useState<LittleProgress>(loadProgress);

  useEffect(() => () => stopSpeaking(), []);

  const update = (next: LittleProgress) => {
    setProgress(next);
    saveProgress(next);
  };

  const finish = (topic: LittleTopic, mode: Mode) => {
    update(withGame(progress, topic.id));
    setView({ kind: 'done', topic, mode });
  };

  const home = () => {
    stopSpeaking();
    setView({ kind: 'topics' });
  };

  return (
    <div className="little">
      <header className="little-bar">
        {view.kind === 'topics' ? (
          <button type="button" className="little-round-btn" onClick={() => navigate('')} aria-label={t('יציאה', 'Exit')}>
            <span aria-hidden="true">🚪</span>
          </button>
        ) : (
          <button type="button" className="little-round-btn" onClick={home} aria-label={t('לכל הנושאים', 'All topics')}>
            <span aria-hidden="true">🏠</span>
          </button>
        )}
        <h1>
          {view.kind === 'topics' ? (
            <>
              <span aria-hidden="true">🧸 </span>
              <En>Little Explorers</En>
            </>
          ) : (
            <>
              <span aria-hidden="true">{view.topic.emoji} </span>
              <En>{view.topic.en}</En>
            </>
          )}
        </h1>
      </header>

      {view.kind === 'topics' && (
        <Topics
          progress={progress}
          onPick={(topic) => {
            speak(topic.en);
            setView({ kind: 'look', topic });
          }}
        />
      )}
      {view.kind === 'look' && (
        <Look
          key={view.topic.id}
          topic={view.topic}
          onAllSeen={() => update(withLooked(progress, view.topic.id))}
          onPlay={(mode) => setView({ kind: 'game', topic: view.topic, seed: Date.now(), mode })}
        />
      )}
      {view.kind === 'game' && view.mode === 'find' && (
        <FindIt key={view.seed} topic={view.topic} seed={view.seed} onDone={() => finish(view.topic, 'find')} />
      )}
      {view.kind === 'game' && view.mode === 'memory' && (
        <Memory
          key={view.seed}
          topic={view.topic}
          seed={view.seed}
          pairs={memoryPairs(progress[view.topic.id]?.games ?? 0)}
          onDone={() => finish(view.topic, 'memory')}
        />
      )}
      {view.kind === 'done' && (
        <Done
          topic={view.topic}
          stars={starsOf(progress, view.topic.id)}
          onAgain={() => setView({ kind: 'game', topic: view.topic, seed: Date.now(), mode: view.mode })}
          onLook={() => setView({ kind: 'look', topic: view.topic })}
          onHome={home}
        />
      )}
    </div>
  );
}

function Topics({ progress, onPick }: { progress: LittleProgress; onPick: (topic: LittleTopic) => void }) {
  const { t } = useStore();
  return (
    <section className="little-body">
      <p className="little-note">
        {t(
          'מילים ראשונות באנגלית לגיל 4. בוחרים נושא, מקישים על תמונה ושומעים את המילה, ואז משחקים "מצא את…" או משחק זיכרון.',
          'First English words for age 4. Pick a topic, tap a picture to hear the word, then play “Find it!” or Memory.',
        )}
      </p>
      {!canSpeak() && (
        <p className="little-warn" role="note">
          {t('בדפדפן הזה אין קול. כדאי לפתוח בכרום או בספארי עם רמקול דולק.', 'This browser cannot speak. Open the app in Chrome or Safari with the sound on.')}
        </p>
      )}
      <ul className="little-topics">
        {LITTLE_TOPICS.map((topic) => {
          const stars = starsOf(progress, topic.id);
          return (
            <li key={topic.id}>
              <button
                type="button"
                className="little-topic"
                style={{ background: topic.color }}
                onClick={() => onPick(topic)}
                aria-label={`${topic.en} · ${topic.he} · ${stars}/${MAX_STARS} ⭐`}
              >
                <span className="little-topic-emoji" aria-hidden="true">{topic.emoji}</span>
                <En className="little-topic-name">{topic.en}</En>
                <Stars count={stars} label={`${stars}/${MAX_STARS}`} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Look({ topic, onAllSeen, onPlay }: { topic: LittleTopic; onAllSeen: () => void; onPlay: (mode: Mode) => void }) {
  const { t } = useStore();
  const [seen, setSeen] = useState<string[]>([]);
  const [active, setActive] = useState<{ id: string; n: number } | null>(null);
  const allSeen = seen.length === topic.words.length;
  const later = useLater();

  const tap = (word: LittleWord) => {
    speak(word.en);
    setActive((a) => ({ id: word.id, n: (a?.n ?? 0) + 1 }));
    if (seen.includes(word.id)) return;
    const next = [...seen, word.id];
    setSeen(next);
    if (next.length === topic.words.length) {
      onAllSeen();
      later(() => {
        chime('win');
        speak('Great job!');
      }, 900);
    }
  };

  return (
    <section className="little-body">
      <p className="little-hint" aria-live="polite">
        {allSeen ? t('כל הכבוד! עכשיו בואו נשחק 🎈', 'Great job! Now let’s play 🎈') : t('מקישים על תמונה ושומעים 👂', 'Tap a picture and listen 👂')}
      </p>
      <ul className="little-cards">
        {topic.words.map((word) => {
          const isActive = active?.id === word.id;
          return (
            <li key={word.id}>
              <button
                type="button"
                className={`little-card ${seen.includes(word.id) ? 'seen' : ''} ${isActive ? 'active' : ''}`}
                style={{ borderColor: topic.color }}
                onClick={() => tap(word)}
                aria-label={`${word.en} · ${word.he}`}
              >
                <Picture key={isActive ? active.n : 0} word={word} className="little-card-emoji" />
                <En className="little-card-word">{word.en}</En>
                <span className="little-card-he" dir="rtl" lang="he">{word.he}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {allSeen && <Confetti />}
      <div className="little-done-actions">
        <button type="button" className={`little-play ${allSeen ? 'ready' : ''}`} onClick={() => onPlay('find')}>
          <span aria-hidden="true">🎈</span> {t('משחק: מצא את…', 'Play: Find it!')}
        </button>
        <button type="button" className={`little-play ${allSeen ? 'ready' : ''}`} onClick={() => onPlay('memory')}>
          <span aria-hidden="true">🃏</span> {t('משחק זיכרון', 'Play: Memory')}
        </button>
      </div>
    </section>
  );
}

function FindIt({ topic, seed, onDone }: { topic: LittleTopic; seed: number; onDone: () => void }) {
  const { t } = useStore();
  const rounds = useMemo(() => buildRounds(topic, seed), [topic, seed]);
  const [index, setIndex] = useState(0);
  const [wrong, setWrong] = useState<string[]>([]);
  const [right, setRight] = useState(false);
  const later = useLater();
  const round = rounds[index];
  const prompt = askFor(topic, round.target);

  useEffect(() => {
    const id = window.setTimeout(() => speak(prompt), 450);
    return () => window.clearTimeout(id);
  }, [prompt, index]);

  const pick = (word: LittleWord) => {
    if (right) return;
    if (word.id === round.target.id) {
      setRight(true);
      chime('right');
      speak(`Yes! ${word.en}!`);
      later(() => {
        if (index + 1 >= rounds.length) {
          onDone();
          return;
        }
        setIndex(index + 1);
        setWrong([]);
        setRight(false);
      }, 1700);
      return;
    }
    // No penalty: say what was tapped, then ask again.
    chime('soft');
    if (!wrong.includes(word.id)) setWrong([...wrong, word.id]);
    speak(`${word.en}! ${prompt}`);
  };

  return (
    <section className="little-body">
      <div className="little-progress" role="img" aria-label={t(`סיבוב ${index + 1} מתוך ${ROUNDS}`, `Round ${index + 1} of ${ROUNDS}`)}>
        {rounds.map((_, i) => (
          <span key={i} className={i < index || (i === index && right) ? 'on' : ''} aria-hidden="true">⭐</span>
        ))}
      </div>
      <button type="button" className="little-ask" onClick={() => speak(prompt)} aria-label={t(`להשמיע שוב: ${prompt}`, `Say again: ${prompt}`)}>
        <span className="little-ask-icon" aria-hidden="true">🔊</span>
        <En>{prompt}</En>
      </button>
      <ul className={`little-options n${round.options.length}`} aria-live="polite">
        {round.options.map((word) => {
          const isRight = right && word.id === round.target.id;
          const isWrong = wrong.includes(word.id);
          return (
            <li key={`${index}-${word.id}`}>
              <button
                type="button"
                className={`little-option ${isRight ? 'right' : ''} ${isWrong ? 'oops' : ''}`}
                style={{ borderColor: topic.color }}
                onClick={() => pick(word)}
                aria-label={word.en}
              >
                <Picture word={word} className="little-option-emoji" />
                {isRight && <En className="little-option-word">{word.en}</En>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Memory: turn two cards over to find the matching pictures; every card says its word. */
function Memory({ topic, seed, pairs, onDone }: { topic: LittleTopic; seed: number; pairs: number; onDone: () => void }) {
  const { t } = useStore();
  const cards = useMemo(() => buildMemory(topic, seed, pairs), [topic, seed, pairs]);
  /** Cards turned over and not yet matched (at most two). */
  const [open, setOpen] = useState<string[]>([]);
  /** Word ids already matched. */
  const [matched, setMatched] = useState<string[]>([]);
  const later = useLater();
  const total = cards.length / 2;

  useEffect(() => {
    const id = window.setTimeout(() => speak('Find the pairs!'), 450);
    return () => window.clearTimeout(id);
  }, []);

  const flip = (card: MemoryCard) => {
    if (open.length >= 2 || open.includes(card.key) || matched.includes(card.word.id)) return;
    if (open.length === 0) {
      speak(card.word.en);
      setOpen([card.key]);
      return;
    }
    const first = cards.find((c) => c.key === open[0]);
    setOpen([open[0], card.key]);
    if (first?.word.id === card.word.id) {
      speak(`${card.word.en}! Yes!`);
      later(() => {
        chime('right');
        const next = [...matched, card.word.id];
        setMatched(next);
        setOpen([]);
        if (next.length === total) later(onDone, 1600);
      }, 650);
      return;
    }
    // Not a pair: say the word, let the child look, then turn both back. No penalty.
    speak(card.word.en);
    later(() => {
      chime('soft');
      setOpen([]);
    }, 1600);
  };

  return (
    <section className="little-body">
      <div className="little-progress" role="img" aria-label={t(`${matched.length} זוגות מתוך ${total}`, `${matched.length} of ${total} pairs`)}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < matched.length ? 'on' : ''} aria-hidden="true">⭐</span>
        ))}
      </div>
      <button type="button" className="little-ask" onClick={() => speak('Find the pairs!')} aria-label={t('להשמיע שוב: Find the pairs!', 'Say again: Find the pairs!')}>
        <span className="little-ask-icon" aria-hidden="true">🔊</span>
        <En>Find the pairs!</En>
      </button>
      <ul className={`little-mem n${cards.length}`} aria-live="polite">
        {cards.map((card, i) => {
          const isMatched = matched.includes(card.word.id);
          const isUp = isMatched || open.includes(card.key);
          return (
            <li key={card.key}>
              <button
                type="button"
                className={`little-mem-card ${isUp ? 'up' : ''} ${isMatched ? 'matched' : ''}`}
                onClick={() => flip(card)}
                aria-label={isUp ? card.word.en : t(`קלף ${i + 1}`, `Card ${i + 1}`)}
                aria-disabled={isMatched}
              >
                <span className="little-mem-inner">
                  <span className="little-mem-back" style={{ backgroundColor: topic.color }} aria-hidden="true">
                    {/* Not the topic emoji: in Animals that is the dog, which is also a card. */}
                    <span>❓</span>
                  </span>
                  <span className="little-mem-face" style={{ borderColor: topic.color }} aria-hidden="true">
                    <Picture word={card.word} className="little-mem-emoji" />
                    {isMatched && <En className="little-mem-word">{card.word.en}</En>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Done({
  topic,
  stars,
  onAgain,
  onLook,
  onHome,
}: {
  topic: LittleTopic;
  stars: number;
  onAgain: () => void;
  onLook: () => void;
  onHome: () => void;
}) {
  const { t } = useStore();
  useEffect(() => {
    chime('win');
    const id = window.setTimeout(() => speak('Hooray! You did it!'), 500);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <section className="little-body little-done">
      <Confetti />
      <div className="little-trophy" aria-hidden="true">🏆</div>
      <h2>
        <En>Hooray!</En> {t('הצלחת!', 'You did it!')}
      </h2>
      <Stars count={stars} label={t(`${stars} מתוך ${MAX_STARS} כוכבים ב${topic.he}`, `${stars} of ${MAX_STARS} stars in ${topic.en}`)} />
      <div className="little-done-actions">
        <button type="button" className="little-play ready" onClick={onAgain}>
          <span aria-hidden="true">🔁</span> {t('עוד פעם', 'Again')}
        </button>
        <button type="button" className="little-play soft" onClick={onLook}>
          <span aria-hidden="true">👀</span> {t('לראות את המילים', 'See the words')}
        </button>
        <button type="button" className="little-play soft" onClick={onHome}>
          <span aria-hidden="true">🏠</span> {t('נושא אחר', 'Another topic')}
        </button>
      </div>
    </section>
  );
}
