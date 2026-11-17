import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../components/ui';
import type { AccountNotice } from '../../state/account';
import { useAccount } from '../../state/account';
import { useStore } from '../../state/store';
import { useSync } from '../../sync/SyncProvider';

type T = (he: string, en: string) => string;

const MIN_PASSWORD = 8;
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

function errorText(code: string, t: T): string {
  switch (code) {
    case 'invalid_credentials':
      return t('האימייל או הסיסמה לא נכונים.', 'The email or password is not right.');
    case 'email_not_confirmed':
      return t('צריך לאשר קודם את כתובת האימייל. חפשו את המייל מאיתנו (גם בתיקיית הספאם).', 'Please confirm your email address first. Look for our email (check spam too).');
    case 'user_already_exists':
    case 'email_exists':
      return t('כבר יש חשבון עם האימייל הזה. אפשר להיכנס, או לאפס סיסמה.', 'There is already an account with this email. Sign in, or reset the password.');
    case 'weak_password':
      return t('הסיסמה חלשה מדי. בחרו סיסמה ארוכה יותר, עם אותיות ומספרים.', 'That password is too weak. Choose a longer one with letters and numbers.');
    case 'same_password':
      return t('הסיסמה החדשה זהה לישנה.', 'The new password is the same as the old one.');
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return t('יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.', 'Too many tries. Please wait a few minutes and try again.');
    case 'email_address_invalid':
    case 'validation_failed':
      return t('כתובת האימייל לא נראית תקינה.', 'That email address does not look right.');
    case 'signup_disabled':
      return t('ההרשמה סגורה כרגע.', 'Sign-up is closed at the moment.');
    default:
      return t('משהו השתבש. בדקו את החיבור לאינטרנט ונסו שוב.', 'Something went wrong. Check the internet connection and try again.');
  }
}

function PasswordFields({ id, password, setPassword, again, setAgain, t }: { id: string; password: string; setPassword: (s: string) => void; again: string; setAgain: (s: string) => void; t: T }) {
  return (
    <>
      <label htmlFor={`${id}-pw`} className="field-label">{t(`סיסמה (לפחות ${MIN_PASSWORD} תווים)`, `Password (at least ${MIN_PASSWORD} characters)`)}</label>
      <input id={`${id}-pw`} className="text-input" dir="ltr" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <label htmlFor={`${id}-pw2`} className="field-label">{t('שוב, לאישור', 'Again, to confirm')}</label>
      <input id={`${id}-pw2`} className="text-input" dir="ltr" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
    </>
  );
}

function checkNewPassword(password: string, again: string, t: T): string | null {
  if (password.length < MIN_PASSWORD) return t(`הסיסמה צריכה לפחות ${MIN_PASSWORD} תווים.`, `The password needs at least ${MIN_PASSWORD} characters.`);
  if (password !== again) return t('שתי הסיסמאות לא זהות.', 'The two passwords do not match.');
  return null;
}

type Mode = 'signin' | 'signup' | 'forgot' | 'sent-confirm' | 'sent-reset';

