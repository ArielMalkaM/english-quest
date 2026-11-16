import { useState } from 'react';
import type { FormEvent } from 'react';
import { gradeLabel } from '../../components/GradePicker';
import { Arrow, Avatar, Button } from '../../components/ui';
import { lessonOrder } from '../../data/curriculum';
import { isLessonComplete } from '../../domain/progress';
import { navigate } from '../../lib/router';
import { useStore } from '../../state/store';

/** "Who is playing?" — each child signs in with their own optional 4-digit code. */
export function ChildPicker() {
  const { household, t, lang, actions } = useStore();
  const [picked, setPicked] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const child = household.children.find((c) => c.id === picked) ?? null;

  const choose = (id: string) => {
    const c = household.children.find((x) => x.id === id);
    if (!c) return;
    if (c.codeHash === null) {
      actions.selectChild(id);
      navigate('');
      return;
    }
    setPicked(id);
    setCode('');
    setError('');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!picked) return;
    if (actions.selectChild(picked, code)) {
      navigate('');
    } else {
      setError(t('הקוד לא נכון. נסו שוב, או בקשו עזרה מהורה.', 'That code is not right. Try again, or ask a parent.'));
      setCode('');
    }
  };

  return (
    <div className="onboarding">
      <div className="onb-card picker-card">
        {child ? (
          <form className="onb-step" onSubmit={submit}>
            <Avatar size={72} avatar={child.profile.avatar} />
            <h1>{t('שלום', 'Hi')} <bdi>{child.profile.name}</bdi>!</h1>
            <label htmlFor="child-code" className="field-label">{t('הקוד הסודי שלך (4 ספרות)', 'Your secret code (4 digits)')}</label>
            <input
              id="child-code"
              className="text-input pin"
              dir="ltr"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <Button type="submit" disabled={code.length !== 4}>{t('כניסה לאי', 'Enter the island')} 🏝️</Button>
            <button type="button" className="help-btn" onClick={() => setPicked(null)}><Arrow back /> {t('חזרה', 'Back')}</button>
          </form>
        ) : (
          <div className="onb-step">
            <div className="onb-art" aria-hidden="true">🏝️</div>
            <h1>{t('מי משחק/ת עכשיו?', 'Who is playing?')}</h1>
            <ul className="player-grid">
              {household.children.map((c) => {
                const order = lessonOrder(c.profile.grade);
                const done = order.filter((id) => isLessonComplete(c.progress, id)).length;
                return (
                  <li key={c.id}>
                    <button type="button" className="player-card" onClick={() => choose(c.id)}>
                      <Avatar size={64} avatar={c.profile.avatar} />
                      <b><bdi>{c.profile.name}</bdi></b>
                      <small>{gradeLabel(c.profile.grade, lang)} · {done}/{order.length} {t('משימות', 'quests')}</small>
                      {c.codeHash !== null && <span className="player-lock" aria-label={t('מוגן בקוד', 'Protected by a code')}>🔒</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="pick-row center">
              <button type="button" className={`pick wide ${lang === 'he' ? 'on' : ''}`} aria-pressed={lang === 'he'} onClick={() => actions.updateChildSettings({ uiLang: 'he' })}>עברית</button>
              <button type="button" className={`pick wide ${lang === 'en' ? 'on' : ''}`} aria-pressed={lang === 'en'} onClick={() => actions.updateChildSettings({ uiLang: 'en' })}>English</button>
            </div>
            <Button variant="ghost" onClick={() => navigate('parent')}>👪 {t('אזור ההורים: הוספה וניהול ילדים', 'Parent area: add and manage children')}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
