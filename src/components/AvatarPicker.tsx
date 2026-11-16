import type { LearnerProfile } from '../domain/types';
import { useStore } from '../state/store';

export const AVATAR_EMOJI = ['🧒', '👧','🦊', '🐼', '🦁', '🐙', '🦄', '🤖', '🐯', '🦉', '🐬', '🧙'];
export const AVATAR_COLORS = ['#2ec4b6', '#ff6b6b', '#ffd166', '#7b5cff', '#4dabf7', '#ff9f1c'];
export const AVATAR_GEAR = ['🧭', '🎒', '🔭', '🗺️', '🪁', '⚓'];

type AvatarValue = LearnerProfile['avatar'];

export function AvatarPicker({ value, onChange }: { value: AvatarValue; onChange: (v: AvatarValue) => void }) {
  const { t } = useStore();
  const group = (label: string, items: string[], current: string, key: keyof AvatarValue, color = false) => (
    <fieldset className="pick-group">
      <legend>{label}</legend>
      <div className="pick-row">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            className={`pick ${current === item ? 'on' : ''} ${color ? 'pick-color' : ''}`}
            style={color ? { background: item } : undefined}
            aria-pressed={current === item}
            aria-label={color ? `${label} ${items.indexOf(item) + 1}` : item}
            onClick={() => onChange({ ...value, [key]: item })}
          >
            {color ? '' : item}
          </button>
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="avatar-picker">
      <span className="avatar big" style={{ background: value.color }} aria-hidden="true">
        {value.emoji}
        <span className="avatar-gear">{value.gear}</span>
      </span>
      {group(t('דמות', 'Character'), AVATAR_EMOJI, value.emoji, 'emoji')}
      {group(t('צבע', 'Colour'), AVATAR_COLORS, value.color, 'color', true)}
      {group(t('ציוד', 'Explorer gear'), AVATAR_GEAR, value.gear, 'gear')}
    </div>
  );
}
