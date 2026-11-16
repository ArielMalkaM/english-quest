import { useState } from 'react';
import { AVATAR_COLORS, AVATAR_EMOJI, AVATAR_GEAR, AvatarPicker } from '../../components/AvatarPicker';
import { Arrow, Button } from '../../components/ui';
import { DEMO_PIN } from '../../data/seed';
import { isValidPin } from '../../domain/parentAuth';
import type { Lang, LearnerProfile } from '../../domain/types';
import { useStore } from '../../state/store';

const THEMES = [
  { id: 'Animals', he: 'חיות', emoji: '🐾' },
  { id: 'Sports', he: 'ספורט', emoji: '⚽' },
  { id: 'Space and robots', he: 'חלל ורובוטים', emoji: '🚀' },
  { id: 'Art and music', he: 'אמנות ומוזיקה', emoji: '🎨' },
  { id: 'Mysteries', he: 'תעלומות', emoji: '🔎' },
  { id: 'Food and cooking', he: 'אוכל ובישול', emoji: '🍕' },
];

export function Onboarding() {
  const { t, lang, actions } = useStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<LearnerProfile['avatar']>({ emoji: AVATAR_EMOJI[0], color: AVATAR_COLORS[0], gear: AVATAR_GEAR[0] });
  const [theme, setTheme] = useState(THEMES[0].id);
  const [goal, setGoal] = useState<10 | 15 | 20>(15);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const setLang = (l: Lang) => actions.updateChildSettings({ uiLang: l });

  const finish = (withPin: boolean) => {
    if (withPin && !isValidPin(pin)) return setError(t('הקוד חייב להיות 4 ספרות.', 'The PIN must be 4 digits.'));
    actions.finishOnboarding(
      { name: name.trim().slice(0, 20), avatar, favoriteTheme: theme, dailyGoalMinutes: goal, createdAt: new Date().toISOString() },
      withPin ? pin : null,
      lang,
    );
  };

  const steps = [
    // 0 — welcome
    <div key="welcome" className="onb-step">
      <div className="onb-art" aria-hidden="true">🏝️</div>
      <h1 dir="ltr" lang="en">English Quest</h1>
      <p>{t('ברוכים הבאים לאי המסע! האי איבד את הצבעים שלו — ורק מי שלומד אנגלית יכול להחזיר אותם. 10 עד 20 דקות ביום, משימה אחת בכל פעם.', 'Welcome to Quest Island! The island has lost its colours — and only someone learning English can bring them back. 10–20 minutes a day, one quest at a time.')}</p>
      <div className="pick-row center">
        <button type="button" className={`pick wide ${lang === 'he' ? 'on' : ''}`} aria-pressed={lang === 'he'} onClick={() => setLang('he')}>עברית</button>
        <button type="button" className={`pick wide ${lang === 'en' ? 'on' : ''}`} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
      </div>
      <Button onClick={() => setStep(1)}>{t('יוצאים למסע!', 'Start the adventure!')} ▶</Button>
      <Button variant="ghost" onClick={() => actions.loadDemo()}>
        {t(`רק להציץ: טעינת הדגמה מוכנה (קוד הורים ${DEMO_PIN})`, `Just looking: load a ready-made demo (parent PIN ${DEMO_PIN})`)}
      </Button>
    </div>,
    // 1 — name
    <div key="name" className="onb-step">
      <div className="onb-art" aria-hidden="true">👋</div>
      <h1>{t('איך קוראים לך, חוקר/ת?', 'What is your explorer name?')}</h1>
      <label htmlFor="onb-name" className="field-label">{t('כינוי (נשמר רק במכשיר הזה)', 'Nickname (saved only on this device)')}</label>
      <input id="onb-name" className="text-input wide" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="off" />
      <Button disabled={!name.trim()} onClick={() => setStep(2)}>{t('הבא', 'Next')} <Arrow /></Button>
    </div>,
    // 2 — avatar
    <div key="avatar" className="onb-step">
      <h1>{t('עצבו את החוקר/ת שלכם', 'Design your explorer')}</h1>
      <AvatarPicker value={avatar} onChange={setAvatar} />
      <Button onClick={() => setStep(3)}>{t('הבא', 'Next')} <Arrow /></Button>
    </div>,
    // 3 — theme + goal
    <div key="theme" className="onb-step">
      <h1>{t('מה הכי מעניין אותך?', 'What do you like most?')}</h1>
      <div className="pick-row center" role="group" aria-label={t('נושא אהוב', 'Favourite theme')}>
        {THEMES.map((th) => (
          <button key={th.id} type="button" className={`pick tile ${theme === th.id ? 'on' : ''}`} aria-pressed={theme === th.id} onClick={() => setTheme(th.id)}>
            <span aria-hidden="true">{th.emoji}</span>
            {lang === 'he' ? th.he : th.id}
          </button>
        ))}
      </div>
      <h2>{t('כמה זמן ביום?', 'How long each day?')}</h2>
      <div className="pick-row center" role="group" aria-label={t('יעד יומי', 'Daily goal')}>
        {([10, 15, 20] as const).map((m) => (
          <button key={m} type="button" className={`pick wide ${goal === m ? 'on' : ''}`} aria-pressed={goal === m} onClick={() => setGoal(m)}>
            {m} {t('דקות', 'minutes')}
          </button>
        ))}
      </div>
      <Button onClick={() => setStep(4)}>{t('הבא', 'Next')} <Arrow /></Button>
    </div>,
    // 4 — parent PIN
    <div key="pin" className="onb-step">
      <div className="onb-art" aria-hidden="true">👪</div>
      <h1>{t('רגע להורים', 'A moment for a parent')}</h1>
      <p>{t('בחרו קוד בן 4 ספרות לאזור ההורים. שם מאשרים פרסים ורואים את ההתקדמות. אפשר גם לדלג ולהגדיר אחר כך.', 'Choose a 4-digit PIN for the parent area, where rewards are approved and progress is shown. You can also skip and set it later.')}</p>
      <label htmlFor="onb-pin" className="field-label">{t('קוד הורים (רשות)', 'Parent PIN (optional)')}</label>
      <input id="onb-pin" className="text-input pin" dir="ltr" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="soft-note">🔒 {t('בלי חשבון, בלי פרסומות, בלי אינטרנט: הכול נשאר במכשיר הזה.', 'No account, no ads, no tracking: everything stays on this device.')}</p>
      <Button onClick={() => finish(true)} disabled={pin.length === 0}>{t('שמירה ויציאה לאי', 'Save and go to the island')} 🏝️</Button>
      <Button variant="ghost" onClick={() => finish(false)}>{t('דילוג בינתיים', 'Skip for now')}</Button>
    </div>,
  ];

  return (
    <div className="onboarding">
      <div className="onb-card">
        <div className="counter" aria-label={t(`שלב ${step + 1} מתוך ${steps.length}`, `Step ${step + 1} of ${steps.length}`)}>
          {steps.map((_, i) => (
            <i key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />
          ))}
        </div>
        {steps[step]}
        {step > 0 && (
          <button type="button" className="help-btn" onClick={() => setStep(step - 1)}><Arrow back /> {t('חזרה', 'Back')}</button>
        )}
      </div>
    </div>
  );
}
