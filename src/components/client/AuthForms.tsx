'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { ApiError, api, json } from '@/api-client/http';
import {
  PHONE_COUNTRIES,
  PASSWORD_RULE,
  phoneCountrySchema,
  normalizePhoneNumber,
  newPassword,
  registrationFormSchema,
  type PhoneCountry,
} from '@/lib/validators';
import styles from './AuthForms.module.css';
import { safeBookingDestination } from '@/lib/bookingNavigation';

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'verify';
type RegistrationField = 'fullName' | 'email' | 'localPhone' | 'password' | 'consent';
type RegistrationErrors = Partial<Record<RegistrationField, string>>;

const DRAFT_KEY = 'dm-events-registration-draft-v1';
const BOOKING_INTENT_KEY = 'dm-events-pending-booking-v1';
// UI-only progress hint. The backend verifies OTPs and controls account access.
const VERIFICATION_STATE_KEY = 'dm-events-pending-otp-progress-v1';
type OtpProgress = { email: string; emailVerified: boolean; phoneVerified: boolean };
function rememberOtpProgress(progress: OtpProgress) {
  try { sessionStorage.setItem(VERIFICATION_STATE_KEY, JSON.stringify(progress)); }
  catch { /* Optional browser storage. */ }
}

const TITLES: Record<Mode, string> = {
  login: 'WELCOME BACK',
  register: 'CREATE AN ACCOUNT',
  forgot: 'FORGOT PASSWORD',
  reset: 'RESET PASSWORD',
  verify: 'VERIFY YOUR ACCOUNT',
};

