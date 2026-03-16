import { useEffect, useMemo, useState } from 'react';

const emptyRegister = { email: '', username: '', password: '' };
const emptyLogin = { login: '', password: '' };
const emptyForgot = { email: '' };
const emptyReset = { email: '', token: '', password: '' };
const initialHotelStatus = { loading: true, socket_online: false, reason: '', checked_url: '' };

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export default function App() {
  const [debugMode, setDebugMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('debug') === '1';
  });
  const [me, setMe] = useState(null);
  const [registerForm, setRegisterForm] = useState(emptyRegister);
  const [loginForm, setLoginForm] = useState(emptyLogin);
  const [forgotForm, setForgotForm] = useState(emptyForgot);
  const [resetForm, setResetForm] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      ...emptyReset,
      email: params.get('email') || '',
      token: params.get('token') || ''
    };
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [hotelStatus, setHotelStatus] = useState(initialHotelStatus);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [showResetForm, setShowResetForm] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('reset') === '1';
  });

  useEffect(() => {
    api('/api/auth/me')
      .then((data) => setMe(data.user || null))
      .catch(() => setMe(null));
  }, []);

  const isLoggedIn = useMemo(() => !!me, [me]);

  useEffect(() => {
    let mounted = true;
    let intervalId;

    async function loadHotelStatus() {
      try {
        const data = await api('/api/hotel/status');
        if (!mounted) return;
        setHotelStatus({
          loading: false,
          socket_online: !!data.socket_online,
          reason: String(data.reason || ''),
          checked_url: String(data.checked_url || '')
        });
      } catch (err) {
        if (!mounted) return;
        setHotelStatus({
          loading: false,
          socket_online: false,
          reason: err.message,
          checked_url: ''
        });
      }
    }

    if (isLoggedIn) {
      setHotelStatus(initialHotelStatus);
      loadHotelStatus();
      intervalId = window.setInterval(loadHotelStatus, 5000);
    } else {
      setHotelStatus(initialHotelStatus);
    }

    return () => {
      mounted = false;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [isLoggedIn]);

  async function handleRegister(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(registerForm)
      });
      setMe(data.user);
      setMessage('Registered and logged in.');
      setJoinUrl('');
      setRegisterForm(emptyRegister);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginForm)
      });
      setMe(data.user);
      setMessage('Logged in.');
      setJoinUrl('');
      setLoginForm(emptyLogin);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/api/auth/logout', { method: 'POST' });
      setMe(null);
      setJoinUrl('');
      setMessage('Logged out.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinHotel() {
    if (!hotelStatus.socket_online) {
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await api('/api/hotel/join', { method: 'POST' });
      setJoinUrl(data.login_url);
      setMessage('Generated a fresh SSO ticket.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await api('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(forgotForm)
      });
      setMessage(`${data.message} Check Mailpit at http://127.0.0.1:8025`);
      setForgotForm(emptyForgot);
      setShowForgotModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await api('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(resetForm)
      });
      setMessage(data.message || 'Password reset successful.');
      setShowResetForm(false);
      setResetForm(emptyReset);
      const url = new URL(window.location.href);
      url.searchParams.delete('reset');
      url.searchParams.delete('token');
      url.searchParams.delete('email');
      window.history.replaceState({}, '', url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <section className="card">
        <div className="debug-toggle">
          <label>
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(event) => setDebugMode(event.target.checked)}
            />
            Debug mode
          </label>
        </div>

        <h1>Agent Hotel Portal</h1>
        <p className="muted">Register, log in, and jump into your Habbo hotel with a fresh SSO ticket.</p>

        {debugMode && error && <div className="alert error">{error}</div>}
        {message && <div className="alert ok">{message}</div>}

        {!isLoggedIn ? (
          <div className="grid">
            <form onSubmit={handleRegister}>
              <h2>Register</h2>
              <input
                placeholder="Email"
                type="email"
                required
                value={registerForm.email}
                onChange={(e) => setRegisterForm((s) => ({ ...s, email: e.target.value }))}
              />
              <input
                placeholder="Username"
                required
                value={registerForm.username}
                onChange={(e) => setRegisterForm((s) => ({ ...s, username: e.target.value }))}
              />
              <input
                placeholder="Password"
                type="password"
                minLength={8}
                required
                value={registerForm.password}
                onChange={(e) => setRegisterForm((s) => ({ ...s, password: e.target.value }))}
              />
              <button disabled={busy} type="submit">
                {busy ? 'Please wait...' : 'Create account'}
              </button>
            </form>

            <form onSubmit={handleLogin}>
              <h2>Login</h2>
              <input
                placeholder="Email or username"
                required
                value={loginForm.login}
                onChange={(e) => setLoginForm((s) => ({ ...s, login: e.target.value }))}
              />
              <input
                placeholder="Password"
                type="password"
                required
                value={loginForm.password}
                onChange={(e) => setLoginForm((s) => ({ ...s, password: e.target.value }))}
              />
              <button disabled={busy} type="submit">
                {busy ? 'Please wait...' : 'Login'}
              </button>
              <div className="login-help-row">
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() => setShowForgotModal(true)}
                  type="button"
                >
                  Forgot password?
                </button>
              </div>
            </form>

            {showResetForm && (
              <form onSubmit={handleResetPassword}>
                <h2>Reset password</h2>
                <input
                  placeholder="Email"
                  type="email"
                  required
                  value={resetForm.email}
                  onChange={(e) => setResetForm((s) => ({ ...s, email: e.target.value }))}
                />
                <input
                  placeholder="Reset token"
                  required
                  value={resetForm.token}
                  onChange={(e) => setResetForm((s) => ({ ...s, token: e.target.value }))}
                />
                <input
                  placeholder="New password"
                  type="password"
                  minLength={8}
                  required
                  value={resetForm.password}
                  onChange={(e) => setResetForm((s) => ({ ...s, password: e.target.value }))}
                />
                <button disabled={busy} type="submit">
                  {busy ? 'Please wait...' : 'Reset password'}
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="dashboard">
            <h2>Welcome, {me.username}</h2>
            <p className="muted">Linked Habbo user: {me.habbo_username}</p>
            <p className="muted">
              Hotel socket:{' '}
              {hotelStatus.loading
                ? 'checking...'
                : hotelStatus.socket_online
                  ? 'online'
                  : 'offline'}
            </p>
            {debugMode && hotelStatus.reason && (
              <p className="muted">Debug: {hotelStatus.reason}</p>
            )}
            {debugMode && hotelStatus.checked_url && (
              <p className="muted">Debug URL: {hotelStatus.checked_url}</p>
            )}

            <div className="row">
              <span
                className="tooltip-wrap"
                title={hotelStatus.socket_online ? '' : 'Hotel is offline'}
              >
                <button
                  disabled={busy || !hotelStatus.socket_online}
                  onClick={handleJoinHotel}
                >
                  {busy ? 'Generating...' : 'Join Hotel'}
                </button>
              </span>
              <button className="ghost" disabled={busy} onClick={handleLogout}>
                Logout
              </button>
            </div>

            {!hotelStatus.loading && !hotelStatus.socket_online && (
              <p className="muted">Join Hotel is disabled until the hotel socket is online.</p>
            )}

            {joinUrl && (
              <div className="join-box">
                <p className="muted">Fresh login URL:</p>
                <a href={joinUrl} rel="noreferrer" target="_blank">
                  {joinUrl}
                </a>
              </div>
            )}
          </div>
        )}
      </section>

      {showForgotModal && (
        <div className="modal-overlay" onClick={() => setShowForgotModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Forgot password</h2>
            <p className="muted small">Enter your account email to receive a reset link (Mailpit).</p>
            <form onSubmit={handleForgotPassword}>
              <input
                placeholder="Email"
                type="email"
                required
                value={forgotForm.email}
                onChange={(e) => setForgotForm((s) => ({ ...s, email: e.target.value }))}
              />
              <div className="modal-actions">
                <button className="ghost" disabled={busy} onClick={() => setShowForgotModal(false)} type="button">
                  Cancel
                </button>
                <button disabled={busy} type="submit">
                  {busy ? 'Please wait...' : 'Send reset link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
