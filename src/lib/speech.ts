// Browser speech helpers. Everything stays on the device; nothing is uploaded by the app.

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function englishVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === 'en-GB' && v.localService) ??
    voices.find((v) => v.lang === 'en-US' && v.localService) ??
    voices.find((v) => v.lang.startsWith('en'))
  );
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
  u.rate = slow ? 0.6 : 0.85;
  u.pitch = 1.05;
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
