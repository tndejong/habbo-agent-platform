import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEscapeKey } from '../utils/useEscapeKey'
import { api } from '../utils/api'
import { AlertCircle, CheckCircle, Eye, EyeOff, Loader2, QrCode } from 'lucide-react'
import { QrLoginModal } from '../components/QrLoginModal'

function AuthInput({ type, placeholder, value, onChange, required, minLength, showToggle, onToggle, showingPassword }) {
  return (
    <div className="relative">
      <input
        type={type}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex h-10 w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
      />
      {showToggle && (
        <button type="button" onClick={onToggle}
          aria-label={showingPassword ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
          {showingPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      )}
    </div>
  )
}

function AuthButton({ busy, label, busyLabel }) {
  return (
    <button type="submit" disabled={busy}
      className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
      {busy ? busyLabel : label}
    </button>
  )
}

export function AuthPage({ onLogin, UiBuildFooter }) {
  const navigate = useNavigate()
  const params = new URLSearchParams(window.location.search)
  const hasResetParams = params.get('reset') === '1'

  const [authTab, setAuthTab] = useState('login')
  const [showReset, setShowReset] = useState(hasResetParams)
  const [showForgot, setShowForgot] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [busy, setBusy] = useState(false)
  useEscapeKey(() => { setShowForgot(false); setShowReset(false); setShowQr(false) }, !!(showForgot || showReset || showQr))
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [registerForm, setRegisterForm] = useState({ email: '', username: '', password: '', hotel_enabled: true })
  const [loginForm, setLoginForm] = useState({ login: '', password: '' })
  const [forgotForm, setForgotForm] = useState({ email: '' })
  const [resetForm, setResetForm] = useState({
    email: params.get('email') || '',
    token: params.get('token') || '',
    password: '',
  })

  function submitOnEnter(e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault()
      e.currentTarget.requestSubmit()
    }
  }

  async function handleRegister(e) {
    e.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      await api('/api/auth/register', { method: 'POST', body: JSON.stringify(registerForm) })
      // Fetch complete user data after registration
      const meData = await api('/api/auth/me')
      onLogin(meData.user)
      // Let React Router handle the redirection based on needsOnboarding
      // The <Navigate> in App.jsx will redirect to /onboarding or /app/home
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function handleLogin(e) {
    e.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify(loginForm) })
      // Fetch complete user data after login
      const meData = await api('/api/auth/me')
      onLogin(meData.user)
      // Let React Router handle the redirection based on needsOnboarding
      // The <Navigate> in App.jsx will redirect to /onboarding or /app/home
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function handleForgot(e) {
    e.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(forgotForm) })
      setMessage('A password reset link has been sent to your inbox.')
      setForgotForm({ email: '' })
      setShowForgot(false)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function handleReset(e) {
    e.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      const data = await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(resetForm) })
      setMessage(data.message || 'Password reset successful.')
      setShowReset(false)
      setResetForm({ email: '', token: '', password: '' })
      const url = new URL(window.location.href)
      url.searchParams.delete('reset')
      url.searchParams.delete('token')
      url.searchParams.delete('email')
      window.history.replaceState({}, '', url)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      <div className="flex-1 flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-secondary/20 pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="absolute top-6 left-6">
        <span className="text-base font-semibold tracking-tight text-foreground">AgentHotel</span>
      </div>

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">AgentHotel</h1>
          <p className="text-sm text-muted-foreground mt-2">Sign in to your account</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-2xl">
          {error && (
            <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {message && (
            <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-success/10 border border-success/20 text-success text-sm">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}

          {showReset ? (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-foreground">Reset Password</h2>
              <form onSubmit={handleReset} onKeyDown={submitOnEnter} className="space-y-3">
                <input type="hidden" name="email" value={resetForm.email} />
                <input type="hidden" name="token" value={resetForm.token} />
                <input
                  type="email" placeholder="Email address" required disabled
                  value={resetForm.email} readOnly
                  className="flex h-10 w-full rounded-lg border border-input bg-background/30 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
                />
                <AuthInput
                  type="password" placeholder="New password (min 8 chars)" required minLength={8}
                  value={resetForm.password}
                  onChange={v => setResetForm(s => ({ ...s, password: v }))}
                  showToggle
                />
                <AuthButton busy={busy} label="Reset Password" busyLabel="Resetting..." />
                <button type="button" onClick={() => setShowReset(false)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center mt-1">
                  Back to login
                </button>
              </form>
            </div>
          ) : (
            <>
              <div className="flex rounded-lg border border-border p-1 mb-5 gap-1">
                {['login', 'register'].map(t => (
                  <button key={t} onClick={() => { setAuthTab(t); setError('') }}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${
                      authTab === t
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>

              {authTab === 'login' && (
                <form onSubmit={handleLogin} onKeyDown={submitOnEnter} className="space-y-3">
                  <AuthInput
                    type="text" placeholder="Email or username" required
                    value={loginForm.login}
                    onChange={v => setLoginForm(s => ({ ...s, login: v }))}
                  />
                  <AuthInput
                    type={showPassword ? 'text' : 'password'} placeholder="Password" required
                    value={loginForm.password}
                    onChange={v => setLoginForm(s => ({ ...s, password: v }))}
                    showToggle onToggle={() => setShowPassword(p => !p)} showingPassword={showPassword}
                  />
                  <AuthButton busy={busy} label="Sign In" busyLabel="Signing in..." />
                  <button type="button" onClick={() => { setShowQr(true); setError('') }}
                    className="w-full h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors flex items-center justify-center gap-2">
                    <QrCode className="w-4 h-4" />
                    Log in with QR code
                  </button>
                  <div className="text-center pt-1">
                    <button type="button" onClick={() => { setShowForgot(true); setError('') }}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2">
                      Forgot password?
                    </button>
                  </div>
                </form>
              )}

              {authTab === 'register' && (
                <form onSubmit={handleRegister} onKeyDown={submitOnEnter} className="space-y-3">
                  <AuthInput
                    type="email" placeholder="Email address" required
                    value={registerForm.email}
                    onChange={v => setRegisterForm(s => ({ ...s, email: v }))}
                  />
                  <AuthInput
                    type="text" placeholder="Username" required
                    value={registerForm.username}
                    onChange={v => setRegisterForm(s => ({ ...s, username: v }))}
                  />
                  <AuthInput
                    type={showPassword ? 'text' : 'password'} placeholder="Password (min 8 chars)" required minLength={8}
                    value={registerForm.password}
                    onChange={v => setRegisterForm(s => ({ ...s, password: v }))}
                    showToggle onToggle={() => setShowPassword(p => !p)} showingPassword={showPassword}
                  />

                  <div className="space-y-1.5 pt-1">
                    <p className="text-xs text-muted-foreground font-medium">Workspace type</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: false, label: 'Team workspace', desc: 'Manage AI teams, track results and workflows.' },
                        { value: true, label: '+ Virtual office', desc: 'Your agents get hotel avatars and live in virtual rooms.' },
                      ].map(({ value, label, desc }) => (
                        <button
                          key={String(value)}
                          type="button"
                          onClick={() => setRegisterForm(s => ({ ...s, hotel_enabled: value }))}
                          className={`text-left p-3 rounded-xl border text-xs transition-all ${
                            registerForm.hotel_enabled === value
                              ? 'border-primary bg-primary/5 text-foreground'
                              : 'border-border text-muted-foreground hover:border-border/80 hover:bg-secondary/40'
                          }`}
                        >
                          <p className="font-semibold mb-1">{label}</p>
                          <p className="leading-snug">{desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <AuthButton busy={busy} label="Create Account" busyLabel="Creating account..." />
                </form>
              )}
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          ThePixelOffice — AI Team Platform
        </p>
      </div>

      {showForgot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => { setShowForgot(false); setError('') }}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold mb-1">Forgot Password</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Enter your account email to receive a password reset link.
            </p>
            {error && (
              <div className="flex items-start gap-2 p-3 mb-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <form onSubmit={handleForgot} onKeyDown={submitOnEnter} className="space-y-3">
              <AuthInput
                type="email" placeholder="Email address" required
                value={forgotForm.email}
                onChange={v => setForgotForm({ email: v })}
              />
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setShowForgot(false); setError('') }}
                  className="flex-1 h-9 rounded-md border border-border text-sm hover:bg-secondary transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={busy}
                  className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Send Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showQr && (
        <QrLoginModal onClose={() => setShowQr(false)} onLogin={onLogin} />
      )}
      </div>
      {UiBuildFooter && <UiBuildFooter />}
    </div>
  )
}