export default function AuthForms({ mode }: { mode: Mode }) {
  const router = useRouter();
  const query = useSearchParams();
  const next = safeBookingDestination(query.get('next'));
  const [pendingBooking, setPendingBooking] = useState<string | null>(next);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState<PhoneCountry>('PH');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpEmail, setOtpEmail] = useState(query.get('email') ?? '');
  const [emailCode, setEmailCode] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [verifiedChannels, setVerifiedChannels] = useState({EMAIL:false,PHONE:false});
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<RegistrationField, boolean>>>({});
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const verificationEmailFromUrl = query.get('email');
  const isVerificationComplete = query.get('verified') === '1';
  const legacyVerificationToken = query.get('token');

  // Signup and password-correct pending login both navigate here automatically.
  // Restore only visual progress for the same email; never use it for authorization.
  useEffect(() => {
    if (mode !== 'verify' || legacyVerificationToken) return;
    const normalized = (verificationEmailFromUrl ?? '').trim().toLowerCase();
    if (!normalized) return;
    setOtpEmail(normalized);
    setVerifiedChannels({ EMAIL: false, PHONE: false });
    try {
      const saved = sessionStorage.getItem(VERIFICATION_STATE_KEY);
      if (!saved) return;
      const progress = JSON.parse(saved) as Partial<OtpProgress>;
      if (progress.email === normalized) {
        setVerifiedChannels({ EMAIL: progress.emailVerified === true, PHONE: progress.phoneVerified === true });
      }
    } catch { /* Storage may be disabled or empty. */ }
  }, [mode, verificationEmailFromUrl, legacyVerificationToken]);

  useEffect(() => {
    if (mode !== 'login' || !isVerificationComplete) return;
    if (verificationEmailFromUrl) setEmail(verificationEmailFromUrl);
    setMessage('Your email and phone are verified. Log in to continue.');
  }, [mode, isVerificationComplete, verificationEmailFromUrl]);

  // Carry package intent across Login → Register → Login, including email verification.
  // Store only a validated internal booking URL, never an arbitrary redirect.
  useEffect(() => {
    if (mode !== 'login' && mode !== 'register') return;
    try {
      if (next) {
        sessionStorage.setItem(BOOKING_INTENT_KEY, next);
        setPendingBooking(next);
      } else {
        setPendingBooking(safeBookingDestination(sessionStorage.getItem(BOOKING_INTENT_KEY)));
      }
    } catch {
      setPendingBooking(next);
    }
  }, [mode, next]);

  // Restore the non-sensitive fields when the client returns to registration.
  useEffect(() => {
    if (mode !== 'register') return;
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) {
        const data: unknown = JSON.parse(saved);
        if (data && typeof data === 'object') {
          const draft = data as Record<string, unknown>;
          if (typeof draft.fullName === 'string') setName(draft.fullName);
          if (typeof draft.email === 'string') setEmail(draft.email);
          if (typeof draft.localPhone === 'string') setPhone(draft.localPhone);
          if (phoneCountrySchema.safeParse(draft.country).success) {
            setCountry(draft.country as PhoneCountry);
          }
          if (typeof draft.consent === 'boolean') setConsent(draft.consent);
        }
      }
    } catch {
      // Browsers may disable session storage, or the saved draft may be malformed.
    } finally {
      setDraftLoaded(true);
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'register' || !draftLoaded) return;
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ fullName: name, email, country, localPhone: phone, consent })
      );
    } catch {
      // Continue without draft persistence if storage is unavailable.
    }
  }, [mode, draftLoaded, name, email, country, phone, consent]);

  const values = useMemo(
    () => ({ fullName: name, email, country, localPhone: phone, password, consent }),
    [name, email, country, phone, password, consent]
  );

  const registrationErrors = useMemo<RegistrationErrors>(() => {
    if (mode !== 'register') return {};
    const parsed = registrationFormSchema.safeParse(values);
    if (parsed.success) return {};
    const errors: RegistrationErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as RegistrationField;
      if (field && !errors[field]) errors[field] = issue.message;
    }
    return errors;
  }, [mode, values]);

  const resetPasswordError = useMemo(() => {
    if (mode !== 'reset') return '';
    const parsed = newPassword.safeParse(password);
    return parsed.success ? '' : (parsed.error.issues[0]?.message ?? '');
  }, [mode, password]);

  const fieldError = (field: RegistrationField) =>
    touched[field] ? registrationErrors[field] : undefined;

  function markTouched(field: RegistrationField) {
    setTouched((previous) => ({ ...previous, [field]: true }));
    setError('');
  }

  const hasPasswordError =
    mode === 'register'
      ? !!fieldError('password')
      : mode === 'reset' && !!touched.password && !!resetPasswordError;

  const visiblePasswordError =
    mode === 'register'
      ? fieldError('password')
      : mode === 'reset' && touched.password
        ? resetPasswordError
        : '';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (mode === 'verify' && !legacyVerificationToken) {
      await verifyOtp(verifiedChannels.EMAIL ? 'PHONE' : 'EMAIL');
      return;
    }

    let registrationPayload:
      | { fullName: string; email: string; phone: string; password: string; consent: true }
      | undefined;

    if (mode === 'register') {
      const parsed = registrationFormSchema.safeParse(values);
      if (!parsed.success) {
        setTouched({ fullName: true, email: true, localPhone: true, password: true, consent: true });
        setError('Please correct the highlighted fields.');
        return;
      }

      const normalizedPhone = normalizePhoneNumber(
        parsed.data.localPhone,
        parsed.data.country
      );
      if (!normalizedPhone) {
        markTouched('localPhone');
        setError('Enter a valid contact number.');
        return;
      }

      registrationPayload = {
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        phone: normalizedPhone,
        password: parsed.data.password,
        consent: true,
      };
    }

    if (mode === 'reset' && confirmPassword !== password) { setError('Passwords do not match.'); return; }
    if (mode === 'reset' && !newPassword.safeParse(password).success) {
      markTouched('password');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'login') {
        const result = await api<{ user: { role: string } }>(
          '/api/auth/login',
          json('POST', { email, password })
        );
        const destination = result.user.role === 'ADMIN'
          ? '/admin'
          : result.user.role === 'COORDINATOR'
            ? '/coordinator'
            : (next ?? pendingBooking ?? '/client');
        // Consume the pending intent on any successful login, including staff login,
        // so it cannot unexpectedly affect a different session later.
        try { sessionStorage.removeItem(BOOKING_INTENT_KEY); } catch { /* Storage optional. */ }
        router.replace(destination);
        router.refresh();
      } else if (mode === 'register') {
        const result = await api<{ verificationRequired: boolean; email:string; sent:{email:boolean;phone:boolean} }>(
          '/api/auth/register',
          json('POST', registrationPayload!)
        );

        try {
          sessionStorage.removeItem(DRAFT_KEY);
        } catch {
          // Safe to ignore when storage is disabled.
        }
        setPassword('');
        setShowPassword(false);
        setTouched({});

        if (result.verificationRequired) {
          rememberOtpProgress({ email: result.email.toLowerCase(), emailVerified: false, phoneVerified: false });
          router.replace(`/verify-email?email=${encodeURIComponent(result.email)}`);
        } else {
          try { sessionStorage.removeItem(BOOKING_INTENT_KEY); } catch { /* Storage optional. */ }
          router.replace(next ?? pendingBooking ?? '/client');
          router.refresh();
        }
      } else if (mode === 'forgot') {
        await api('/api/auth/forgot', json('POST', { email }));
        setMessage('If the account exists, password recovery instructions have been sent.');
      } else if (mode === 'reset') {
        await api('/api/auth/reset', json('POST', { token: query.get('token'), password }));
        setPassword('');
        setConfirmPassword('');
        setShowPassword(false);
        setMessage('Password changed. You can now log in.');
      } else if (mode === 'verify' && query.get('token')) {
        await api('/api/auth/verify', json('POST', { token: query.get('token') }));
        setMessage('Email verified. Log in to continue.');
      }
    } catch (caught) {
      if (mode === 'login' && caught instanceof ApiError &&
          caught.status === 403 && caught.code === 'ACCOUNT_VERIFICATION_REQUIRED') {
        const pendingEmail = caught.details?.email;
        if (pendingEmail) {
          rememberOtpProgress({
            email: pendingEmail.toLowerCase(),
            emailVerified: caught.details?.emailVerified === true,
            phoneVerified: caught.details?.phoneVerified === true,
          });
          setPassword('');
          router.replace(`/verify-email?email=${encodeURIComponent(pendingEmail)}`);
          return;
        }
      }
      setError(caught instanceof Error ? caught.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(channel: 'EMAIL'|'PHONE') {
    if (busy) return;
    setError(''); setMessage('');
    const code = channel === 'EMAIL' ? emailCode : phoneCode;
    if (!/^\d{6}$/.test(code)) {setError('Enter the six-digit verification code.');return;}
    setBusy(true);
    try {
      const result = await api<{completed:boolean,emailVerified:boolean,phoneVerified:boolean}>(
        '/api/auth/verify',json('POST',{email:otpEmail.trim().toLowerCase(),channel,code}));
      setVerifiedChannels({EMAIL:result.emailVerified,PHONE:result.phoneVerified});
      if (channel==='EMAIL') setEmailCode(''); else setPhoneCode('');
      const normalizedEmail = otpEmail.trim().toLowerCase();
      if (result.completed) {
        try { sessionStorage.removeItem(VERIFICATION_STATE_KEY); }
        catch { /* Optional storage. */ }
        // OTP verification activates the account; it never signs the user in
        // without their password. Show confirmation on the normal login page.
        router.replace(`/login?verified=1&email=${encodeURIComponent(normalizedEmail)}`);
        return;
      }
      rememberOtpProgress({ email: normalizedEmail, emailVerified: result.emailVerified, phoneVerified: result.phoneVerified });
      setMessage(`${channel === 'EMAIL' ? 'Email' : 'Phone'} verified. Complete the other verification to activate your account.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not verify code.'); }
    finally { setBusy(false); }
  }

  async function resendOtp(channel: 'EMAIL'|'PHONE') {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api('/api/auth/resend-verification',json('POST',{email:otpEmail.trim().toLowerCase(),channel}));
      setMessage(`If verification is pending, a new ${channel === 'EMAIL' ? 'email' : 'SMS'} code has been requested.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to resend code.'); }
    finally { setBusy(false); }
  }

  return (
    <section
      className="auth-stage"
      style={{
        backgroundImage:
          "linear-gradient(rgba(3,18,35,.75),rgba(3,18,35,.78)),url('/images/venue.jpg')",
      }}
    >
      <form
        className="auth-form"
        onSubmit={submit}
        noValidate={mode === 'register' || mode === 'reset'}
      >
        <div className="brand" style={{ textAlign: 'center', marginBottom: 35 }}>
          DM EVENTS
        </div>
        <h1>{TITLES[mode]}</h1>
        <p className="subtitle">
          {mode === 'login'
            ? 'Access your event planning account'
            : mode === 'register'
              ? 'Join us to plan your next celebration'
              : mode === 'forgot'
                ? 'Receive a secure password reset link'
                : mode === 'reset'
                  ? 'Choose a new password'
                  : query.get('token') ? 'Confirm ownership of your email address' : 'Verify your email and phone to activate your account'}
        </p>

        {mode === 'register' && (
          <>
            <div className="field">
              <label htmlFor="fullname">Full name</label>
              <input
                id="fullname"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  markTouched('fullName');
                }}
                onBlur={() => markTouched('fullName')}
                placeholder="Juan D. Santos"
                maxLength={181}
                aria-invalid={!!fieldError('fullName')}
                aria-describedby={fieldError('fullName') ? 'fullname-error' : undefined}
                className={fieldError('fullName') ? styles.invalidInput : undefined}
              />
              {fieldError('fullName') && (
                <p id="fullname-error" className={styles.errorText} role="alert">
                  {fieldError('fullName')}
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="phone">Contact number</label>
              <div className={styles.phoneRow}>
                <select
                  aria-label="Country and calling code"
                  value={country}
                  onChange={(event) => {
                    setCountry(event.target.value as PhoneCountry);
                    markTouched('localPhone');
                  }}
                >
                  {PHONE_COUNTRIES.map((item) => (
                    <option key={item.iso} value={item.iso}>
                      {item.dialingCode} · {item.label}
                    </option>
                  ))}
                </select>
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    markTouched('localPhone');
                  }}
                  onBlur={() => markTouched('localPhone')}
                  placeholder={country === 'PH' ? '0917 123 4567' : 'Phone number'}
                  aria-invalid={!!fieldError('localPhone')}
                  aria-describedby={fieldError('localPhone') ? 'phone-error' : undefined}
                  className={fieldError('localPhone') ? styles.invalidInput : undefined}
                />
              </div>
              {fieldError('localPhone') && (
                <p id="phone-error" className={styles.errorText} role="alert">
                  {fieldError('localPhone')}
                </p>
              )}
            </div>
          </>
        )}

        {(['login', 'register', 'forgot'] as Mode[]).includes(mode) && (
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (mode === 'register') markTouched('email');
              }}
              onBlur={() => mode === 'register' && markTouched('email')}
              placeholder="name@example.com"
              aria-invalid={mode === 'register' && !!fieldError('email')}
              aria-describedby={mode === 'register' && fieldError('email') ? 'email-error' : undefined}
              className={mode === 'register' && fieldError('email') ? styles.invalidInput : undefined}
            />
            {mode === 'register' && fieldError('email') && (
              <p id="email-error" className={styles.errorText} role="alert">
                {fieldError('email')}
              </p>
            )}
          </div>
        )}

        {(['login', 'register', 'reset'] as Mode[]).includes(mode) && (
          <div className="field">
            <label htmlFor="password">Password</label>
            <div className={styles.passwordWrap}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                value={password}
                onFocus={() => setPasswordFocused(true)}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (mode !== 'login') markTouched('password');
                }}
                onBlur={() => {
                  setPasswordFocused(false);
                  if (mode !== 'login') markTouched('password');
                }}
                minLength={mode === 'login' ? 1 : 12}
                maxLength={mode === 'login' ? undefined : 128}
                placeholder="••••••••••••"
                aria-invalid={hasPasswordError}
                aria-describedby={
                  visiblePasswordError
                    ? 'password-error'
                    : mode !== 'login' && passwordFocused && password.length > 0
                      ? 'password-rules'
                      : undefined
                }
                className={hasPasswordError ? styles.invalidInput : undefined}
              />
              <button
                type="button"
                className={styles.passwordToggle}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                title={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {mode !== 'login' && passwordFocused && password.length > 0 && (
              <p id="password-rules" className={styles.helperText}>
                {PASSWORD_RULE}
              </p>
            )}
            {visiblePasswordError && (
              <p id="password-error" className={styles.errorText} role="alert">
                {visiblePasswordError}
              </p>
            )}
          </div>
        )}

        {mode === 'reset' && (
          <div className="field">
            <label htmlFor="confirm-password">Confirm new password</label>
            <input id="confirm-password" type="password" autoComplete="new-password" required
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength={12}
              maxLength={128} placeholder="Repeat your new password" />
            {confirmPassword && confirmPassword !== password && (
              <p className={styles.errorText} role="alert">Passwords do not match.</p>
            )}
          </div>
        )}

        {mode === 'verify' && !query.get('token') && (
          <div className="space-y-4 rounded-xl border border-white/20 bg-white/10 p-4">
            <div className="field"><label htmlFor="otp-email">Registration email</label>
              <input id="otp-email" type="email" required autoComplete="email" value={otpEmail}
                onChange={e => {
                  setOtpEmail(e.target.value);
                  setVerifiedChannels({ EMAIL: false, PHONE: false });
                }} placeholder="name@example.com" /></div>
            {(['EMAIL','PHONE'] as const).map(channel => (
              <div className="field" key={channel}>
                <label htmlFor={`${channel}-otp`}>{channel === 'EMAIL' ? 'Email' : 'SMS'} verification code {verifiedChannels[channel] ? '✓ Verified' : ''}</label>
                <input id={`${channel}-otp`} type="text" inputMode="numeric" autoComplete="one-time-code"
                  maxLength={6} pattern="[0-9]{6}" value={channel === 'EMAIL' ? emailCode : phoneCode}
                  onChange={e => { const code=e.target.value.replace(/\D/g,'').slice(0,6); if (channel==='EMAIL') setEmailCode(code); else setPhoneCode(code); }}
                  placeholder="6-digit code" disabled={busy || verifiedChannels[channel]}/><div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="rounded-lg bg-[#0b4d98] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={busy || verifiedChannels[channel] || !otpEmail.trim()} onClick={() => void verifyOtp(channel)}>Verify {channel === 'EMAIL' ? 'email' : 'phone'}</button>
                  <button type="button" className="rounded-lg border border-[#dce4ef] px-3 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
                    disabled={busy || verifiedChannels[channel] || !otpEmail.trim()} onClick={() => void resendOtp(channel)}>Resend code</button>
                </div>
              </div>
            ))}
            <p className="text-xs text-white/80">Both codes expire after 10 minutes. Check your email inbox and the SMS number entered at registration.</p>
          </div>
        )}

        {mode === 'register' && (
          <>
            <label className={styles.privacyRow}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => {
                  setConsent(event.target.checked);
                  markTouched('consent');
                }}
                aria-invalid={!!fieldError('consent')}
              />
              <span>
                I have read and agree to the <Link href="/privacy">Privacy Policy</Link>.
              </span>
            </label>
            {fieldError('consent') && (
              <p className={styles.errorText} role="alert">
                {fieldError('consent')}
              </p>
            )}
          </>
        )}

        {error && <div role="alert" className="error">{error}</div>}
        {message && <div role="status" className="success">{message}</div>}

        {(mode !== 'verify' || !!query.get('token')) && <button
          className="btn"
          disabled={busy ||
            (mode === 'reset' && !query.get('token'))}
        >
          {busy
            ? 'Please wait…'
            : ({
                login: 'LOG IN',
                register: 'CREATE ACCOUNT',
                forgot: 'SEND RESET LINK',
                reset: 'UPDATE PASSWORD',
                verify: 'VERIFY EMAIL',
              } as Record<Mode, string>)[mode]}
        </button>}

        <div className="auth-links">
          {mode === 'login' ? (
            <>
              <span>New client? <Link href={pendingBooking ? `/register?next=${encodeURIComponent(pendingBooking)}` : '/register'}>Create account</Link></span>
              <span>|</span>
              <Link href="/forgot-password">Forgot password?</Link>
            </>
          ) : (
            <>
              <Link href={pendingBooking ? `/login?next=${encodeURIComponent(pendingBooking)}` : '/login'}>Back to log in</Link>
              {mode === 'register' && <Link href="/privacy">Privacy Policy</Link>}
            </>
          )}
        </div>

        {mode === 'login' && (
          <p style={{ fontSize: 12, textAlign: 'center', marginTop: 35 }}>
            Your event information is available only after signing in.
          </p>
        )}
      </form>
    </section>
  );
}