function SignedOut() {
  const { t } = useStore();
  const { actions } = useAccount();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [lastCode, setLastCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');

  const go = (m: Mode) => {
    setMode(m);
    setError('');
    setInfo('');
    setLastCode('');
  };

  const run = async (fn: () => Promise<{ ok: boolean; code?: string; needsConfirmation?: boolean }>, onOk: (r: { needsConfirmation?: boolean }) => void) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const r = await fn();
      if (r.ok) onOk(r);
      else {
        setLastCode(r.code ?? '');
        setError(errorText(r.code ?? '', t));
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!looksLikeEmail(email)) return setError(errorText('email_address_invalid', t));
    if (mode === 'signin') {
      if (!password) return setError(t('הקלידו סיסמה.', 'Type your password.'));
      void run(() => actions.signIn(email, password), () => setPassword(''));
    } else if (mode === 'signup') {
      const bad = checkNewPassword(password, again, t);
      if (bad) return setError(bad);
      if (!consent) return setError(t('צריך לאשר שאתם ההורים או האפוטרופוסים.', 'Please confirm that you are the parent or guardian.'));
      void run(() => actions.signUp(email, password), (r) => {
        setPassword('');
        setAgain('');
        if (r.needsConfirmation) go('sent-confirm');
      });
    } else if (mode === 'forgot') {
      void run(() => actions.sendReset(email), () => go('sent-reset'));
    }
  };

  if (mode === 'sent-confirm' || mode === 'sent-reset') {
    return (
      <section className="card">
        <h2>📧 {t('בדקו את תיבת הדואר', 'Check your inbox')}</h2>
        <p>
          {mode === 'sent-confirm'
            ? t('שלחנו קישור לאישור אל', 'We sent a confirmation link to')
            : t('אם יש חשבון עם הכתובת הזו, שלחנו קישור לאיפוס סיסמה אל', 'If there is an account with this address, we sent a password-reset link to')}{' '}
          <b dir="ltr">{email.trim()}</b>.{' '}
          {t('פתחו אותו במכשיר הזה. המייל לא הגיע? בדקו בתיקיית הספאם.', 'Open it on this device. No email? Check the spam folder.')}
        </p>
        {mode === 'sent-confirm' && (
          <Button variant="ghost" disabled={busy} onClick={() => void run(() => actions.resendConfirmation(email), () => setInfo(t('נשלח שוב.', 'Sent again.')))}>
            🔁 {t('שליחה חוזרת', 'Send again')}
          </Button>
        )}
        {info && <p className="soft-note" role="status">{info}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button onClick={() => go('signin')}>{t('לכניסה לחשבון', 'Go to sign in')}</Button>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>☁️ {t('חשבון משפחתי', 'Family account')}</h2>
      <p>{t('הורה נרשם פעם אחת עם אימייל, ונכנס עם אותו חשבון בכל מכשיר של המשפחה.', 'A parent registers once with an email address, then signs in with the same account on every family device.')}</p>
      {mode !== 'forgot' && (
        <div className="pick-row" role="group" aria-label={t('כניסה או הרשמה', 'Sign in or register')}>
          <button type="button" className={`pick wide ${mode === 'signin' ? 'on' : ''}`} aria-pressed={mode === 'signin'} onClick={() => go('signin')}>{t('כבר יש לי חשבון', 'I have an account')}</button>
          <button type="button" className={`pick wide ${mode === 'signup' ? 'on' : ''}`} aria-pressed={mode === 'signup'} onClick={() => go('signup')}>{t('הרשמה חדשה', 'Create an account')}</button>
        </div>
      )}
      <form className="child-form" onSubmit={submit} noValidate>
        {mode === 'forgot' && <p>{t('הקלידו את האימייל של החשבון ונשלח קישור לבחירת סיסמה חדשה.', 'Type the account email and we will send a link to choose a new password.')}</p>}
        <label htmlFor="acc-email" className="field-label">{t('אימייל של ההורה', 'Parent email')}</label>
        <input id="acc-email" className="text-input" dir="ltr" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode === 'signin' && (
          <>
            <label htmlFor="acc-pw" className="field-label">{t('סיסמה', 'Password')}</label>
            <input id="acc-pw" className="text-input" dir="ltr" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        )}
        {mode === 'signup' && (
          <>
            <PasswordFields id="acc-new" password={password} setPassword={setPassword} again={again} setAgain={setAgain} t={t} />
            <label className="toggle">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{t('אני ההורה או האפוטרופוס, ומסכים/ה שהתקדמות הלמידה של הילדים תישמר בחשבון כדי לסנכרן בין מכשירים.', 'I am the parent or guardian, and I agree that my children’s learning progress is stored in this account to sync between devices.')}</span>
            </label>
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        {lastCode === 'email_not_confirmed' && (
          <Button variant="ghost" disabled={busy} onClick={() => void run(() => actions.resendConfirmation(email), () => go('sent-confirm'))}>
            📧 {t('שליחת מייל אישור שוב', 'Send the confirmation email again')}
          </Button>
        )}
        <div className="row-center">
          {mode === 'forgot' && <Button variant="ghost" onClick={() => go('signin')}>{t('חזרה', 'Back')}</Button>}
          <Button type="submit" disabled={busy}>
            {busy ? '…' : mode === 'signin' ? t('כניסה', 'Sign in') : mode === 'signup' ? t('הרשמה', 'Create account') : t('שליחת קישור', 'Send link')}
          </Button>
        </div>
        {mode === 'signin' && (
          <button type="button" className="help-btn" onClick={() => go('forgot')}>{t('שכחתי סיסמה', 'Forgot password?')}</button>
        )}
      </form>
      <p className="soft-note">🔒 {t('האימייל משמש רק לכניסה ולאיפוס סיסמה. הסיסמה לא נשמרת באפליקציה.', 'The email is used only to sign in and reset the password. The app never stores the password.')}</p>
    </section>
  );
}

function SignedIn() {
  const { t } = useStore();
  const { email, familyId, familyError, actions } = useAccount();
  const [changing, setChanging] = useState(false);
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const bad = checkNewPassword(password, again, t);
    if (bad) return setError(bad);
    setBusy(true);
    const r = await actions.updatePassword(password);
    setBusy(false);
    if (r.ok) {
      setChanging(false);
      setPassword('');
      setAgain('');
      setError('');
      setMsg(t('הסיסמה עודכנה.', 'Password updated.'));
    } else setError(errorText(r.code, t));
  };

  return (
    <>
      <section className="card">
        <h2>☁️ {t('חשבון משפחתי', 'Family account')}</h2>
        <p>
          {t('מחובר/ת בתור', 'Signed in as')} <b dir="ltr">{email}</b>
        </p>
        {familyId && !familyError && <p className="chip chip-good">✓ {t('המשפחה נוצרה בחשבון', 'Family is set up in the account')}</p>}
        {familyError && (
          <p className="form-error" role="alert">
            {t('לא הצלחנו לקרוא את נתוני המשפחה מהשרת. ייתכן שמסד הנתונים עוד לא הוגדר (supabase/schema.sql).', 'Could not read the family from the server. The database may not be set up yet (supabase/schema.sql).')}
          </p>
        )}
        <SyncStatusCard />
        {msg && <p className="soft-note" role="status">{msg}</p>}
        <div className="row-center">
          <Button variant="ghost" onClick={() => { setChanging(!changing); setMsg(''); setError(''); }}>🔑 {t('החלפת סיסמה', 'Change password')}</Button>
          <Button variant="ghost" onClick={() => void actions.signOut()}>🚪 {t('יציאה מהחשבון במכשיר הזה', 'Sign out on this device')}</Button>
        </div>
        <p className="soft-note">{t('יציאה מהחשבון משאירה במכשיר הזה עותק של הנתונים, אבל הוא מפסיק להסתנכרן.', 'Signing out keeps a copy of the data on this device, but it stops syncing.')}</p>
      </section>
      <LinkChoiceCard />
      {changing && (
        <section className="card">
          <h2>🔑 {t('סיסמה חדשה', 'New password')}</h2>
          <form className="child-form" onSubmit={save} noValidate>
            <PasswordFields id="acc-change" password={password} setPassword={setPassword} again={again} setAgain={setAgain} t={t} />
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="row-center">
              <Button variant="ghost" onClick={() => setChanging(false)}>{t('ביטול', 'Cancel')}</Button>
              <Button type="submit" disabled={busy}>{t('שמירה', 'Save')}</Button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}

function useAgo() {
  const { lang } = useStore();
  const rtf = new Intl.RelativeTimeFormat(lang === 'he' ? 'he' : 'en', { numeric: 'auto' });
  return (iso: string) => {
    const s = Math.round((Date.parse(iso) - Date.now()) / 1000);
    if (Math.abs(s) < 60) return rtf.format(Math.min(0, s), 'second');
    const m = Math.round(s / 60);
    if (Math.abs(m) < 60) return rtf.format(m, 'minute');
    const h = Math.round(m / 60);
    return Math.abs(h) < 24 ? rtf.format(h, 'hour') : rtf.format(Math.round(h / 24), 'day');
  };
}

function SyncStatusCard() {
  const { t } = useStore();
  const sync = useSync();
  const ago = useAgo();
  const last = sync.lastSyncAt ? t(`סונכרן לאחרונה ${ago(sync.lastSyncAt)}`, `Last synced ${ago(sync.lastSyncAt)}`) : '';
  const text: Record<typeof sync.status, [string, string, string]> = {
    off: ['⏸', 'הסנכרון כבוי.', 'Sync is off.'],
    syncing: ['🔄', 'מסנכרן…', 'Syncing…'],
    idle: ['✅', `ההתקדמות של כל הילדים מסונכרנת בין המכשירים. ${last}`, `Every child’s progress is synced between devices. ${last}`],
    offline: ['📴', 'אין חיבור לאינטרנט. השינויים נשמרים במכשיר ויעלו אוטומטית כשהחיבור יחזור.', 'No internet connection. Changes are saved on this device and upload automatically when it is back.'],
    'needs-choice': ['🤝', 'צריך להחליט איך לחבר את המכשיר הזה לחשבון (למטה).', 'Choose how to connect this device to the account (below).'],
    'needs-migration': ['🛠️', 'מסד הנתונים צריך עדכון: הריצו את supabase/migrations/002_sync.sql ב-Supabase.', 'The database needs an update: run supabase/migrations/002_sync.sql in Supabase.'],
    error: ['⚠️', 'הסנכרון נכשל. ננסה שוב אוטומטית.', 'Sync failed. It will try again automatically.'],
  };
  const [emoji, he, en] = text[sync.status];
  return (
    <div className={`notice ${sync.status === 'error' || sync.status === 'needs-migration' ? 'notice-coral' : 'notice-plan'}`} role="status">
      <span aria-hidden="true">{emoji}</span>
      <p>
        {t(he, en)}
        {sync.status === 'error' && sync.error && <><br /><small dir="ltr">{sync.error}</small></>}
        {sync.status !== 'syncing' && sync.status !== 'off' && (
          <>
            <br />
            <button type="button" className="help-btn" onClick={sync.syncNow}>🔄 {t('סנכרון עכשיו', 'Sync now')}</button>
          </>
        )}
      </p>
    </div>
  );
}

/** First sign-in on a device that already has children while the account has children too. */
function LinkChoiceCard() {
  const { t, household } = useStore();
  const sync = useSync();
  const [confirmReplace, setConfirmReplace] = useState(false);
  if (sync.status !== 'needs-choice') return null;
  const here = household.children.map((c) => c.profile.name);
  const there = sync.accountChildren.map((c) => c.name);
  return (
    <section className="card">
      <h2>🤝 {t('לחבר את המכשיר הזה לחשבון', 'Connect this device to the account')}</h2>
      <p>
        {t('בחשבון כבר יש:', 'The account already has:')} <b><bdi>{there.join(', ')}</bdi></b>
        <br />
        {t('במכשיר הזה יש:', 'This device has:')} <b><bdi>{here.join(', ')}</bdi></b>
      </p>
      <div className="row-center">
        <Button onClick={() => sync.choose('add')}>➕ {t('להוסיף את הילדים מהמכשיר הזה לחשבון', 'Add this device’s children to the account')}</Button>
        <Button variant="ghost" onClick={() => setConfirmReplace(true)}>{t('להשתמש רק בילדים מהחשבון', 'Use only the account’s children')}</Button>
      </div>
      <p className="soft-note">{t('הוספה שומרת את כל ההתקדמות משני הצדדים. אם אותו ילד מופיע בשניהם, הוא יופיע פעמיים — אפשר להסיר את הכפול בלשונית "ילדים". קוד ההורים והפרסים יגיעו מהחשבון.', 'Adding keeps all progress from both sides. If the same child is on both, they appear twice — remove the extra one in the Children tab. The parent PIN and rewards come from the account.')}</p>
      {confirmReplace && (
        <div className="feedback feedback-clue" role="alertdialog" aria-label={t('אישור', 'Confirm')}>
          <strong>{t(`הילדים במכשיר הזה (${here.join(', ')}) והתקדמותם יימחקו מהמכשיר הזה, ובמקומם יופיעו הילדים מהחשבון. לא ניתן לבטל.`, `This device’s children (${here.join(', ')}) and their progress are deleted from this device and replaced by the account’s children. This cannot be undone.`)}</strong>
          <div className="row-center">
            <Button variant="ghost" onClick={() => setConfirmReplace(false)}>{t('ביטול', 'Cancel')}</Button>
            <Button variant="coral" onClick={() => sync.choose('replace')}>{t('כן, להשתמש בחשבון', 'Yes, use the account')}</Button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Sign-in on a brand-new device, from the welcome screen: the family downloads automatically. */
export function OnboardingSignIn({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  const { t } = useStore();
  const { status, email } = useAccount();
  const sync = useSync();
  if (status !== 'signed-in') {
    return (
      <div className="onb-step">
        <SignedOut />
        <button type="button" className="help-btn" onClick={onBack}>{t('חזרה', 'Back')}</button>
      </div>
    );
  }
  const empty = sync.status === 'idle';
  return (
    <div className="onb-step">
      <div className="onb-art" aria-hidden="true">☁️</div>
      <h1>{t('מחובר/ת לחשבון המשפחתי', 'Signed in to the family account')}</h1>
      <p dir="ltr">{email}</p>
      {empty ? (
        <>
          <p>{t('בחשבון עוד אין ילדים. ממשיכים ליצירת הפרופיל הראשון — הוא יישמר בחשבון.', 'The account has no children yet. Continue to create the first profile — it will be saved to the account.')}</p>
          <Button onClick={onContinue}>{t('המשך', 'Continue')}</Button>
        </>
      ) : (
        <SyncStatusCard />
      )}
    </div>
  );
}

/** Parent dashboard tab. */
export function FamilyAccount() {
  const { t } = useStore();
  const { status } = useAccount();
  if (status === 'off') return null;
  if (status === 'loading') return <p className="soft-note" role="status">{t('טוען…', 'Loading…')}</p>;
  return status === 'signed-in' ? <SignedIn /> : <SignedOut />;
}

const NOTICE_TEXT: Record<AccountNotice, [he: string, en: string]> = {
  confirmed: ['האימייל אושר וההרשמה הושלמה. החשבון מחובר במכשיר הזה.', 'Email confirmed — your account is ready and signed in on this device.'],
  'confirmed-sign-in': ['האימייל אושר. היכנסו עם האימייל והסיסמה באזור ההורים ← חשבון.', 'Email confirmed. Sign in with your email and password in the parent area → Account.'],
  'link-expired': ['הקישור כבר לא בתוקף. בקשו קישור חדש באזור ההורים ← חשבון.', 'That link has expired. Ask for a new one in the parent area → Account.'],
  'link-failed': ['לא הצלחנו להשתמש בקישור. נסו שוב מאזור ההורים ← חשבון.', 'That link could not be used. Try again from the parent area → Account.'],
  'password-updated': ['הסיסמה החדשה נשמרה.', 'Your new password is saved.'],
};

/** App-wide layer: messages from email links, and the "choose a new password" screen. */
export function AccountLayer() {
  const { t } = useStore();
  const { recovery, notice, actions } = useAccount();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const bad = checkNewPassword(password, again, t);
    if (bad) return setError(bad);
    setBusy(true);
    const r = await actions.updatePassword(password);
    setBusy(false);
    if (!r.ok) setError(errorText(r.code, t));
  };

  return (
    <>
      {notice && (
        <div className="account-toast" role="status">
          <span>{t(...NOTICE_TEXT[notice])}</span>
          <button type="button" className="icon-btn" onClick={actions.clearNotice} aria-label={t('סגירה', 'Close')}>✕</button>
        </div>
      )}
      {recovery && (
        <div className="account-overlay" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
          <form className="onb-card child-form" onSubmit={save} noValidate>
            <div className="onb-art" aria-hidden="true">🔑</div>
            <h1 id="recovery-title">{t('בחירת סיסמה חדשה', 'Choose a new password')}</h1>
            <PasswordFields id="acc-recover" password={password} setPassword={setPassword} again={again} setAgain={setAgain} t={t} />
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="row-center">
              <Button variant="ghost" onClick={() => void actions.cancelRecovery()}>{t('ביטול', 'Cancel')}</Button>
              <Button type="submit" disabled={busy}>{t('שמירת הסיסמה', 'Save password')}</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
