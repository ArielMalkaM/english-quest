import { useRef, useState } from 'react';
import { Arrow, Button, En, HelpHint, SpeakButton } from '../../components/ui';
import type { ItemResult, SceneActivity, SpeakActivity, WriteActivity } from '../../domain/types';
import { canListen, listenOnce, speak } from '../../lib/speech';
import { countWords, looksEnglish, normalize, wordOverlap } from '../../lib/text';
import { useStore } from '../../state/store';
import { Counter } from './shared';
import type { GameProps } from './shared';

const doneItem = (id: string): ItemResult[] => [{ key: `${id}:0`, firstTry: true, solved: true }];

// ───────────────────────── Free writing (sentences / weekly paragraph) ─────────────────────────

export function WriteGame({ activity, onDone }: GameProps<WriteActivity>) {
  const { t } = useStore();
  const [text, setText] = useState('');
  const [clue, setClue] = useState<string | null>(null);
  const [polished, setPolished] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const words = countWords(text);
  const used = activity.wordBank.filter((w) => normalize(text).includes(normalize(w)));
  const pct = Math.min(100, Math.round((words / activity.minWords) * 100));

  const insert = (snippet: string) => {
    setText((cur) => (cur && !/\s$/.test(cur) ? `${cur} ${snippet}` : `${cur}${snippet}`));
    area.current?.focus();
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!looksEnglish(trimmed)) return setClue(t('כתבו באותיות באנגלית. אפשר להתחיל מאחד הפתיחים.', 'Write with English letters. You can begin with a starter.'));
    if (words < activity.minWords) {
      return setClue(t(`עוד ${activity.minWords - words} מילים ואתם שם! אולי תוסיפו מתי, איפה או עם מי?`, `${activity.minWords - words} more words and you are there! Maybe add when, where or who with?`));
    }
    // One friendly polish clue (never blocks a second try).
    if (!polished && (!/^[A-Z“"]/.test(trimmed) || !/[.!?”"]$/.test(trimmed))) {
      setPolished(true);
      return setClue(t('כמעט מושלם! בדקו: אות גדולה בהתחלה ונקודה בסוף. אחר כך שלחו שוב.', 'Almost perfect! Check: a capital letter at the start and a full stop at the end. Then send again.'));
    }
    onDone(doneItem(activity.id), trimmed);
  };

  return (
    <div className="game">
      {activity.panels && (
        <div className="panels" aria-hidden="true">
          {activity.panels.map((p, i) => (
            <span key={i} className="panel">{p}</span>
          ))}
        </div>
      )}
      <En as="p" className="goal-card">✏️ {activity.prompt}</En>
      <HelpHint he={activity.promptHe} />
      <div className="chip-row" dir="ltr" lang="en" aria-label={t('פתיחים', 'Sentence starters')}>
        {activity.starters.map((s) => (
          <button key={s} type="button" className="chip chip-btn starter" onClick={() => insert(s)}>{s.trim()}…</button>
        ))}
      </div>
      <textarea
        ref={area}
        className="text-area"
        dir="ltr"
        lang="en"
        rows={activity.minWords > 15 ? 7 : 4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={t('הכתיבה שלכם באנגלית', 'Your writing in English')}
        placeholder="Write here…"
      />
      <div className="row-between">
        <div className="word-meter" aria-label={t(`${words} מילים מתוך ${activity.minWords}`, `${words} of ${activity.minWords} words`)}>
          <div className="meter"><i style={{ width: `${pct}%` }} /></div>
          <span className={words >= activity.minWords ? 'ok' : ''}>
            <span className="num">{words} / {activity.minWords}{activity.maxWords ? `–${activity.maxWords}` : '+'}</span> {t('מילים', 'words')}
          </span>
        </div>
        {text.trim() && <SpeakButton text={text} label={t('הקשיבו לכתיבה שלכם', 'Listen to your writing')} />}
      </div>
      <div className="chip-row" dir="ltr" lang="en" aria-label={t('מילות המסע', 'Quest words')}>
        {activity.wordBank.map((w) => (
          <button key={w} type="button" className={`chip chip-btn ${used.includes(w) ? 'used' : ''}`} onClick={() => insert(w)}>
            {used.includes(w) ? '⭐ ' : ''}{w}
          </button>
        ))}
      </div>
      {used.length > 0 && <p className="soft-note">⭐ {t(`השתמשתם ב-${used.length} מילות מסע!`, `You used ${used.length} quest words!`)}</p>}
      {clue && (
        <div className="feedback feedback-clue" role="status" aria-live="polite">
          <strong>{t('עוד לא — נסו את הרמז הזה:', 'Not yet — try this clue:')}</strong>
          <div className="feedback-body">{clue}</div>
        </div>
      )}
      <div className="row-center">
        <Button onClick={submit} disabled={!text.trim()}>{t('סיימתי!', 'I’m done!')} ✨</Button>
      </div>
    </div>
  );
}

// ───────────────────────── Pick a scene, write two sentences ─────────────────────────

