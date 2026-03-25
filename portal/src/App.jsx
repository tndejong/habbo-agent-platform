import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { HabboFigure } from './components/HabboFigure'
import { AgentDashboard, AccountView, LogPanel, OnlineView } from './components/AgentDashboard'
import { MarketplaceView } from './components/MarketplaceView'
import { useTheme } from './ThemeContext'
import { api } from './utils/api'
import {
  Home, Bot, Key, Users, LogOut, Hotel, ShoppingBag,
  Eye, EyeOff, Loader2, AlertCircle, CheckCircle,
  Wifi, WifiOff, Copy, Check, Trash2, RefreshCw,
  Edit, Settings, Square, User, ArrowUpCircle, Bell,
  ClipboardList, X, Sun, Moon, Network, Plus,
  Terminal, ChevronDown, ChevronLeft, ChevronRight, Wrench, PanelLeft,
} from 'lucide-react'

// ── Fallback figure types (if API is unavailable) ─────────────────────────

const FALLBACK_FIGURE_TYPES = {
  'default-m':  { gender: 'M', figure: 'hd-180-1.ch-210-66.lg-270-110.sh-300-91' },
  'citizen-m':  { gender: 'M', figure: 'hd-180-1.ch-210-66.lg-270-110.sh-300-91.ha-1012-110.hr-828-61' },
  'agent-m':    { gender: 'M', figure: 'hd-3095-12.ch-255-64.lg-3235-96.sh-295-91.ha-3426-110.hr-3531-61.he-1601-0.ea-3169-0.fa-1211-1408.cp-3310-0.cc-3007-0.ca-1809-0.wa-2007-0' },
  'default-f':  { gender: 'F', figure: 'hd-620-1.ch-680-66.lg-715-110.sh-905-91' },
  'citizen-f':  { gender: 'F', figure: 'hd-620-1.ch-680-66.lg-715-110.sh-905-91.ha-1012-110.hr-828-61' },
  'agent-f':    { gender: 'F', figure: 'hd-620-12.ch-3005-64.lg-3006-96.sh-905-91.ha-3426-110.hr-3531-61.he-1601-0.ea-3169-0' },
}

// ── Build stamp (vite `define`) — proves this JS bundle is what the browser loaded ──

