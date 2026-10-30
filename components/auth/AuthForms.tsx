'use client';

// Sign-in, invite acceptance and password reset forms. Tokens arrive in the URL fragment (#token=…), which the
// browser never sends to a server, and are posted once to the API.
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, errorText } from '@/lib/client/api';
import { BrandMark, useTheme } from '@/components/ThemeContext';

const card: React.CSSProperties = { width: 380, maxWidth: '92vw', background: 'var(--surf)', borderRadius: 'var(--rlg)', boxShadow: 'var(--sh-lg)', padding: 28 };
const label: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--i2)', marginBottom: 5 };
const input: React.CSSProperties = { width: '100%', border: '1px solid var(--bdk)', borderRadius: 8, padding: '9px 11px', fontSize: 13, fontFamily: 'var(--fb)', marginBottom: 14, background: 'var(--surf)', color: 'var(--i1)' };
const errorBox: React.CSSProperties = { background: 'var(--neg-lt)', color: 'var(--neg)', borderRadius: 8, padding: '9px 11px', fontSize: 12, lineHeight: 1.5, marginBottom: 14 };
const noteBox: React.CSSProperties = { background: 'var(--pos-lt)', color: 'var(--pos)', borderRadius: 8, padding: '9px 11px', fontSize: 12, lineHeight: 1.5, marginBottom: 14 };

export function AuthFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 16 }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <BrandMark on="light" height={theme ? 20 : 28} />
          {theme ? <span aria-hidden="true" style={{ width: 1, height: 20, background: 'var(--bdk)' }}></span> : null}
          <span style={{ fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 16, color: 'var(--i1)' }}>DemandAI</span>
        </div>
        <h1 style={{ fontFamily: 'var(--fd)', fontSize: 18, fontWeight: 700, color: 'var(--i1)', margin: '0 0 6px' }}>{title}</h1>
        {subtitle ? <p style={{ fontSize: 12.5, color: 'var(--i3)', lineHeight: 1.6, margin: '0 0 18px' }}>{subtitle}</p> : null}
        {children}
      </div>
    </main>
  );
}

function Problems({ id, error, problems }: { id: string; error: string | null; problems?: string[] }) {
  if (!error) return null;
  return (
    <div id={id} role="alert" style={errorBox}>
      {error}
      {problems?.length ? <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>{problems.map(p => <li key={p}>{p}</li>)}</ul> : null}
    </div>
  );
}

/** Only same-site paths, so the sign-in form can't be used as an open redirect. */
function safeNext(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}

export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/login', { body: { email, password } });
      window.location.assign(safeNext(next));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };
  return (
    <AuthFrame title="Sign in" subtitle="Use the email address your administrator invited.">
      <form onSubmit={submit} noValidate aria-describedby={error ? 'loginError' : undefined}>
        <Problems id="loginError" error={error} />
        <label htmlFor="email" style={label}>Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} style={input} />
        <label htmlFor="password" style={label}>Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} style={input} />
        <button type="submit" className="btn btn-primary" disabled={busy || !email || !password} style={{ width: '100%', justifyContent: 'center', height: 36 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p style={{ fontSize: 12, marginTop: 16, textAlign: 'center' }}><Link href="/forgot-password" style={{ color: 'var(--brand)' }}>Forgot your password?</Link></p>
    </AuthFrame>
  );
}

// The token is read once and kept, so dropping it from the address bar afterwards doesn't lose it.
let fragmentToken: string | null | undefined;
const readFragmentToken = () => (fragmentToken ??= new URLSearchParams(window.location.hash.slice(1)).get('token'));
const noSubscription = () => () => {};

/** undefined while rendering on the server, then the token (or null if the link has none). */
function useFragmentToken(): string | null | undefined {
  const token = useSyncExternalStore(noSubscription, readFragmentToken, () => undefined);
  useEffect(() => {
    // Drop the token from the address bar and history once read.
    if (token) window.history.replaceState(null, '', window.location.pathname);
  }, [token]);
  return token;
}