export function SceneGame({ activity, onDone }: GameProps<SceneActivity>) {
  const { t } = useStore();
  const [pick, setPick] = useState<number | null>(null);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [nudge, setNudge] = useState(false);
  const ok = (s: string) => countWords(s) >= 3 && looksEnglish(s);

  if (pick === null) {
    return (
      <div className="game">
        <p className="prompt">{t('בחרו סצנה:', 'Choose a scene:')}</p>
        <div className="scene-grid" dir="ltr">
          {activity.scenes.map((s, i) => (
            <button key={s.label} type="button" className="scene-card" onClick={() => setPick(i)}>
              <span className="big-emoji" aria-hidden="true">{s.emoji}</span>
              <En>{s.label}</En>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const scene = activity.scenes[pick];
  return (
    <div className="game">
      <div className="scene-banner" dir="ltr" lang="en">
        <span className="big-emoji" aria-hidden="true">{scene.emoji}</span>
        <div>
          <b>{scene.label}</b>
          <div className="chip-row">{scene.words.map((w) => <span key={w} className="chip">{w}</span>)}</div>
        </div>
        <Button variant="ghost" onClick={() => setPick(null)}>{t('סצנה אחרת', 'Change')}</Button>
      </div>
      <label className="field-label" htmlFor="scene-a">{t('משפט 1: מה רואים או מה קורה?', 'Sentence 1: what can you see, or what is happening?')}</label>
      <input id="scene-a" className="text-input wide" dir="ltr" lang="en" value={a} onChange={(e) => setA(e.target.value)} spellCheck={false} />
      <label className="field-label" htmlFor="scene-b">{t('משפט 2: הוסיפו עוד פרט.', 'Sentence 2: add one more detail.')}</label>
      <input id="scene-b" className="text-input wide" dir="ltr" lang="en" value={b} onChange={(e) => setB(e.target.value)} spellCheck={false} />
      {nudge && !(ok(a) && ok(b)) && (
        <div className="feedback feedback-clue" role="status" aria-live="polite">
          <strong>{t('עוד לא — נסו את הרמז הזה:', 'Not yet — try this clue:')}</strong>
          <div className="feedback-body">{t('כל משפט צריך לפחות 3 מילים באנגלית. נסו להשתמש באחת המילים למעלה.', 'Each sentence needs at least 3 English words. Try one of the words above.')}</div>
        </div>
      )}
      <div className="row-center">
        <Button onClick={() => (ok(a) && ok(b) ? onDone(doneItem(activity.id), `${a.trim()} ${b.trim()}`) : setNudge(true))}>
          {t('סיימתי!', 'I’m done!')} ✨
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────── Talk to the guide (optional speech) ─────────────────────────

export function SpeakGame({ activity, onDone }: GameProps<SpeakActivity>) {
  const { t } = useStore();
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<'idle' | 'listening' | 'good' | 'again' | 'nomic'>('idle');
  const [heard, setHeard] = useState('');
  const mic = canListen();
  const phrase = activity.phrases[index];

  const next = () => {
    setStatus('idle');
    setHeard('');
    if (index + 1 >= activity.phrases.length) onDone(doneItem(activity.id));
    else setIndex(index + 1);
  };

  const record = async () => {
    setStatus('listening');
    const result = await listenOnce().promise;
    if (result === null) return setStatus('nomic');
    setHeard(result);
    setStatus(wordOverlap(phrase, result) >= 0.6 ? 'good' : 'again');
  };

  return (
    <div className="game center">
      <Counter index={index} total={activity.phrases.length} />
      <div className="guide-bubble" dir="ltr" lang="en">
        <span className="big-emoji" aria-hidden="true">{activity.guide}</span>
        <p className="prompt-big">{phrase}</p>
      </div>
      <div className="row-center">
        <Button variant="secondary" onClick={() => speak(phrase)}>🔊 {t('הקשיבו', 'Listen')}</Button>
        <Button variant="secondary" onClick={() => speak(phrase, true)}>🐢 {t('לאט', 'Slow')}</Button>
      </div>
      <div className="row-center">
        {mic && (
          <Button onClick={record} disabled={status === 'listening'}>
            🎤 {status === 'listening' ? t('מקשיב…', 'Listening…') : t('אמרו את זה', 'Say it')}
          </Button>
        )}
        <Button variant={mic ? 'ghost' : 'primary'} onClick={next}>✔ {t('אמרתי בקול', 'I said it out loud')}</Button>
      </div>
      <div className="feedback feedback-play" role="status" aria-live="polite">
        {status === 'good' && (
          <>
            <strong dir="ltr" lang="en">Great speaking! 🌟</strong>
            <Button className="feedback-next" onClick={next}>{t('הבא', 'Next')} <Arrow /></Button>
          </>
        )}
        {status === 'again' && (
          <span>
            {t('שמעתי:', 'I heard:')} <En>“{heard}”</En>. {t('נסו שוב, או הקישו "אמרתי בקול".', 'Try again, or tap “I said it out loud”.')}
          </span>
        )}
        {status === 'nomic' && <span>{t('המיקרופון לא זמין — זה בסדר גמור! אמרו בקול והקישו "אמרתי בקול".', 'The microphone is not available — that is totally fine! Say it and tap “I said it out loud”.')}</span>}
        {!mic && status === 'idle' && <span className="soft-note">{t('אין צורך במיקרופון: הקשיבו, אמרו בקול, והמשיכו.', 'No microphone needed: listen, say it out loud, and continue.')}</span>}
      </div>
    </div>
  );
}