function UiBuildFooter() {
  const stamp = import.meta.env.VITE_UI_BUILD_STAMP || 'dev'
  return (
    <footer className="border-t border-border py-2 px-4 text-center text-[10px] text-muted-foreground shrink-0">
      UI bundle <code className="text-[9px] bg-muted px-1 py-0.5 rounded">{stamp}</code>
      {' — '}if this never changes after deploy, hard-refresh or clear site cache
    </footer>
  )
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
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
      <UiBuildFooter />
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
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-secondary/20 pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      {/* Logo */}
      <div className="absolute top-6 left-6">
        <span className="text-base font-semibold tracking-tight text-foreground">AgentHotel</span>
      </div>

      <div className="relative w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">AgentHotel</h1>
          <p className="text-sm text-muted-foreground mt-2">Sign in to your account</p>
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
            <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-success/10 border border-success/20 text-success text-sm">
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
              Enter your account email to receive a password reset link.
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
      <UiBuildFooter />
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
  const { theme, toggleTheme } = useTheme()
  const [activeTab, setActiveTab] = useState('home')
  const [activeTeam, setActiveTeam] = useState(null)
  const [stopping, setStopping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pendingRequestCount, setPendingRequestCount] = useState(0)
  // Bumped when a MCP token is created/revoked in AccountView, so IntegratedView re-fetches hasMcpToken
  const [mcpTokenVersion, setMcpTokenVersion] = useState(0)
  const handleTokenChange = useCallback(() => setMcpTokenVersion(v => v + 1), [])

  // Sidebar collapsed state (persisted)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true' } catch { return false }
  })
  function toggleSidebar() {
    setSidebarCollapsed(v => {
      try { localStorage.setItem('sidebar-collapsed', String(!v)) } catch { /* ignore */ }
      return !v
    })
  }

  // User menu dropdown (top-right avatar area)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuRef = useRef(null)
  useEffect(() => {
    if (!showUserMenu) return
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu])

  // Poll for pending upgrade requests (developers only)
  useEffect(() => {
    if (!me?.is_developer) return
    function loadCount() {
      api('/api/tier-requests?status=pending')
        .then(d => setPendingRequestCount((d.requests || []).length))
        .catch(() => {})
    }
    loadCount()
    const id = setInterval(loadCount, 30000)
    return () => clearInterval(id)
  }, [me?.is_developer])

  async function stopTeam() {
    setStopping(true)
    try {
      await api('/api/agents/stop', {
        method: 'POST',
        body: JSON.stringify({ room_id: activeTeam?.roomId }),
      })
    }
    catch { /* ignore */ }
    finally { setStopping(false) }
  }
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
    { id: 'agents', label: 'My Agents', icon: Bot },
    { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag },
    { id: 'bots', label: 'Bots', icon: Users },
    { id: 'integrations', label: 'Integrations', icon: Network },
    ...(me?.is_developer ? [{ id: 'requests', label: 'Requests', icon: ClipboardList, badge: pendingRequestCount }] : []),
  ]

  return (
    <div className="h-screen bg-background flex overflow-hidden">

      {/* ── Collapsible Sidebar ── */}
      <aside className={`hidden md:flex flex-col flex-shrink-0 border-r border-border bg-card/60 backdrop-blur-sm transition-all duration-200 z-30 ${sidebarCollapsed ? 'w-14' : 'w-56'}`}>
        {/* Sidebar header / logo */}
        <div className="h-14 flex items-center px-3 border-b border-border flex-shrink-0 gap-2.5 overflow-hidden">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Hotel className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          {!sidebarCollapsed && (
            <span className="text-sm font-semibold tracking-tight text-foreground whitespace-nowrap">AgentHotel</span>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {tabs.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              title={sidebarCollapsed ? label : undefined}
              className={`w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-sm font-medium transition-colors relative ${
                activeTab === id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{label}</span>}
              {badge > 0 && (
                <span className={`flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex-shrink-0 ${sidebarCollapsed ? 'absolute top-1 right-1' : 'ml-auto'}`}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="p-2 border-t border-border flex-shrink-0">
          <button
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-full h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* ── Main area (navbar + content) ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* Top navbar — slim, right-side controls only */}
        <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20 flex-shrink-0">
          <div className="h-full px-4 flex items-center gap-3">

            {/* Mobile: logo + hamburger */}
            <div className="md:hidden flex items-center gap-2 mr-auto">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <Hotel className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold text-foreground">AgentHotel</span>
            </div>

            {/* Spacer — pushes right-side controls to the right on desktop */}
            <div className="hidden md:block flex-1" />

            {/* Active team indicator */}
            {activeTeam && (
              <div className="flex items-center gap-2 bg-success/10 border border-success/30 rounded-lg px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse flex-shrink-0" />
                <span className="text-xs text-success font-medium">Room {activeTeam.roomId}</span>
                <button
                  onClick={stopTeam}
                  disabled={stopping}
                  className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/70 ml-1 transition-colors disabled:opacity-50"
                  title="Stop team"
                >
                  <Square className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Hotel status — click to open Online page */}
            <button
              onClick={() => setActiveTab('online')}
              className={`flex items-center gap-1.5 text-xs transition-colors hover:text-foreground ${activeTab === 'online' ? 'text-foreground' : 'text-muted-foreground'}`}
              title="View online agents"
            >
              {hotelStatus.loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : hotelStatus.socket_online ? (
                <Wifi className="w-3 h-3 text-success" />
              ) : (
                <WifiOff className="w-3 h-3 text-muted-foreground" />
              )}
              <span className="hidden sm:inline">{hotelStatus.loading ? 'Checking...' : hotelStatus.socket_online ? 'Online' : 'Offline'}</span>
            </button>

            {/* Join hotel button */}
            <button
              onClick={handleJoinHotel}
              disabled={busy || !hotelStatus.socket_online}
              className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Hotel className="w-3 h-3" />
              <span className="hidden sm:inline">Join Hotel</span>
            </button>

            {/* User figure */}
            {me.figure && <HabboFigure figure={me.figure} size="sm" animate={false} className="hidden sm:block flex-shrink-0" />}

            {/* User dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(v => !v)}
                className={`flex items-center gap-1.5 text-sm transition-colors group ${showUserMenu ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <span className="hidden sm:inline">{me.username}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showUserMenu ? 'rotate-180 opacity-100' : 'opacity-40 group-hover:opacity-100'}`} />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50">
                  {/* Account */}
                  <button
                    onClick={() => { setActiveTab('account'); setShowUserMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    Settings
                  </button>
                  {me?.is_developer && (
                    <button
                      onClick={() => { setActiveTab('devtools'); setShowUserMenu(false) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
                    >
                      <Wrench className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      Dev Tools
                    </button>
                  )}

                  <div className="border-t border-border my-0.5" />

                  {/* Theme toggle */}
                  <button
                    onClick={() => { toggleTheme(); setShowUserMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
                  >
                    {theme === 'dark'
                      ? <Sun className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      : <Moon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    }
                    {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                  </button>

                  <div className="border-t border-border my-0.5" />

                  {/* Logout */}
                  <button
                    onClick={() => { handleLogout(); setShowUserMenu(false) }}
                    disabled={busy}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  >
                    <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile bottom nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 flex border-t border-border bg-card/95 backdrop-blur-sm z-20">
          {tabs.map(({ id, label, icon: Icon, badge }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`relative flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
                activeTab === id ? 'text-primary' : 'text-muted-foreground'
              }`}>
              <Icon className="w-4 h-4" />
              {label}
              {badge > 0 && (
                <span className="absolute top-1 right-2 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div key={activeTab} className="animate-fade-up">
          {activeTab === 'home' && (
            <HomeTab me={me} hotelStatus={hotelStatus} onJoinHotel={handleJoinHotel} busy={busy} />
          )}
          {activeTab === 'requests' && me?.is_developer && (
            <UpgradeRequestsTab onCountChange={setPendingRequestCount} />
          )}
          {activeTab === 'agents' && (
            <AgentDashboard me={me} onActiveTeamChange={setActiveTeam} mcpTokenVersion={mcpTokenVersion} />
          )}
        {activeTab === 'marketplace' && (
          <div className="max-w-5xl mx-auto px-4 py-6">
            <MarketplaceView me={me} />
          </div>
        )}

          {activeTab === 'account' && (
            <AccountView me={me} onTokenChange={handleTokenChange} />
          )}
          {activeTab === 'bots' && (
            <BotsTab figureTypes={figureTypes} />
          )}
          {activeTab === 'integrations' && (
            <IntegrationsTab />
          )}
          {activeTab === 'online' && (
            <div className="max-w-5xl mx-auto px-4 py-6">
              <OnlineView me={me} />
            </div>
          )}
          {activeTab === 'devtools' && me?.is_developer && (
            <DevToolsView me={me} />
          )}
          </div>
        </main>

        <UiBuildFooter />
      </div>{/* end main area */}
    </div>
  )
}

// ── Dev Tools Tab ─────────────────────────────────────────────────────────

function DevToolsView({ me }) {
  const [logLines, setLogLines] = useState([])
  const [logPaused, setLogPaused] = useState(false)

  useEffect(() => {
    if (!me?.is_developer) return
    async function fetchLogs() {
      if (logPaused) return
      try {
        const res = await fetch('/api/agents/logs?lines=200', { credentials: 'include' })
        const d = await res.json().catch(() => ({}))
        if (d.lines) setLogLines(d.lines)
      } catch { /* non-blocking */ }
    }
    fetchLogs()
    const id = setInterval(fetchLogs, 3000)
    return () => clearInterval(id)
  }, [me?.is_developer, logPaused])

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Terminal className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-foreground">Dev Tools</h1>
          <p className="text-xs text-muted-foreground">Live agent output and system logs</p>
        </div>
        <span className="ml-auto text-[10px] bg-primary/10 text-primary border border-primary/20 rounded px-1.5 py-0.5 font-medium">Developer</span>
      </div>
      <LogPanel lines={logLines} paused={logPaused} onTogglePause={() => setLogPaused(p => !p)} />
    </div>
  )
}

// ── Home Tab ──────────────────────────────────────────────────────────────

function HomeTab({ me, hotelStatus, onJoinHotel, busy }) {
  const activeTier = me?.ai_tier || 'basic'
  const [upgradeRequest, setUpgradeRequest] = useState(null)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  useEffect(() => {
    if (activeTier !== 'basic') return
    api('/api/tier-requests/mine')
      .then(d => setUpgradeRequest(d.request || null))
      .catch(() => {})
  }, [activeTier])

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {/* Upgrade CTA for basic users */}
      {activeTier === 'basic' && (
        upgradeRequest?.status === 'pending' ? (
          <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
            <Bell className="w-4 h-4 text-warning shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-warning/80">Upgrade request pending</p>
              <p className="text-xs text-warning/80/70 mt-0.5">Your request for <span className="capitalize">{upgradeRequest.requested_tier}</span> tier is being reviewed. We'll email you when it's decided.</p>
            </div>
          </div>
        ) : upgradeRequest?.status === 'denied' ? (
          <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive/80">Upgrade request denied</p>
              {upgradeRequest.admin_note && <p className="text-xs text-destructive/80/70 mt-0.5">{upgradeRequest.admin_note}</p>}
            </div>
            <button onClick={() => setShowUpgradeModal(true)}
              className="shrink-0 text-xs h-8 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              Try again
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <ArrowUpCircle className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Want to deploy agent teams?</p>
              <p className="text-xs text-muted-foreground mt-0.5">Request a Pro upgrade to install and launch agents in the hotel.</p>
            </div>
            <button onClick={() => setShowUpgradeModal(true)}
              className="shrink-0 text-xs h-8 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              Request upgrade
            </button>
          </div>
        )
      )}

      {showUpgradeModal && (
        <UpgradeRequestModal
          onClose={() => setShowUpgradeModal(false)}
          onSubmitted={(req) => { setUpgradeRequest(req); setShowUpgradeModal(false) }}
        />
      )}

      {/* Welcome card */}
      <div className="bg-card border border-border rounded-2xl p-6 card-lift">
        <div className="flex items-center gap-5">
          {me.figure && (
            <div className="flex-shrink-0">
              <HabboFigure figure={me.figure} size="md" animate={true} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Welcome back, {me.username}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your hotel bots, agent teams, and MCP connections.
            </p>
            {me.habbo_username && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                Habbo: <span className="font-retro">{me.habbo_username}</span>
              </p>
            )}
          </div>
          <button
            onClick={onJoinHotel}
            disabled={busy || !hotelStatus.socket_online}
            className="hidden sm:flex items-center gap-2 h-9 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-80 disabled:opacity-40 transition-opacity flex-shrink-0"
          >
            <Hotel className="w-4 h-4" />
            Join Hotel
          </button>
        </div>
      </div>

      {/* Status grid */}
      <div className="grid grid-cols-3 gap-4 stagger-children">
        <StatusCard
          label="Linked Habbo"
          value={me.habbo_username || '—'}
          icon={Users}
        />
        <StatusCard
          label="AI Tier"
          value={activeTier.charAt(0).toUpperCase() + activeTier.slice(1)}
          icon={Key}
        />
        <StatusCard
          label="Hotel"
          value={hotelStatus.loading ? 'Checking…' : hotelStatus.socket_online ? 'Online' : 'Offline'}
          icon={hotelStatus.socket_online ? Wifi : WifiOff}
          valueClassName={hotelStatus.socket_online ? 'text-success' : 'text-muted-foreground'}
        />
      </div>
    </div>
  )
}

function StatusCard({ label, value, icon: Icon, valueClassName = '' }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 card-lift">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-foreground" />
        </div>
      </div>
      <p className={`text-2xl font-semibold tracking-tight text-foreground ${valueClassName}`}>{value}</p>
    </div>
  )
}

// ── Bots Tab ──────────────────────────────────────────────────────────────

function BotsTab({ figureTypes }) {
  const [bots, setBots] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [editingBotId, setEditingBotId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [botBusy, setBotBusy] = useState({})
  const [botMsg, setBotMsg] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [botsMeta, setBotsMeta] = useState(null)

  const fetchBots = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api('/api/hotel/bots')
      setBots(d.bots || [])
      setBotsMeta(d.meta || null)
    } catch {
      setBots([])
      setBotsMeta(null)
    }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchBots()
    const t = setInterval(fetchBots, 10_000)
    return () => clearInterval(t)
  }, [fetchBots])

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
      if (d.visualChanged) {
        if (d.liveUpdated) {
          parts.push('Applied live in hotel.')
        } else {
          parts.push(`Figure/name will update when the bot next enters the room — ${d.liveUpdateError || 'bot not active'}.`)
        }
      }
      if (d.personaUpdated) parts.push('Persona updated.')
      setBotMessage(botId, parts.join(' '), d.visualChanged && !d.liveUpdated ? 'warn' : 'ok', 7000)
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

  async function syncBots() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const d = await api('/api/hotel/bots/sync', { method: 'POST' })
      const parts = []
      if (d.removed > 0) {
        parts.push(`Removed ${d.removed} stale portal entr${d.removed !== 1 ? 'ies' : 'y'}`)
      }
      if (d.imported > 0) {
        parts.push(`imported ${d.imported} bot${d.imported !== 1 ? 's' : ''}`)
      }
      setSyncMsg(
        parts.length > 0
          ? `${parts.join(' · ')}.`
          : `Up to date (${d.totalOwned ?? 0} in your hotel inventory).`
      )
      await fetchBots()
    } catch (err) {
      setSyncMsg(err.message || 'Sync failed.')
    }
    setSyncing(false)
    setTimeout(() => setSyncMsg(null), 4000)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-foreground">My Bots</h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-lg">
            These are your <span className="text-foreground">Habbo hotel bots</span> — physical avatars that walk around rooms in the hotel.
            Editing a bot updates it <span className="text-foreground">live in the hotel</span> (name, motto &amp; appearance change instantly).
            <span className="ml-1 opacity-80">Agents (under <em>My Agents</em>) are the AI brains that can be assigned to control these bots.</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {syncMsg && <span className="text-xs text-muted-foreground">{syncMsg}</span>}
          <button onClick={syncBots} disabled={syncing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-secondary transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync bots'}
          </button>
        </div>
      </div>

      {botsMeta?.rcon && !botsMeta.rcon.verified && botsMeta.rcon.roomsRequested > 0 && (
        <div className="text-xs rounded-lg border border-warning/30 bg-warning/10 text-warning/90 px-3 py-2 space-y-1">
          <p className="font-medium">Live bot status is not verified against the emulator</p>
          <p className="opacity-90">
            RCON to <code className="text-[10px]">{botsMeta.rcon.host}:{botsMeta.rcon.port}</code> failed or the
            <code className="text-[10px]"> roomlivebots</code> command is missing — the portal falls back to MySQL/MCP only (same as before).
            Rebuild the <code className="text-[10px]">arcturus</code> image so RCON includes <code className="text-[10px]">RoomLiveBots</code>, set <code className="text-[10px]">HABBO_RCON_ALLOWED</code> for Docker networks, restart <code className="text-[10px]">agent-portal</code>, hard-refresh the browser.
          </p>
          {botsMeta.rcon.lastError && (
            <p className="text-[10px] opacity-80 font-mono break-all">Last error: {botsMeta.rcon.lastError}</p>
          )}
        </div>
      )}

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
            Bots are managed by hotel administrators.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {bots.map(bot => {
            const isBusy = !!botBusy[bot.id]
            const msg = botMsg[bot.id]
            const ghost = !!bot.ghost_stale_db
            const live = !ghost && Number(bot.live_room_id) > 0
            const placed = !ghost && Number(bot.db_room_id) > 0
            let statusBadgeClass = 'bg-muted text-muted-foreground border border-border'
            let statusLabel = 'In inventory'
            if (ghost) {
              statusBadgeClass = 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
              statusLabel = `Stale DB · room ${bot.stale_db_room_id || '?'}`
            } else if (live) {
              statusBadgeClass = 'bg-success/10 text-success border border-success/20'
              statusLabel = `Live · ${bot.live_room_name || `#${bot.live_room_id}`}`
            } else if (placed) {
              statusBadgeClass = 'bg-warning/10 text-warning border border-warning/20'
              statusLabel = `Placed · ${bot.db_room_name || `#${bot.db_room_id}`}`
            }
            return (
              <div key={bot.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                {/* Bot card header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card/50">
                  <span className="font-medium text-sm text-foreground flex-1 truncate">{bot.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full max-w-[min(200px,46vw)] truncate ${statusBadgeClass}`} title={statusLabel}>
                    {statusLabel}
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
                      {ghost ? (
                        <>
                          MySQL still has <span className="text-foreground">room_id = {bot.stale_db_room_id}</span> for this bot, but the emulator is not running it in that room (duplicate row, unload race, or old data).
                          <span className="block mt-0.5 opacity-90">Delete this portal entry or remove the extra <code className="text-[10px]">bots</code> row — only the live row should remain.</span>
                        </>
                      ) : live ? (
                        <>Currently in (loaded room): <span className="text-foreground">{bot.live_room_name || `#${bot.live_room_id}`}</span></>
                      ) : placed ? (
                        <>In hotel DB, placed in: <span className="text-foreground">{bot.db_room_name || `#${bot.db_room_id}`}</span>
                          <span className="block mt-0.5 opacity-80">Room may be unloaded — open it in the hotel to go &quot;Live&quot; here.</span></>
                      ) : Number(bot.config_room_id) > 0 ? (
                        <>Portal spawn target: <span className="text-foreground">{bot.room_name || `#${bot.config_room_id}`}</span>
                          <span className="block mt-0.5 opacity-80">Bot is still in your inventory (not placed in a room).</span></>
                      ) : (
                        <>In inventory — use <span className="text-foreground">Place in room</span> in the hotel client.</>
                      )}
                    </p>
                    {bot.motto && (
                      <p className="text-xs text-muted-foreground italic truncate">"{bot.motto}"</p>
                    )}
                    {msg && (
                      <p className={`text-xs ${msg.type === 'err' ? 'text-destructive' : msg.type === 'warn' ? 'text-warning' : 'text-success'}`}>
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

      {botsMeta && (
        <p className="text-[10px] text-muted-foreground">
          Build: portal v{botsMeta.portalVersion} · {botsMeta.distMainJs}
          {botsMeta.rcon?.roomsRequested > 0 && (
            <span>
              {' '}
              · RCON {botsMeta.rcon.verified ? 'ok' : 'failed'}{' '}
              ({botsMeta.rcon.roomsOk}/{botsMeta.rcon.roomsRequested} rooms)
            </span>
          )}
        </p>
      )}

      {/* Edit Bot Modal — rendered via portal so fixed positioning is never
          clipped by ancestor transforms, backdrop-filters, or stacking contexts */}
      {editingBotId !== null && (() => {
        const isBusy = !!botBusy[editingBotId]
        return createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
            onClick={cancelEditBot}>
            <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl"
              onClick={e => e.stopPropagation()}>
              <div className="mb-4">
                <h2 className="text-base font-semibold">Edit Bot</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Changes to name, motto &amp; appearance apply <span className="text-foreground font-medium">live in the hotel</span> immediately after saving.
                </p>
              </div>
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
          </div>,
          document.body
        )
      })()}
    </div>
  )
}

// ── Upgrade Request Modal (user) ─────────────────────────────────────────

function UpgradeRequestModal({ onClose, onSubmitted }) {
  const [tier, setTier] = useState('pro')
  const [motivation, setMotivation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const data = await api('/api/tier-requests', {
        method: 'POST',
        body: JSON.stringify({ requested_tier: tier, motivation }),
      })
      onSubmitted({ id: data.id, requested_tier: tier, motivation, status: 'pending', admin_note: '' })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Request Tier Upgrade</h2>
            <p className="text-xs text-muted-foreground mt-1">Tell us what you'd like to do — an admin will review your request.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Requested tier</label>
            <div className="flex gap-2">
              {['pro', 'enterprise'].map(t => (
                <button
                  key={t} type="button"
                  onClick={() => setTier(t)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors capitalize ${
                    tier === t
                      ? 'bg-primary/10 border-primary/40 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Why do you need this? <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              rows={4}
              value={motivation}
              onChange={e => setMotivation(e.target.value)}
              placeholder="e.g. I want to deploy a Sprint Team in the hotel for daily stand-ups…"
              className="flex w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={busy}
              className="flex-1 h-10 rounded-lg border border-border text-sm hover:bg-secondary transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy ? 'Sending…' : 'Send Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Upgrade Requests Tab (developer) ─────────────────────────────────────

function UpgradeRequestsTab({ onCountChange }) {
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState({})
  const [reviewing, setReviewing] = useState(null) // { id, decision }
  const [adminNote, setAdminNote] = useState('')
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api(`/api/tier-requests?status=${filter}`)
      const list = d.requests || []
      setRequests(list)
      if (filter === 'pending') onCountChange(list.length)
    } catch { setRequests([]) }
    finally { setLoading(false) }
  }, [filter, onCountChange])

  useEffect(() => { load() }, [load])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function submitReview(requestId, decision) {
    setBusy(b => ({ ...b, [requestId]: true }))
    try {
      await api(`/api/tier-requests/${requestId}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, admin_note: adminNote }),
      })
      setReviewing(null)
      setAdminNote('')
      showToast(`Request ${decision}.`)
      load()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setBusy(b => ({ ...b, [requestId]: false }))
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-foreground">Tier Upgrade Requests</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Review and approve or deny user upgrade requests.</p>
        </div>
        <button onClick={load} className="text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {toast && (
        <div className={`rounded-lg px-4 py-2.5 text-sm ${toast.type === 'error' ? 'bg-destructive/10 text-destructive border border-destructive/30' : 'bg-success/10 text-success border border-success/30'}`}>
          {toast.msg}
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2">
        {['pending', 'approved', 'denied'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors capitalize ${
              filter === s ? 'bg-primary/10 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
            }`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground">No {filter} requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req.id} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{req.username}</span>
                      <span className="text-xs text-muted-foreground">{req.email}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[11px] bg-muted px-2 py-0.5 rounded text-muted-foreground">
                        Current: <span className="font-medium text-foreground capitalize">{req.current_tier}</span>
                      </span>
                      <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded capitalize">
                        → {req.requested_tier}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {new Date(req.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {req.motivation && (
                      <p className="text-xs text-muted-foreground mt-2 italic leading-relaxed">"{req.motivation}"</p>
                    )}
                    {req.admin_note && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium not-italic text-foreground/80">Admin note:</span> {req.admin_note}
                      </p>
                    )}
                  </div>

                  {/* Status badge for non-pending */}
                  {req.status !== 'pending' && (
                    <span className={`shrink-0 text-xs px-2.5 py-1 rounded-lg capitalize ${
                      req.status === 'approved' ? 'bg-success/10 text-success border border-success/20' : 'bg-destructive/10 text-destructive border border-destructive/20'
                    }`}>
                      {req.status}
                    </span>
                  )}
                </div>

                {/* Approve/deny buttons for pending */}
                {req.status === 'pending' && (
                  reviewing?.id === req.id ? (
                    <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                      <input
                        placeholder={`Optional note to user (${reviewing.decision})…`}
                        value={adminNote}
                        onChange={e => setAdminNote(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => { setReviewing(null); setAdminNote('') }}
                          className="flex-1 h-8 text-xs rounded-md border border-border hover:bg-secondary transition-colors">
                          Cancel
                        </button>
                        <button
                          onClick={() => submitReview(req.id, reviewing.decision)}
                          disabled={!!busy[req.id]}
                          className={`flex-1 h-8 text-xs rounded-md font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 ${
                            reviewing.decision === 'approved'
                              ? 'bg-success/10 text-success border border-success/30 hover:bg-success/20'
                              : 'bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20'
                          }`}>
                          {busy[req.id] && <Loader2 className="w-3 h-3 animate-spin" />}
                          Confirm {reviewing.decision}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-border/60">
                      <button onClick={() => { setReviewing({ id: req.id, decision: 'denied' }); setAdminNote('') }}
                        className="flex-1 h-8 text-xs rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors">
                        Deny
                      </button>
                      <button onClick={() => { setReviewing({ id: req.id, decision: 'approved' }); setAdminNote('') }}
                        className="flex-1 h-8 text-xs rounded-md bg-success/10 text-success border border-success/30 hover:bg-success/20 transition-colors font-medium">
                        Approve
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Integrations Tab ──────────────────────────────────────────────────────

const BLANK_INTEGRATION = { name: '', url: '', api_key: '' }

function IntegrationsTab() {
  const [integrations, setIntegrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(BLANK_INTEGRATION)
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [pingStatus, setPingStatus] = useState({}) // { [id]: 'checking'|'online'|'offline' }
  const [showApiKey, setShowApiKey] = useState({}) // { [id]: bool }

  function showToast(text, type = 'success') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api('/api/my/integrations')
      setIntegrations(data.integrations || [])
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function pingIntegration(id, url) {
    setPingStatus(s => ({ ...s, [id]: 'checking' }))
    try {
      const data = await api('/api/my/integrations/ping', {
        method: 'POST',
        body: JSON.stringify({ url }),
      })
      setPingStatus(s => ({ ...s, [id]: data.online ? 'online' : 'offline' }))
    } catch {
      setPingStatus(s => ({ ...s, [id]: 'offline' }))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      if (editingId) {
        await api(`/api/my/integrations/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        })
        showToast('Integration updated.')
      } else {
        await api('/api/my/integrations', {
          method: 'POST',
          body: JSON.stringify(form),
        })
        showToast('Integration added.')
      }
      setForm(BLANK_INTEGRATION)
      setEditingId(null)
      setShowForm(false)
      await load()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id) {
    setBusy(true)
    try {
      await api(`/api/my/integrations/${id}`, { method: 'DELETE' })
      setIntegrations(prev => prev.filter(i => i.id !== id))
      showToast('Integration removed.')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  function startEdit(integration) {
    setForm({ name: integration.name, url: integration.url, api_key: '' })
    setEditingId(integration.id)
    setShowForm(true)
  }

  function cancelForm() {
    setForm(BLANK_INTEGRATION)
    setEditingId(null)
    setShowForm(false)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-foreground">Integrations</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Connect external MCP servers to your agent teams. Each server is available per-run.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setForm(BLANK_INTEGRATION) }}
            className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add server
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-start gap-2 p-3 rounded-lg text-sm border ${
          toast.type === 'error'
            ? 'bg-destructive/10 border-destructive/20 text-destructive'
            : 'bg-success/10 border-success/20 text-success'
        }`}>
          {toast.type === 'error'
            ? <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            : <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          {toast.text}
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-medium">{editingId ? 'Edit integration' : 'Add MCP server'}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Name</label>
              <input
                required
                placeholder="e.g. My Notion MCP"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Server URL</label>
              <input
                required
                type="url"
                placeholder="https://mcp.example.com"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              API key <span className="text-muted-foreground/60">(optional — leave blank to keep existing)</span>
            </label>
            <input
              type="password"
              placeholder={editingId ? '••••••• (leave blank to keep current)' : 'API key or bearer token'}
              value={form.api_key}
              onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={busy}
              className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingId ? 'Save changes' : 'Add server'}
            </button>
            <button type="button" onClick={cancelForm}
              className="h-8 px-3 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Integration list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : integrations.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Network className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">No integrations yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add an external MCP server to make it available to your agent teams.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {integrations.map(integration => {
            const ping = pingStatus[integration.id]
            return (
              <div key={integration.id} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
                {/* Ping dot */}
                <div className="flex-shrink-0">
                  {ping === 'checking' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  ) : ping === 'online' ? (
                    <span className="w-2 h-2 rounded-full bg-success block" title="Reachable" />
                  ) : ping === 'offline' ? (
                    <span className="w-2 h-2 rounded-full bg-destructive block" title="Unreachable" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/30 block" title="Not pinged yet" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{integration.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{integration.url}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => pingIntegration(integration.id, integration.url)}
                    disabled={ping === 'checking'}
                    title="Test connection"
                    className="h-7 w-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40">
                    <Wifi className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => startEdit(integration)}
                    title="Edit"
                    className="h-7 w-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(integration.id)}
                    disabled={busy}
                    title="Remove"
                    className="h-7 w-7 flex items-center justify-center rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
