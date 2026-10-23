'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { api, json } from '@/api-client/http';
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

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'verify';
type RegistrationField = 'fullName' | 'email' | 'localPhone' | 'password' | 'consent';
type RegistrationErrors = Partial<Record<RegistrationField, string>>;

const DRAFT_KEY = 'dm-events-registration-draft-v1';
const TITLES: Record<Mode, string> = {
  login: 'WELCOME BACK',
  register: 'CREATE AN ACCOUNT',
  forgot: 'FORGOT PASSWORD',
  reset: 'RESET PASSWORD',
  verify: 'VERIFY YOUR EMAIL',
};

export default function AuthForms({ mode }: { mode: Mode }) {
  const router = useRouter();
  const query = useSearchParams();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState<PhoneCountry>('PH');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<RegistrationField, boolean>>>({});
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

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
        router.replace(
          result.user.role === 'ADMIN'
            ? '/admin'
            : result.user.role === 'COORDINATOR'
              ? '/coordinator'
              : '/client'
        );
        router.refresh();
      } else if (mode === 'register') {
        const result = await api<{ verificationRequired: boolean }>(
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
          setMessage('Please check your email for your verification link.');
        } else {
          router.replace('/client');
          router.refresh();
        }
      } else if (mode === 'forgot') {
        await api('/api/auth/forgot', json('POST', { email }));
        setMessage('If the account exists, password recovery instructions have been sent.');
      } else if (mode === 'reset') {
        await api('/api/auth/reset', json('POST', { token: query.get('token'), password }));
        setPassword('');
        setShowPassword(false);
        setMessage('Password changed. You can now log in.');
      } else if (mode === 'verify') {
        await api('/api/auth/verify', json('POST', { token: query.get('token') }));
        setMessage('Email verified. Log in to continue.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
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
                  : 'Confirm ownership of your email address'}
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

        <button
          className="btn"
          disabled={busy || (mode === 'verify' && !query.get('token')) ||
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
        </button>

        <div className="auth-links">
          {mode === 'login' ? (
            <>
              <span>New client? <Link href="/register">Create account</Link></span>
              <span>|</span>
              <Link href="/forgot-password">Forgot password?</Link>
            </>
          ) : (
            <>
              <Link href="/login">Back to log in</Link>
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
