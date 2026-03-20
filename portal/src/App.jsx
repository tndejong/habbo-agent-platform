import { useState, useEffect, useCallback } from 'react'
import { HabboFigure } from './components/HabboFigure'
import { AgentDashboard } from './components/AgentDashboard'
import {
  Home, Bot, Key, Users, LogOut, Hotel,
  Eye, EyeOff, Loader2, AlertCircle, CheckCircle,
  Wifi, WifiOff, Copy, Check, Trash2, RefreshCw,
  Edit
} from 'lucide-react'

// ── API helper ────────────────────────────────────────────────────────────

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`)
  return data
}

// ── Fallback figure types (if API is unavailable) ─────────────────────────

const FALLBACK_FIGURE_TYPES = {
  'default-m':  { gender: 'M', figure: 'hd-180-1.ch-210-66.lg-270-110.sh-300-91' },
  'citizen-m':  { gender: 'M', figure: 'hd-180-1.ch-210-66.lg-270-110.sh-300-91.ha-1012-110.hr-828-61' },
  'agent-m':    { gender: 'M', figure: 'hd-3095-12.ch-255-64.lg-3235-96.sh-295-91.ha-3426-110.hr-3531-61.he-1601-0.ea-3169-0.fa-1211-1408.cp-3310-0.cc-3007-0.ca-1809-0.wa-2007-0' },
  'default-f':  { gender: 'F', figure: 'hd-620-1.ch-680-66.lg-715-110.sh-905-91' },
  'citizen-f':  { gender: 'F', figure: 'hd-620-1.ch-680-66.lg-715-110.sh-905-91.ha-1012-110.hr-828-61' },
  'agent-f':    { gender: 'F', figure: 'hd-620-12.ch-3005-64.lg-3006-96.sh-905-91.ha-3426-110.hr-3531-61.he-1601-0.ea-3169-0' },
}

// ── Root App ──────────────────────────────────────────────────────────────

export default function App() {
  const path = window.location.pathname
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/api/auth/me')
      .then(d => { setMe(d.user || null); setLoading(false) })
      .catch(() => { setMe(null); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!loading) {
      if ((path === '/login' || path === '/') && me) window.location.replace('/app')
      if (path === '/app' && !me) window.location.replace('/login')
    }
  }, [loading, me, path])

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  )

  if (path === '/login' || path === '/') return <AuthPage onLogin={setMe} />
  if (path === '/app' && me) return <Dashboard me={me} setMe={setMe} />
  return null
}

// ── Auth Page ─────────────────────────────────────────────────────────────

function AuthPage({ onLogin }) {
  const params = new URLSearchParams(window.location.search)
  const hasResetParams = params.get('reset') === '1'

  const [authTab, setAuthTab] = useState('login')
  const [showReset, setShowReset] = useState(hasResetParams)
  const [showForgot, setShowForgot] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [registerForm, setRegisterForm] = useState({ email: '', username: '', password: '' })
  const [loginForm, setLoginForm] = useState({ login: '', password: '' })
  const [forgotForm, setForgotForm] = useState({ email: '' })
  const [resetForm, setResetForm] = useState({
    email: params.get('email') || '',
    token: params.get('token') || '',
    password: '',
  })

  async function handleRegister(e) {
    e.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(registerForm) })
      onLogin(data.user)
      window.location.replace('/app')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function handleLogin(e) {
    e.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(loginForm) })
      onLogin(data.user)
      window.location.replace('/app')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function handleForgot(e) {
    e.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      const data = await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(forgotForm) })
      setMessage(`${data.message} Check Mailpit at http://127.0.0.1:8025`)
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-secondary/20 pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      {/* Logo */}
      <div className="absolute top-6 left-6">
        <img src="/logo.png" alt="Agent Hotel" className="w-20 h-auto" style={{ imageRendering: 'auto' }} />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Hotel className="w-7 h-7 text-primary" />
          </div>
          <h1 className="font-pixel text-lg text-foreground">Agent Hotel</h1>
          <p className="text-sm text-muted-foreground mt-1">Portal Access</p>
        </div>

        {/* Auth card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-2xl">
          {/* Messages */}
          {error && (
            <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {message && (
            <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}

          {/* Reset password form (URL-triggered) */}
          {showReset ? (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-foreground">Reset Password</h2>
              <form onSubmit={handleReset} className="space-y-3">
                <AuthInput
                  type="email" placeholder="Email address" required
                  value={resetForm.email}
                  onChange={v => setResetForm(s => ({ ...s, email: v }))}
                />
                <AuthInput
                  type="text" placeholder="Reset token" required
                  value={resetForm.token}
                  onChange={v => setResetForm(s => ({ ...s, token: v }))}
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
              {/* Tab switcher */}
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

              {/* Login form */}
              {authTab === 'login' && (
                <form onSubmit={handleLogin} className="space-y-3">
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
                  <div className="text-center pt-1">
                    <button type="button" onClick={() => { setShowForgot(true); setError('') }}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2">
                      Forgot password?
                    </button>
                  </div>
                </form>
              )}

              {/* Register form */}
              {authTab === 'register' && (
                <form onSubmit={handleRegister} className="space-y-3">
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
                  <AuthButton busy={busy} label="Create Account" busyLabel="Creating account..." />
                </form>
              )}
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Habbo Hotel Agent Platform
        </p>
      </div>

      {/* Forgot password modal */}
      {showForgot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-base font-semibold mb-1">Forgot Password</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Enter your account email to receive a reset link via Mailpit.
            </p>
            {error && (
              <div className="flex items-start gap-2 p-3 mb-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <form onSubmit={handleForgot} className="space-y-3">
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
                  className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Send Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Auth sub-components ───────────────────────────────────────────────────

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

// ── Dashboard ─────────────────────────────────────────────────────────────

function Dashboard({ me, setMe }) {
  const [activeTab, setActiveTab] = useState('home')
  const [busy, setBusy] = useState(false)
  const [hotelStatus, setHotelStatus] = useState({ loading: true, socket_online: false, reason: '', checked_url: '' })
  const [figureTypes, setFigureTypes] = useState(FALLBACK_FIGURE_TYPES)

  // Load figure types on mount
  useEffect(() => {
    api('/api/figure-types')
      .then(d => { if (d.figureTypes) setFigureTypes(d.figureTypes) })
      .catch(() => {})
  }, [])

  // Hotel status polling
  useEffect(() => {
    let mounted = true
    async function loadStatus() {
      try {
        const data = await api('/api/hotel/status')
        if (!mounted) return
        setHotelStatus({ loading: false, socket_online: !!data.socket_online, reason: data.reason || '', checked_url: data.checked_url || '' })
      } catch (err) {
        if (!mounted) return
        setHotelStatus({ loading: false, socket_online: false, reason: err.message, checked_url: '' })
      }
    }
    loadStatus()
    const id = setInterval(loadStatus, 5000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  async function handleLogout() {
    setBusy(true)
    try {
      await api('/api/auth/logout', { method: 'POST' })
      setMe(null)
      window.location.replace('/login')
    } catch { setBusy(false) }
  }

  async function handleJoinHotel() {
    if (!hotelStatus.socket_online) return
    setBusy(true)
    try {
      const data = await api('/api/hotel/join', { method: 'POST' })
      window.open(data.login_url, '_blank')
    } catch {}
    finally { setBusy(false) }
  }

  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'agents', label: 'Agents', icon: Bot },
    { id: 'bots', label: 'Bots', icon: Users },
    { id: 'mcp', label: 'MCP', icon: Key },
  ]

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top nav */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
          {/* Logo */}
          <img src="/logo.png" alt="Agent Hotel" className="h-8 w-auto flex-shrink-0" style={{ imageRendering: 'auto' }} />

          {/* Tabs — desktop */}
          <nav className="hidden md:flex items-center gap-1 ml-2">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                  activeTab === id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-3">
            {/* Hotel status */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              {hotelStatus.loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : hotelStatus.socket_online ? (
                <Wifi className="w-3 h-3 text-green-400" />
              ) : (
                <WifiOff className="w-3 h-3 text-muted-foreground" />
              )}
              <span>{hotelStatus.loading ? 'Checking...' : hotelStatus.socket_online ? 'Online' : 'Offline'}</span>
            </div>

            {/* Join hotel button */}
            <button
              onClick={handleJoinHotel}
              disabled={busy || !hotelStatus.socket_online}
              className="hidden sm:flex items-center gap-1.5 h-8 px-3 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Hotel className="w-3 h-3" />
              Join Hotel
            </button>

            {/* User avatar + logout */}
            {me.figure && <HabboFigure figure={me.figure} size="sm" animate={false} className="hidden sm:block" />}
            <span className="text-sm text-muted-foreground hidden sm:block">{me.username}</span>
            <button onClick={handleLogout} disabled={busy}
              className="flex items-center gap-1.5 h-8 px-3 text-xs border border-border rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
              <LogOut className="w-3 h-3" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="md:hidden flex border-t border-border">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
                activeTab === id ? 'text-primary' : 'text-muted-foreground'
              }`}>
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        {activeTab === 'home' && (
          <HomeTab me={me} hotelStatus={hotelStatus} onJoinHotel={handleJoinHotel} busy={busy} />
        )}
        {activeTab === 'agents' && (
          <AgentDashboard me={me} />
        )}
        {activeTab === 'bots' && (
          <BotsTab figureTypes={figureTypes} />
        )}
        {activeTab === 'mcp' && (
          <McpTab me={me} />
        )}
      </main>
    </div>
  )
}

// ── Home Tab ──────────────────────────────────────────────────────────────

function HomeTab({ me, hotelStatus, onJoinHotel, busy }) {
  const activeTier = me?.ai_tier || 'basic'

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Welcome card */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center gap-5">
          {me.figure && (
            <div className="flex-shrink-0">
              <HabboFigure figure={me.figure} size="md" animate={true} />
            </div>
          )}
          <div>
            <h2 className="text-xl font-semibold text-foreground">Welcome, {me.username}!</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your hotel access, bots, and MCP connections from this portal.
            </p>
            {me.habbo_username && (
              <p className="text-xs text-muted-foreground mt-2">
                Linked Habbo: <span className="font-retro text-primary">{me.habbo_username}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Status grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatusCard
          label="Linked Habbo"
          value={me.habbo_username || '—'}
          icon={Users}
        />
        <StatusCard
          label="AI Tier"
          value={activeTier.toUpperCase()}
          icon={Key}
          valueClassName="text-primary"
        />
        <StatusCard
          label="Hotel Socket"
          value={hotelStatus.loading ? 'Checking...' : hotelStatus.socket_online ? 'Online' : 'Offline'}
          icon={hotelStatus.socket_online ? Wifi : WifiOff}
          valueClassName={hotelStatus.socket_online ? 'text-green-400' : 'text-muted-foreground'}
        />
      </div>

      {/* Quick actions */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onJoinHotel}
            disabled={busy || !hotelStatus.socket_online}
            className="flex items-center gap-2 h-9 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Hotel className="w-4 h-4" />
            Join Hotel
          </button>
          {!hotelStatus.socket_online && !hotelStatus.loading && (
            <p className="text-xs text-muted-foreground self-center">
              Hotel is currently offline
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusCard({ label, value, icon: Icon, valueClassName = '' }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`text-base font-semibold text-foreground ${valueClassName}`}>{value}</p>
    </div>
  )
}

// ── Bots Tab ──────────────────────────────────────────────────────────────

function BotsTab({ figureTypes }) {
  const [bots, setBots] = useState([])
  const [loading, setLoading] = useState(false)
  const [editingBotId, setEditingBotId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [botBusy, setBotBusy] = useState({})
  const [botMsg, setBotMsg] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(null)

  const fetchBots = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api('/api/hotel/bots')
      setBots(d.bots || [])
    } catch { setBots([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchBots() }, [fetchBots])

  function startEditBot(bot) {
    setEditingBotId(bot.id)
    const figureType = Object.entries(figureTypes).find(([, v]) => v.figure === bot.figure)?.[0]
      || (bot.gender === 'F' ? 'default-f' : 'default-m')
    setEditForm({ name: bot.name, persona: bot.persona, motto: bot.motto || '', figureType, figure: bot.figure, gender: bot.gender })
  }

  function cancelEditBot() {
    setEditingBotId(null)
    setEditForm({})
  }

  function setBotMessage(botId, text, type = 'ok', ttl = 5000) {
    setBotMsg(prev => ({ ...prev, [botId]: { text, type } }))
    if (ttl) setTimeout(() => setBotMsg(prev => ({ ...prev, [botId]: null })), ttl)
  }

  async function saveBot(botId) {
    setBotBusy(prev => ({ ...prev, [botId]: true }))
    try {
      const d = await api(`/api/hotel/bots/${botId}`, { method: 'PUT', body: JSON.stringify(editForm) })
      setBots(prev => prev.map(b => b.id === botId ? { ...b, ...editForm } : b))
      setEditingBotId(null)
      const parts = ['Saved!']
      if (d.visualChanged) parts.push('Changes applied live in hotel.')
      if (d.personaUpdated) parts.push('Persona updated.')
      setBotMessage(botId, parts.join(' '), 'ok', 5000)
    } catch (err) {
      setBotMessage(botId, err.message || 'Save failed.', 'err')
    }
    setBotBusy(prev => ({ ...prev, [botId]: false }))
  }

  async function deleteBot(botId) {
    if (confirmDelete !== botId) { setConfirmDelete(botId); return }
    setConfirmDelete(null)
    setBotBusy(prev => ({ ...prev, [botId]: true }))
    try {
      await api(`/api/hotel/bots/${botId}`, { method: 'DELETE' })
      setBots(prev => prev.filter(b => b.id !== botId))
    } catch (err) {
      setBotMessage(botId, err.message || 'Delete failed.', 'err')
      setBotBusy(prev => ({ ...prev, [botId]: false }))
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground">My Bots</h2>
        <button onClick={fetchBots} className="text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : bots.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <Bot className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No bots deployed yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Use <code className="font-mono bg-muted px-1 rounded">:setup_agent</code> in the hotel to deploy a bot.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {bots.map(bot => {
            const isBusy = !!botBusy[bot.id]
            const msg = botMsg[bot.id]
            return (
              <div key={bot.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                {/* Bot card header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card/50">
                  <span className="font-medium text-sm text-foreground flex-1 truncate">{bot.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    bot.active
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : 'bg-muted text-muted-foreground border border-border'
                  }`}>
                    {bot.active ? 'Active' : 'Inactive'}
                  </span>
                  <button onClick={() => startEditBot(bot)} disabled={isBusy}
                    className="h-7 px-2 text-xs border border-border rounded-md hover:bg-secondary transition-colors disabled:opacity-50 flex items-center gap-1">
                    <Edit className="w-3 h-3" />
                  </button>
                  <button onClick={() => confirmDelete === bot.id ? deleteBot(bot.id) : setConfirmDelete(bot.id)}
                    onBlur={() => setConfirmDelete(null)}
                    disabled={isBusy}
                    className={`h-7 px-2 text-xs border rounded-md transition-colors disabled:opacity-50 flex items-center gap-1 ${confirmDelete === bot.id ? 'border-destructive bg-destructive text-white' : 'border-destructive/30 text-destructive hover:bg-destructive/10'}`}>
                    {confirmDelete === bot.id ? 'Sure?' : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>

                {/* Bot card body */}
                <div className="flex items-center gap-4 px-4 py-4">
                  {bot.figure && (
                    <HabboFigure figure={bot.figure} size="md" animate={true} />
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Room: <span className="text-foreground">{bot.room_name || `#${bot.room_id}`}</span>
                    </p>
                    {bot.motto && (
                      <p className="text-xs text-muted-foreground italic truncate">"{bot.motto}"</p>
                    )}
                    {msg && (
                      <p className={`text-xs ${msg.type === 'err' ? 'text-destructive' : 'text-green-400'}`}>
                        {msg.text}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit Bot Modal */}
      {editingBotId !== null && (() => {
        const isBusy = !!botBusy[editingBotId]
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
            onClick={cancelEditBot}>
            <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl"
              onClick={e => e.stopPropagation()}>
              <h2 className="text-base font-semibold mb-4">Edit Bot</h2>
              <div className="flex gap-5">
                {editForm.figure && (
                  <div className="flex flex-col items-center gap-2 flex-shrink-0">
                    <HabboFigure figure={editForm.figure} size="md" animate={true} />
                    <span className="text-xs text-muted-foreground">{editForm.name}</span>
                  </div>
                )}
                <div className="flex-1 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Name</label>
                    <input maxLength={25} value={editForm.name}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Motto (shown in hotel)</label>
                    <input maxLength={100} value={editForm.motto}
                      onChange={e => setEditForm(f => ({ ...f, motto: e.target.value }))}
                      placeholder="e.g. Here to help!"
                      className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Persona</label>
                    <textarea rows={4} value={editForm.persona}
                      onChange={e => setEditForm(f => ({ ...f, persona: e.target.value }))}
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-vertical" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Figure type</label>
                    <select value={editForm.figureType}
                      onChange={e => {
                        const ft = figureTypes[e.target.value]
                        setEditForm(f => ({ ...f, figureType: e.target.value, figure: ft?.figure ?? f.figure, gender: ft?.gender ?? f.gender }))
                      }}
                      className="flex h-8 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                      {Object.entries(figureTypes).map(([t, v]) => (
                        <option key={t} value={t}>{t} ({v.gender})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4 justify-end">
                <button onClick={cancelEditBot} disabled={isBusy} type="button"
                  className="h-9 px-4 rounded-md border border-border text-sm hover:bg-secondary transition-colors">
                  Cancel
                </button>
                <button onClick={() => saveBot(editingBotId)} disabled={isBusy} type="button"
                  className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                  {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isBusy ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── MCP Tab ───────────────────────────────────────────────────────────────

function McpTab({ me }) {
  const activeTier = me?.ai_tier || 'basic'
  const [mcpData, setMcpData] = useState({ loading: true, tier: activeTier, tokens: [], calls: [] })
  const [newMcpToken, setNewMcpToken] = useState(null)
  const [tokenLabel, setTokenLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [copiedId, setCopiedId] = useState(null)

  useEffect(() => {
    if (activeTier === 'basic') { setMcpData(d => ({ ...d, loading: false })); return }
    Promise.all([api('/api/mcp/tokens'), api('/api/mcp/calls?limit=30')])
      .then(([tokenData, callData]) => {
        setMcpData({ loading: false, tier: tokenData.tier || activeTier, tokens: tokenData.tokens || [], calls: callData.calls || [] })
      })
      .catch(() => setMcpData(d => ({ ...d, loading: false })))
  }, [activeTier])

  async function handleCreateToken() {
    setBusy(true); setError(''); setMessage('')
    try {
      const data = await api('/api/mcp/tokens', { method: 'POST', body: JSON.stringify({ label: tokenLabel }) })
      setNewMcpToken(data.token || null)
      setTokenLabel('')
      const [tokenData, callData] = await Promise.all([api('/api/mcp/tokens'), api('/api/mcp/calls?limit=30')])
      setMcpData(d => ({ ...d, tier: tokenData.tier || d.tier, tokens: tokenData.tokens || [], calls: callData.calls || [] }))
      setMessage('MCP token generated. Copy it now — it is only shown once.')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function handleRevokeToken(tokenId) {
    setBusy(true); setError(''); setMessage('')
    try {
      await api(`/api/mcp/tokens/${tokenId}`, { method: 'DELETE' })
      const tokenData = await api('/api/mcp/tokens')
      setMcpData(d => ({ ...d, tier: tokenData.tier || d.tier, tokens: tokenData.tokens || [] }))
      setMessage('MCP token revoked.')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  function copyToken(value) {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedId(value)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="font-semibold text-foreground">MCP Connect</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Endpoint: <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">/mcp</code> on your hosted{' '}
          <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">hotel-mcp</code> domain.
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}
      {message && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {message}
        </div>
      )}

      {activeTier === 'basic' ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Key className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">Pro Plan Required</p>
          <p className="text-xs text-muted-foreground mt-1">Upgrade to Pro to enable MCP token generation.</p>
        </div>
      ) : (
        <>
          {/* New token */}
          {newMcpToken?.value && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 space-y-2">
              <p className="text-sm font-medium text-green-400">Copy this token now — it is only shown once!</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-xs bg-background/50 border border-border rounded-lg px-3 py-2 break-all">
                  {newMcpToken.value}
                </code>
                <button onClick={() => copyToken(newMcpToken.value)}
                  className="h-9 w-9 flex-shrink-0 flex items-center justify-center border border-border rounded-lg hover:bg-secondary transition-colors">
                  {copiedId === newMcpToken.value ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Generate token */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-medium">Generate New Token</h3>
            <div className="flex gap-2">
              <input
                placeholder="Token label (optional)"
                value={tokenLabel}
                onChange={e => setTokenLabel(e.target.value)}
                className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button onClick={handleCreateToken} disabled={busy}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 flex-shrink-0">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Generate
              </button>
            </div>
          </div>

          {/* Token list */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Your Tokens</h3>
            {mcpData.loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : mcpData.tokens.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tokens generated yet.</p>
            ) : (
              <div className="space-y-2">
                {mcpData.tokens.map(token => (
                  <div key={token.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        #{token.id} {token.token_label || '(no label)'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Status: {token.status} &middot; Last used: {token.last_used_at || 'never'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRevokeToken(token.id)}
                      disabled={busy || token.status !== 'active'}
                      className="h-7 px-3 text-xs border border-destructive/30 text-destructive rounded-md hover:bg-destructive/10 disabled:opacity-40 transition-colors flex-shrink-0">
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent calls */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Recent MCP Calls</h3>
            {mcpData.calls.length === 0 ? (
              <p className="text-xs text-muted-foreground">No MCP calls yet.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {mcpData.calls.map(call => (
                  <div key={call.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card/50">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${call.success ? 'bg-green-400' : 'bg-destructive'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {call.tool_name}
                        <span className="text-xs text-muted-foreground font-normal ml-1">({call.channel})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {call.duration_ms}ms &middot; {call.created_at}
                      </p>
                    </div>
                    <span className={`text-xs ${call.success ? 'text-green-400' : 'text-destructive'}`}>
                      {call.success ? 'ok' : 'error'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
