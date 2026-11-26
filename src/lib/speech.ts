// Browser speech helpers. The app itself uploads nothing. Some browsers (Chrome, Edge) voice
// their best-sounding English voices on their own servers; only the lesson's English words go there.

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

// Novelty / effect voices (mostly macOS) that are hard for children to understand.
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;

// Clear, warm American voices that read slowly and well for children, best first.
const PREFERRED = [
  /(jenny|aria|ava|emma|michelle).*(natural|online|neural)/i, // Edge natural voices
  /(natural|neural)/i,
  /google us english/i, // Chrome
  /(ava|samantha|allison|susan|nicky).*(premium|enhanced)/i, // Apple high-quality downloads
  /samantha|ava|allison|nicky|susan/i, // Apple
  /zira/i, // Windows built-in
];

/**
 * Score an English voice for a young listener: clear American English first, natural-sounding
 * voices over robotic ones, never a novelty voice. Lower is better; null means "don't use".
 */
export function rankVoice(v: Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService'>): number | null {
  const lang = v.lang.replace('_', '-').toLowerCase();
  if (!lang.startsWith('en')) return null;
  if (NOVELTY.test(v.name)) return null;
  const hit = PREFERRED.findIndex((re) => re.test(v.name));
  const nameScore = hit === -1 ? PREFERRED.length : hit;
  const langScore = lang === 'en-us' ? 0 : lang === 'en-gb' || lang === 'en-ca' || lang === 'en-au' ? 1 : 2;
  return langScore * 100 + nameScore;
}

let cachedVoice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = Infinity;
  for (const v of window.speechSynthesis.getVoices()) {
    const score = rankVoice(v);
    if (score !== null && score < bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}

function englishVoice(): SpeechSynthesisVoice | null {
  cachedVoice ??= pickVoice();
  return cachedVoice;
}

if (canSpeak()) {
  // Voices arrive late in Chrome / Edge: pick again once the full list is ready.
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    cachedVoice = pickVoice();
  });
  window.speechSynthesis.getVoices(); // starts loading the list early
}

/** Speaks English text slowly and clearly. `slow` is extra slow for a second listen. */
export function speak(text: string, slow = false): void {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[“”]/g, '"').replace(/’/g, "'"));
  u.lang = 'en-US';
  const voice = englishVoice();
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  }
  u.rate = slow ? 0.65 : 0.85;
  u.pitch = 1; // pitch shifts make natural voices sound artificial
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canListen(): boolean {
  return recognitionCtor() !== null;
}

/**
 * Listens once for English speech. Resolves with what was heard, or null when the
 * microphone is unavailable / denied / silent — callers must always offer another way.
 */
export function listenOnce(): { promise: Promise<string | null>; stop: () => void } {
  const Ctor = recognitionCtor();
  if (!Ctor) return { promise: Promise.resolve(null), stop: () => undefined };
  let rec: RecognitionLike;
  try {
    rec = new Ctor();
  } catch {
    return { promise: Promise.resolve(null), stop: () => undefined };
  }
  rec.lang = 'en-US';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  const promise = new Promise<string | null>((resolve) => {
    let heard: string | null = null;
    rec.onresult = (e) => {
      heard = e.results[0]?.[0]?.transcript ?? null;
    };
    rec.onerror = () => resolve(null);
    rec.onend = () => resolve(heard);
    try {
      rec.start();
    } catch {
      resolve(null);
    }
  });
  return { promise, stop: () => rec.stop() };
}

let audioCtx: AudioContext | null = null;

/** Tiny synthesized chime — no audio files, no network. */
export function chime(kind: 'right' | 'soft' | 'win'): void {
  try {
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    const ctx = audioCtx;
    const notes = kind === 'right' ? [660, 880] : kind === 'win' ? [523, 659, 784, 1047] : [330];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.11;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  } catch {
    // Audio is a nice-to-have.
  }
}
