import { useEffect, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { canSpeak, speak } from '../lib/speech';
import { useStore } from '../state/store';

/** English learning content: always left-to-right, even inside the Hebrew interface. */
export function En({ children, className = '', as: Tag = 'span' }: { children: ReactNode; className?: string; as?: 'span' | 'div' | 'p' }) {
  return (
    <Tag dir="ltr" lang="en" className={`en ${className}`}>
      {children}
    </Tag>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'coral' | 'quiet';

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: ComponentProps<'button'> & { variant?: Variant }) {
  return <button type="button" {...rest} className={`btn btn-${variant} ${className}`} />;
}

export function SpeakButton({ text, slow = false, label, className = '' }: { text: string; slow?: boolean; label?: string; className?: string }) {
  const { t } = useStore();
  if (!canSpeak()) return null;
  const name = label ?? (slow ? t('השמעה איטית', 'Play slowly') : t('השמעה', 'Play'));
  return (
    <button type="button" className={`icon-btn ${className}`} onClick={() => speak(text, slow)} aria-label={`${name}: ${text}`} title={name}>
      <span aria-hidden="true">{slow ? '🐢' : '🔊'}</span>
    </button>
  );
}

/** Optional Hebrew help: English first, Hebrew only when the child asks for it. */
export function HelpHint({ he }: { he: string }) {
  const { lang } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <span className="help-hint">
      <button type="button" className="help-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">💡</span> {lang === 'he' ? 'עזרה בעברית' : 'Hebrew help'}
      </button>
      {open && (
        <span className="help-text" dir="rtl" lang="he">
          {he}
        </span>
      )}
    </span>
  );
}

export function TicketPill({ amount, label }: { amount: number; label: string }) {
  return (
    <span className="ticket-pill" aria-label={`${amount} ${label}`}>
      <span aria-hidden="true">🎟️</span>
      <b>{amount}</b>
    </span>
  );
}

const CONFETTI_COLORS = ['#2ec4b6', '#ff6b6b', '#ffd166', '#7b5cff', '#ffffff'];

/** Short celebratory burst. Rendered only for meaningful achievements; hidden with reduced motion. */
export function Confetti() {
  const { state } = useStore();
  if (state.settings.reducedMotion) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 9) * 0.08}s`,
            animationDuration: `${1.6 + (i % 5) * 0.25}s`,
            borderRadius: i % 3 === 0 ? '50%' : '2px',
          }}
        />
      ))}
    </div>
  );
}

/** Moves keyboard focus to a newly shown element (e.g. the Next button after feedback). */
export function useFocusOnShow<T extends HTMLElement>(when: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (when) ref.current?.focus();
  }, [when]);
  return ref;
}

export function PageHeader({ title, sub, emoji }: { title: string; sub?: ReactNode; emoji?: string }) {
  return (
    <header className="page-header">
      <h1>
        {emoji && <span aria-hidden="true">{emoji} </span>}
        {title}
      </h1>
      {sub && <p>{sub}</p>}
    </header>
  );
}

/** A "next"/"back" arrow that points the right way in both RTL and LTR. */
export function Arrow({ back = false }: { back?: boolean }) {
  return (
    <span className={back ? 'arrow back' : 'arrow'} aria-hidden="true">
      →
    </span>
  );
}

export function Avatar({ size = 48, avatar }: { size?: number; avatar?: { emoji: string; color: string; gear: string } }) {
  const { state } = useStore();
  const a = avatar ?? state.profile?.avatar ?? { emoji: '🧒', color: '#2ec4b6', gear: '🧭' };
  return (
    <span className="avatar" style={{ width: size, height: size, background: a.color, fontSize: size * 0.55 }} aria-hidden="true">
      {a.emoji}
      <span className="avatar-gear" style={{ fontSize: size * 0.32 }}>{a.gear}</span>
    </span>
  );
}
