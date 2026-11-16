import { Button, PageHeader } from '../../components/ui';
import { navigate } from '../../lib/router';
import { canListen, canSpeak, speak } from '../../lib/speech';
import { useStore } from '../../state/store';

export function Settings() {
  const { state, t, actions } = useStore();
  const s = state.settings;
  const toggle = (key: 'reducedMotion' | 'largeText' | 'sound', label: string, hint: string) => (
    <label className="toggle">
      <input type="checkbox" checked={s[key]} onChange={(e) => actions.updateChildSettings({ [key]: e.target.checked })} />
      <span>
        {label}
        <small>{hint}</small>
      </span>
    </label>
  );

  return (
    <div className="page narrow">
      <PageHeader emoji="⚙️" title={t('הגדרות ונגישות', 'Settings and accessibility')} />
      <section className="card">
        <h2>🌐 {t('שפת הממשק', 'Interface language')}</h2>
        <div className="pick-row">
          <button type="button" className={`pick wide ${s.uiLang === 'he' ? 'on' : ''}`} aria-pressed={s.uiLang === 'he'} onClick={() => actions.updateChildSettings({ uiLang: 'he' })}>עברית</button>
          <button type="button" className={`pick wide ${s.uiLang === 'en' ? 'on' : ''}`} aria-pressed={s.uiLang === 'en'} onClick={() => actions.updateChildSettings({ uiLang: 'en' })}>English</button>
        </div>
        <p className="soft-note">{t('תוכן הלימוד תמיד באנגלית. עזרה בעברית מופיעה רק כשמבקשים.', 'Learning content is always in English. Hebrew help appears only when you ask for it.')}</p>
      </section>
      <section className="card">
        <h2>♿ {t('נגישות', 'Accessibility')}</h2>
        {toggle('reducedMotion', t('הפחתת תנועה', 'Reduce motion'), t('בלי קונפטי ואנימציות', 'No confetti or animations'))}
        {toggle('largeText', t('טקסט גדול', 'Larger text'), t('מגדיל את כל הכתב', 'Makes all text bigger'))}
        {toggle('sound', t('צלילי משחק', 'Game sounds'), t('צלצולים קצרים על תשובות', 'Short chimes for answers'))}
      </section>
      <section className="card">
        <h2>🔊 {t('קול ומיקרופון', 'Voice and microphone')}</h2>
        <p>
          {canSpeak() ? `✅ ${t('הקראה באנגלית זמינה בדפדפן הזה.', 'English read-aloud works in this browser.')}` : `ℹ️ ${t('הקראה לא זמינה כאן — בכל משימת האזנה אפשר להציג את הטקסט.', 'Read-aloud is not available here — every listening mission can show its text instead.')}`}
        </p>
        <p>
          {canListen() ? `✅ ${t('זיהוי דיבור זמין (רשות בלבד).', 'Speech recognition is available (always optional).')}` : `ℹ️ ${t('זיהוי דיבור לא זמין — משימות הדיבור עובדות גם בלעדיו.', 'Speech recognition is not available — speaking missions work without it.')}`}
        </p>
        {canSpeak() && <Button variant="secondary" onClick={() => speak('Hello, explorer! Welcome to Quest Island.')}>🔊 {t('בדיקת קול', 'Test the voice')}</Button>}
      </section>
      <section className="card">
        <h2>👪 {t('להורים', 'For parents')}</h2>
        <p className="soft-note">{t('סיכום שבועי, פרסים, אישור משאלות ואיפוס נתונים נמצאים באזור ההורים.', 'Weekly summary, rewards, wish approvals and data reset live in the parent area.')}</p>
        <Button variant="secondary" onClick={() => navigate('parent')}>🔐 {t('כניסה לאזור ההורים', 'Open the parent area')}</Button>
      </section>
    </div>
  );
}