function NewPasswordForm({ kind }: { kind: 'invite' | 'reset' }) {
  const token = useFragmentToken();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[] | undefined>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const title = kind === 'invite' ? 'Set your password' : 'Choose a new password';
  const subtitle = 'At least 12 characters. A short sentence is easy to remember and hard to guess.';

  if (token === undefined) return <AuthFrame title={title}><p style={{ fontSize: 12.5, color: 'var(--i3)' }}>Checking your link…</p></AuthFrame>;
  if (!token) {
    return (
      <AuthFrame title={title}>
        <div role="alert" style={errorBox}>This link is incomplete. Open it again from your email, or ask your administrator for a new one.</div>
        <p style={{ fontSize: 12 }}><Link href="/login" style={{ color: 'var(--brand)' }}>Back to sign in</Link></p>
      </AuthFrame>
    );
  }
  if (done) {
    return (
      <AuthFrame title="Password changed">
        <div role="status" style={noteBox}>Your password was changed and every session was signed out. Sign in with the new password.</div>
        <Link href="/login" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', height: 36 }}>Sign in</Link>
      </AuthFrame>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("The two passwords don't match."); setProblems(undefined); return; }
    setBusy(true);
    setError(null);
    try {
      await api(kind === 'invite' ? '/api/auth/accept-invite' : '/api/auth/reset', { body: { token, password } });
      // A full reload: the new session cookie is read by the server's page guard from the first request.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (kind === 'invite') window.location.assign('/');
      else { setDone(true); setBusy(false); }
    } catch (err) {
      setError(errorText(err));
      setProblems(err instanceof ApiError ? err.fields?.password : undefined);
      setBusy(false);
    }
  };
  return (
    <AuthFrame title={title} subtitle={subtitle}>
      <form onSubmit={submit} noValidate aria-describedby={error ? 'pwError' : undefined}>
        <Problems id="pwError" error={error} problems={problems} />
        <label htmlFor="password" style={label}>New password</label>
        <input id="password" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={e => setPassword(e.target.value)} style={input} />
        <label htmlFor="confirm" style={label}>Type it again</label>
        <input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} style={input} />
        <button type="submit" className="btn btn-primary" disabled={busy || !password || !confirm} style={{ width: '100%', justifyContent: 'center', height: 36 }}>
          {busy ? 'Saving…' : kind === 'invite' ? 'Set password and sign in' : 'Change password'}
        </button>
      </form>
    </AuthFrame>
  );
}

export function AcceptInviteForm() {
  return <NewPasswordForm kind="invite" />;
}

export function ResetPasswordForm() {
  return <NewPasswordForm kind="reset" />;
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<null | { emailEnabled: boolean }>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSent(await api<{ emailEnabled: boolean }>('/api/auth/forgot', { body: { email } }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame title="Reset your password" subtitle="Enter your email address and we'll send you a link.">
      {sent ? (
        <div role="status" style={noteBox}>
          {sent.emailEnabled
            ? 'If an account exists for that address, a reset link is on its way. It works once and expires in 30 minutes.'
            : "Email isn't set up for DemandAI yet, so no link can be sent. Ask your administrator for a reset link."}
        </div>
      ) : (
        <form onSubmit={submit} noValidate aria-describedby={error ? 'forgotError' : undefined}>
          <Problems id="forgotError" error={error} />
          <label htmlFor="email" style={label}>Email</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} style={input} />
          <button type="submit" className="btn btn-primary" disabled={busy || !email} style={{ width: '100%', justifyContent: 'center', height: 36 }}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
      <p style={{ fontSize: 12, marginTop: 16, textAlign: 'center' }}><Link href="/login" style={{ color: 'var(--brand)' }}>Back to sign in</Link></p>
    </AuthFrame>
  );
}
