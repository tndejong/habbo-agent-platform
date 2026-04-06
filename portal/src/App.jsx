import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Routes, Route, Navigate, Outlet, useNavigate, useParams, useOutletContext } from 'react-router-dom'
import { useEscapeKey } from './utils/useEscapeKey'
import { createPortal } from 'react-dom'
import { Provider as TooltipProvider } from '@radix-ui/react-tooltip'
import { HabboFigure } from './components/HabboFigure'
import { AgentDashboard, SettingsView, LogPanel, OnlineView } from './components/AgentDashboard'
import { ReportsView } from './components/ReportsView'
import { FeedbackWidget, FeedbackView } from './components/FeedbackWidget'
import { MarketplaceView } from './components/MarketplaceView'
import { useTheme } from './ThemeContext'
import { HotelProvider, useHotel } from './HotelContext'
import { api } from './utils/api'
import { useToast } from './ToastContext'
import { can } from './utils/permissions'
import {
  Home, Bot, Key, Users, LogOut, Hotel, ShoppingBag,
  Eye, EyeOff, Loader2, AlertCircle, AlertTriangle, CheckCircle,
  Wifi, WifiOff, Copy, Check, Trash2, RefreshCw,
  Edit, Settings, Square, ArrowUpCircle, Bell,
  ClipboardList, X, Sun, Moon, Network, Plus,
  Terminal, ChevronDown, ChevronLeft, ChevronRight, Wrench, PanelLeft, MessageSquarePlus, Minus, Waves,
  Search, Sparkles, LayoutGrid, ExternalLink, Lock, Download, FileText,
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

// ── Version footer + update detection ─────────────────────────────────────────

const BUNDLED_VERSION = import.meta.env.VITE_APP_VERSION || 'dev'

function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' })
        if (!res.ok) return
        const { version } = await res.json()
        if (version && version !== BUNDLED_VERSION) setUpdateAvailable(true)
      } catch { /* network unavailable — ignore */ }
    }

    check()
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  return updateAvailable
}

function UiBuildFooter() {
  const updateAvailable = useVersionCheck()
  return (
    <>
      {updateAvailable && (
        <div className="shrink-0 bg-primary text-primary-foreground text-[11px] font-medium py-1.5 px-4 flex items-center justify-center gap-3">
          <span>Nieuwe versie beschikbaar</span>
          <button
            onClick={() => window.location.reload()}
            className="underline underline-offset-2 font-semibold hover:opacity-80"
          >
            Vernieuwen
          </button>
        </div>
      )}
      <footer className="border-t border-border py-2 px-4 text-center text-[10px] text-muted-foreground shrink-0">
        v{BUNDLED_VERSION}
      </footer>
    </>
  )
}

// ── Root App ──────────────────────────────────────────────────────────────

const DASHBOARD_TAB_IDS = new Set([
  'home', 'agents', 'marketplace', 'integrations', 'reports', 'requests',
  'settings', 'tiers', 'online', 'devtools', 'feedback',
])

function resolveDashboardTab(tab, me) {
  if (!tab || !DASHBOARD_TAB_IDS.has(tab)) return 'home'
  
  if (tab === 'requests' && !can(me, 'admin.requests')) return 'home'
  if (tab === 'devtools' && !can(me, 'devtools.access')) return 'home'
  if (tab === 'feedback' && !can(me, 'admin.feedback')) return 'home'
  
  return tab
}

export default function App() {
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/api/auth/me')
      .then(d => { setMe(d.user || null); setLoading(false) })
      .catch(() => { setMe(null); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
      <UiBuildFooter />
    </div>
  )

  return (
    <Routes>
      <Route
        path="/login"
        element={me ? <Navigate to="/app/home" replace /> : <AuthPage onLogin={setMe} />}
      />
      <Route path="/" element={<Navigate to={me ? '/app/home' : '/login'} replace />} />
      <Route
        path="/app"
        element={
          me ? (
            <HotelProvider me={me}>
              <Outlet context={{ me, setMe }} />
            </HotelProvider>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      >
        <Route index element={<Navigate to="home" replace />} />
        <Route path=":tab" element={<DashboardInner />} />
      </Route>
      <Route path="*" element={<Navigate to={me ? '/app/home' : '/login'} replace />} />
    </Routes>
  )
}

// ── Auth Page ─────────────────────────────────────────────────────────────

function AuthPage({ onLogin }) {
  const navigate = useNavigate()
  const params = new URLSearchParams(window.location.search)
  const hasResetParams = params.get('reset') === '1'

  const [authTab, setAuthTab] = useState('login')
  const [showReset, setShowReset] = useState(hasResetParams)
  const [showForgot, setShowForgot] = useState(false)
  const [busy, setBusy] = useState(false)
  useEscapeKey(() => { setShowForgot(false); setShowReset(false) }, !!(showForgot || showReset))
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

  // Triggers form submission (with native validation) when Enter is pressed inside an input
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
      const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(registerForm) })
      onLogin(data.user)
      navigate('/app/home', { replace: true })
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function handleLogin(e) {
    e.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(loginForm) })
      onLogin(data.user)
      navigate('/app/home', { replace: true })
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
              <form onSubmit={handleReset} onKeyDown={submitOnEnter} className="space-y-3">
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

                  {/* Workspace type selector */}
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

      {/* Forgot password modal */}
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

// ── Dashboard ─────────────────────────────────────────────────────────────

function DashboardInner() {
  const { me, setMe } = useOutletContext()
  const { tab: tabParam } = useParams()
  const navigate = useNavigate()
  const { theme, toggleTheme, cycleTheme, setThemeByName } = useTheme()
  const { habboConnected, hotelStatus } = useHotel()
  const activeTab = resolveDashboardTab(tabParam, me)
  const setActiveTab = useCallback((id) => {
    navigate(`/app/${id}`)
  }, [navigate])

  useEffect(() => {
    if (tabParam && resolveDashboardTab(tabParam, me) !== tabParam) {
      navigate(`/app/${resolveDashboardTab(tabParam, me)}`, { replace: true })
    }
  }, [tabParam, me, navigate])
  const [activeTeam, setActiveTeam] = useState(null)
  const [stopping, setStopping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pendingRequestCount, setPendingRequestCount] = useState(0)

  const refreshMe = useCallback(() => {
    api('/api/auth/me')
      .then(d => setMe(d.user || null))
      .catch(() => {})
  }, [setMe])

  // Bumped when a MCP token is created/revoked in SettingsView, so IntegratedView re-fetches hasMcpToken
  const [mcpTokenVersion, setMcpTokenVersion] = useState(0)
  const handleTokenChange = useCallback(() => { setMcpTokenVersion(v => v + 1); refreshMe() }, [refreshMe])

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

  // Poll for pending upgrade requests (admin.requests permission only)
  useEffect(() => {
    if (!can(me, 'admin.requests')) return
    function loadCount() {
      api('/api/tier-requests?status=pending')
        .then(d => setPendingRequestCount((d.requests || []).length))
        .catch(() => {})
    }
    loadCount()
    const id = setInterval(loadCount, 30000)
    return () => clearInterval(id)
  }, [me])

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
  const [figureTypes, setFigureTypes] = useState(FALLBACK_FIGURE_TYPES)

  // Load figure types on mount
  useEffect(() => {
    api('/api/figure-types')
      .then(d => { if (d.figureTypes) setFigureTypes(d.figureTypes) })
      .catch(() => {})
  }, [])

  async function handleLogout() {
    setBusy(true)
    try {
      await api('/api/auth/logout', { method: 'POST' })
      setMe(null)
      navigate('/login', { replace: true })
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
    { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag },
    { id: 'integrations', label: 'Integrations', icon: Network },
    { id: 'reports', label: 'Reports', icon: FileText },
    ...(can(me, 'admin.requests') ? [{ id: 'requests', label: 'Requests', icon: ClipboardList, badge: pendingRequestCount }] : []),
  ]

  return (
    <TooltipProvider delayDuration={400}>
    <div className="h-screen bg-background flex overflow-hidden">

      {/* ── Collapsible Sidebar ── */}
      <aside className={`hidden md:flex flex-col flex-shrink-0 border-r border-border bg-card/60 backdrop-blur-sm transition-all duration-200 z-30 ${sidebarCollapsed ? 'w-14' : 'w-56'}`}>
        {/* Sidebar header / logo */}
        <button
          onClick={() => setActiveTab('home')}
          className="h-14 flex items-center px-3 border-b border-border flex-shrink-0 gap-2.5 overflow-hidden w-full hover:bg-secondary/50 transition-colors"
        >
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Hotel className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          {!sidebarCollapsed && (
            <span className="text-sm font-semibold tracking-tight text-foreground whitespace-nowrap">AgentHotel</span>
          )}
        </button>

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
            <button
              onClick={() => setActiveTab('home')}
              className="md:hidden flex items-center gap-2 mr-auto hover:opacity-70 transition-opacity"
            >
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <Hotel className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold text-foreground">AgentHotel</span>
            </button>

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

            {/* Hotel status — only shown when hotel integration is active */}
            {habboConnected && (
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
            )}

            {/* Join hotel button — only when hotel integration is active */}
            {habboConnected && (
              <button
                onClick={handleJoinHotel}
                disabled={busy || !hotelStatus.socket_online}
                className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Hotel className="w-3 h-3" />
                <span className="hidden sm:inline">Join Hotel</span>
              </button>
            )}

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
                  {/* Settings */}
                  <button
                    onClick={() => { setActiveTab('settings'); setShowUserMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    Settings
                  </button>
                  {can(me, 'devtools.access') && (
                    <button
                      onClick={() => { setActiveTab('devtools'); setShowUserMenu(false) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
                    >
                      <Wrench className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      Dev Tools
                    </button>
                  )}
                  {can(me, 'admin.feedback') && (
                    <button
                      onClick={() => { setActiveTab('feedback'); setShowUserMenu(false) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      Feedback
                    </button>
                  )}

                  <div className="border-t border-border my-0.5" />

                  {/* Theme switcher — segmented 3-icon control */}
                  <div className="px-3 py-2.5">
                    <p className="text-xs text-muted-foreground mb-2">Theme</p>
                    <div className="relative flex items-center bg-secondary rounded-lg p-0.5 gap-0">
                      {/* sliding indicator */}
                      <div
                        className="absolute top-0.5 bottom-0.5 w-1/3 rounded-md bg-background border border-border shadow-sm transition-all duration-200 ease-in-out"
                        style={{ left: theme === 'light' ? '0.125rem' : theme === 'dark' ? 'calc(33.333% + 0.125rem)' : 'calc(66.666% + 0.125rem)' }}
                      />
                      {[
                        { id: 'light', icon: Sun,   label: 'Light' },
                        { id: 'dark',  icon: Moon,  label: 'Dark'  },
                        { id: 'abyss', icon: Waves, label: 'Abyss' },
                      ].map(({ id, icon: Icon, label }) => (
                        <button
                          key={id}
                          title={label}
                          onClick={() => { setThemeByName(id); setShowUserMenu(false) }}
                          className={`relative z-10 flex-1 flex items-center justify-center h-7 rounded-md transition-colors duration-150 ${
                            theme === id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </button>
                      ))}
                    </div>
                  </div>

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
            <HomeTab me={me} onNavigate={setActiveTab} />
          )}
          {activeTab === 'tiers' && (
            <TiersTab me={me} onNavigate={setActiveTab} />
          )}
          {activeTab === 'requests' && can(me, 'admin.requests') && (
            <UpgradeRequestsTab onCountChange={setPendingRequestCount} />
          )}
          {activeTab === 'agents' && (
            <AgentDashboard me={me} onActiveTeamChange={setActiveTeam} mcpTokenVersion={mcpTokenVersion} />
          )}
        {activeTab === 'marketplace' && (
          <div className="max-w-5xl mx-auto px-4 py-6">
            <MarketplaceView me={me} onNavigate={setActiveTab} />
          </div>
        )}

          {activeTab === 'settings' && (
            <SettingsView me={me} onTokenChange={handleTokenChange} onKeyUpdated={refreshMe} />
          )}
          {activeTab === 'integrations' && (
            <IntegrationsTab me={me} hotelStatus={hotelStatus} onHotelToggle={() => { refreshMe(); }} figureTypes={figureTypes} />
          )}
          {activeTab === 'reports' && (
            <div className="max-w-5xl mx-auto px-4 py-6">
              <ReportsView />
            </div>
          )}
          {activeTab === 'online' && (
            <div className="max-w-5xl mx-auto px-4 py-6">
              <OnlineView />
            </div>
          )}
          {activeTab === 'devtools' && can(me, 'devtools.access') && (
            <DevToolsView me={me} />
          )}
          {activeTab === 'feedback' && can(me, 'admin.feedback') && (
            <FeedbackView />
          )}
          </div>
        </main>

        {/* Floating feedback widget — always visible regardless of active tab */}
        <FeedbackWidget />

        <UiBuildFooter />
      </div>{/* end main area */}
    </div>
    </TooltipProvider>
  )
}

// ── Dev Tools Tab ─────────────────────────────────────────────────────────

function DevToolsView({ me }) {
  const [logLines, setLogLines] = useState([])
  const [logPaused, setLogPaused] = useState(false)
  const [bakDownloading, setBakDownloading] = useState(false)
  const [bakError, setBakError] = useState(null)

  useEffect(() => {
    if (!can(me, 'devtools.access')) return
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
  }, [me, logPaused])

  async function downloadBak() {
    setBakDownloading(true)
    setBakError(null)
    try {
      const res = await fetch('/api/agents/logs/bak', { credentials: 'include' })
      if (res.status === 404) { setBakError('No previous session log yet.'); return }
      if (!res.ok) { setBakError('Download failed.'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'hotel-team.log.bak'
      a.click()
      URL.revokeObjectURL(url)
    } catch { setBakError('Download failed.') } finally { setBakDownloading(false) }
  }

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
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={downloadBak}
            disabled={bakDownloading}
            title="Download previous session log (.bak)"
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-colors text-muted-foreground border-border hover:text-foreground disabled:opacity-50"
          >
            {bakDownloading
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Download className="w-3 h-3" />}
            Previous log
          </button>
          {bakError && <span className="text-xs text-destructive">{bakError}</span>}
          <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 rounded px-1.5 py-0.5 font-medium">Developer</span>
        </div>
      </div>
      <LogPanel lines={logLines} paused={logPaused} onTogglePause={() => setLogPaused(p => !p)} />
    </div>
  )
}

// ── Home Tab ──────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { label: 'My Agents',    description: 'Manage your agent teams',         icon: Bot,           tab: 'agents'       },
  { label: 'Marketplace',  description: 'Browse and install teams',        icon: ShoppingBag,   tab: 'marketplace'  },
  { label: 'Integrations', description: 'Connect external services',       icon: Network,       tab: 'integrations' },
  { label: 'Reports',     description: 'View and evaluate reports',        icon: FileText,      tab: 'reports'      },
  { label: 'Requests', description: 'View and manage requests',            icon: ClipboardList, tab: 'requests'     },
  { label: 'Settings',     description: 'Account and API key settings',    icon: Settings,      tab: 'settings'     },
]

function HomeTab({ me, onNavigate }) {
  const { hotelStatus, habboConnected } = useHotel()
  const activeTier = me?.ai_tier || 'basic'
  const [upgradeRequest, setUpgradeRequest] = useState(null)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [teamWarning, setTeamWarning] = useState(null) // { teamName } | null

  useEffect(() => {
    if (activeTier !== 'basic') return
    api('/api/tier-requests/mine')
      .then(d => setUpgradeRequest(d.request || null))
      .catch(() => {})
  }, [activeTier])

  useEffect(() => {
    if (activeTier === 'basic' || !habboConnected) {
      setTeamWarning(null)
      return
    }
    Promise.all([api('/api/my/teams'), api('/api/agents/bots?mine=true')])
      .then(([td, bd]) => {
        const botNames = new Set((bd.bots || []).map(b => b.name?.toLowerCase()).filter(Boolean))
        const bad = (td.teams || []).find(t =>
          (t.members || []).some(m => !m.bot_name?.trim() || !botNames.has(m.bot_name.toLowerCase()))
        )
        setTeamWarning(bad ? { teamName: bad.name } : null)
      })
      .catch(() => {})
  }, [activeTier, habboConnected])

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {/* Upgrade CTA for basic users */}
      {activeTier === 'basic' && (
        upgradeRequest?.status === 'pending' ? (
          <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
            <Bell className="w-4 h-4 text-warning shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-warning/80">Upgrade request pending</p>
              <p className="text-xs text-warning/60 mt-0.5">Your request for <span className="capitalize">{upgradeRequest.requested_tier}</span> tier is being reviewed. We'll email you when it's decided.</p>
            </div>
          </div>
        ) : upgradeRequest?.status === 'denied' ? (
          <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive/80">Upgrade request denied</p>
              {upgradeRequest.admin_note && <p className="text-xs text-destructive/60 mt-0.5">{upgradeRequest.admin_note}</p>}
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

      {/* Welcome card — clickable → Settings */}
      {(() => {
        const setupSteps = activeTier === 'basic'
          ? [{ done: false, label: 'Upgrade to Pro to deploy agents', sub: 'Basic is read-only', tab: 'tiers' }]
          : [
              !me.has_anthropic_key && { done: false, label: 'Add your Anthropic API key', sub: 'Required for AI processing', tab: 'settings' },
              !me.has_mcp_token    && { done: false, label: 'Connect your Habbo MCP key',  sub: 'Required to deploy teams',    tab: 'settings' },
            ].filter(Boolean)

        const allDone = setupSteps.length === 0

        return (
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="w-full text-left bg-card border border-border rounded-2xl p-6 card-lift cursor-pointer hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center gap-5">
              {me.figure && (
                <div className="flex-shrink-0">
                  <HabboFigure figure={me.figure} size="md" animate={true} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-2xl font-semibold tracking-tight text-foreground truncate">Welcome back, {me.username}</h2>
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
              <Settings className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </div>

            {/* Setup checklist */}
            {!allDone && (
              <div className="mt-4 pt-4 border-t border-border space-y-2" onClick={e => e.stopPropagation()}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Setup required</p>
                {setupSteps.map((step, i) => (
                  <button
                    key={i}
                    onClick={() => onNavigate(step.tab)}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 bg-secondary/50 hover:bg-secondary transition-colors text-left"
                  >
                    <div className="w-5 h-5 rounded-full border-2 border-primary/40 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-primary/60">{i + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{step.label}</p>
                      <p className="text-xs text-muted-foreground">{step.sub}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {allDone && activeTier !== 'basic' && (
              <div className="mt-4 pt-4 border-t border-border" onClick={e => e.stopPropagation()}>
                {teamWarning ? (
                  <button
                    onClick={() => onNavigate('agents')}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 bg-warning/10 border border-warning/20 hover:bg-warning/15 transition-colors text-left"
                  >
                    <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-warning">Team needs attention</p>
                      <p className="text-xs text-warning/70 truncate">
                        <span className="font-medium">"{teamWarning.teamName}"</span> has agents missing a linked bot
                      </p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-warning/60 flex-shrink-0" />
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                    <p className="text-xs text-success font-medium">All set — your agents are ready to deploy.</p>
                  </div>
                )}
              </div>
            )}
          </button>
        )
      })()}

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
          onClick={() => onNavigate('tiers')}
          hint="View all plans →"
        />
        <StatusCard
          label="Hotel"
          value={hotelStatus.loading ? 'Checking…' : hotelStatus.socket_online ? 'Online' : 'Offline'}
          icon={hotelStatus.socket_online ? Wifi : WifiOff}
          valueClassName={hotelStatus.socket_online ? 'text-success' : 'text-muted-foreground'}
          onClick={() => onNavigate('online')}
          hint="View online agents →"
        />
      </div>

      {/* Quick Links */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Links</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {QUICK_LINKS.map(({ label, description, icon: Icon, tab }) => (
            <button
              key={label}
              onClick={() => onNavigate(tab)}
              className="text-left bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all"
            >
              <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center mb-3">
                <Icon className="w-3.5 h-3.5 text-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatusCard({ label, value, icon: Icon, valueClassName = '', onClick, hint }) {
  const isClickable = !!onClick
  return (
    <div
      onClick={onClick}
      className={`border rounded-xl p-5 transition-colors ${
        isClickable
          ? 'bg-card border-border card-lift cursor-pointer hover:border-primary/40'
          : 'bg-muted/30 border-border/40 opacity-60 select-none'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${isClickable ? 'bg-secondary' : 'bg-muted/50'}`}>
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>
      <p className={`text-base sm:text-2xl font-semibold tracking-tight truncate ${isClickable ? 'text-foreground' : 'text-muted-foreground'} ${valueClassName}`}>{value}</p>
      {hint && <p className="text-xs text-primary mt-1">{hint}</p>}
    </div>
  )
}

// ── Tiers Tab ─────────────────────────────────────────────────────────────

const TIER_PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: 'Free',
    description: 'Read-only access to explore the platform.',
    features: [
      { label: 'Browse Marketplace',                 included: true  },
      { label: 'View agent teams (read-only)',        included: true  },
      { label: 'View Bots list',                     included: true  },
      { label: 'Create & deploy agent teams',        included: false },
      { label: 'Custom agent personas',              included: false },
      { label: 'MCP integrations',                   included: false },
      { label: 'Anthropic API key support',          included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'On request',
    description: 'Full access to deploy and manage hotel agents.',
    features: [
      { label: 'Everything in Basic',               included: true  },
      { label: 'Create & deploy agent teams',       included: true  },
      { label: 'Install teams from Marketplace',    included: true  },
      { label: 'Custom agent personas',             included: true  },
      { label: 'MCP integrations',                  included: true  },
      { label: 'Anthropic API key support',         included: true  },
      { label: 'Custom agent logic',                included: false },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    description: 'Tailored solutions for large-scale hotel operations.',
    features: [
      { label: 'Everything in Pro',                 included: true  },
      { label: 'Custom agent logic on request',     included: true  },
      { label: 'Multi-team orchestration',          included: true  },
      { label: 'Dedicated support channel',         included: true  },
      { label: 'White-label options',               included: true  },
      { label: 'Priority onboarding',               included: true  },
    ],
  },
]

function TiersTab({ me, onNavigate }) {
  const activeTier = me?.ai_tier || 'basic'
  const [upgradeRequest, setUpgradeRequest] = useState(null)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  useEffect(() => {
    api('/api/tier-requests/mine')
      .then(d => setUpgradeRequest(d.request || null))
      .catch(() => {})
  }, [])

  const hasPendingRequest = upgradeRequest?.status === 'pending'

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigate('home')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Home
        </button>
        <span className="text-muted-foreground/40 text-sm">/</span>
        <span className="text-sm text-foreground font-medium">Plans & Tiers</span>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Plans & Tiers</h1>
        <p className="text-sm text-muted-foreground mt-1">Compare what's included in each plan.</p>
      </div>

      {hasPendingRequest && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
          <Bell className="w-4 h-4 text-warning shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-warning/80">Upgrade request pending</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your request for <span className="capitalize font-medium">{upgradeRequest.requested_tier}</span> is being reviewed.
            </p>
          </div>
        </div>
      )}

      {showUpgradeModal && (
        <UpgradeRequestModal
          onClose={() => setShowUpgradeModal(false)}
          onSubmitted={(req) => { setUpgradeRequest(req); setShowUpgradeModal(false) }}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TIER_PLANS.map(plan => {
          const tierRank = { basic: 0, pro: 1, enterprise: 2 }
          const isCurrent = activeTier === plan.id
          const isBelow = tierRank[activeTier] > tierRank[plan.id]

          let cta = null
          if (plan.id === 'enterprise') {
            cta = (
              <a
                href="mailto:hello@thepixeloffice.ai"
                className="block text-center text-sm font-medium h-9 px-4 leading-9 rounded-lg border border-border hover:bg-secondary transition-colors"
              >
                Contact us
              </a>
            )
          } else if (isCurrent) {
            cta = (
              <div className="h-9 px-4 flex items-center justify-center rounded-lg bg-secondary text-sm text-muted-foreground">
                Current plan
              </div>
            )
          } else if (isBelow) {
            cta = (
              <div className="h-9 px-4 flex items-center justify-center rounded-lg bg-secondary/50 text-sm text-muted-foreground/60">
                Included in your plan
              </div>
            )
          } else if (hasPendingRequest && upgradeRequest?.requested_tier === plan.id) {
            cta = (
              <div className="h-9 px-4 flex items-center justify-center rounded-lg bg-warning/10 text-sm text-warning/80">
                Request pending
              </div>
            )
          } else {
            cta = (
              <button
                onClick={() => setShowUpgradeModal(true)}
                className="w-full h-9 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Request upgrade
              </button>
            )
          }

          return (
            <div
              key={plan.id}
              className={`bg-card border rounded-2xl p-6 flex flex-col gap-4 ${isCurrent ? 'ring-2 ring-primary border-primary/40' : 'border-border'}`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                  {isCurrent && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary">Current</span>
                  )}
                </div>
                <p className="text-2xl font-bold text-foreground">{plan.price}</p>
                <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
              </div>

              <ul className="space-y-2 flex-1">
                {plan.features.map(f => (
                  <li key={f.label} className="flex items-center gap-2 text-sm">
                    {f.included
                      ? <Check className="w-3.5 h-3.5 text-success flex-shrink-0" />
                      : <Minus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    }
                    <span className={f.included ? 'text-foreground' : 'text-muted-foreground'}>{f.label}</span>
                  </li>
                ))}
              </ul>

              {cta}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Bots Tab ──────────────────────────────────────────────────────────────

function BotsTab({ figureTypes }) {
  const [bots, setBots] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [lastSynced, setLastSynced] = useState(null)
  const [editingBotId, setEditingBotId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [botBusy, setBotBusy] = useState({})
  const [botMsg, setBotMsg] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(null)
  useEscapeKey(() => { if (confirmDelete) { setConfirmDelete(null) } else { cancelEditBot() } }, !!(editingBotId || confirmDelete))
  const [botsMeta, setBotsMeta] = useState(null)

  const fetchBots = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setLoading(true)
    try {
      const d = await api('/api/hotel/bots')
      setBots(d.bots || [])
      setBotsMeta(d.meta || null)
    } catch {
      setBots([])
      setBotsMeta(null)
    }
    finally { if (showLoading) setLoading(false) }
  }, [])

  // Silent sync: keeps the list in sync with the hotel without touching the
  // Sync button UI state. Runs on mount and every 10 s while the page is open.
  const silentSync = useCallback(async ({ showLoading = false } = {}) => {
    try { await api('/api/hotel/bots/sync', { method: 'POST' }) } catch { /* ignore */ }
    await fetchBots({ showLoading })
    setLastSynced(new Date())
  }, [fetchBots])

  useEffect(() => {
    silentSync({ showLoading: true })
    const t = setInterval(silentSync, 10_000)
    return () => clearInterval(t)
  }, [silentSync])

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
      if (d.removed > 0) parts.push(`Removed ${d.removed} stale entr${d.removed !== 1 ? 'ies' : 'y'}`)
      if (d.imported > 0) parts.push(`imported ${d.imported} bot${d.imported !== 1 ? 's' : ''}`)
      if (d.updated > 0) parts.push(`refreshed ${d.updated} appearance${d.updated !== 1 ? 's' : ''}`)
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
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="flex items-center gap-2">
            {syncMsg && <span className="text-xs text-muted-foreground">{syncMsg}</span>}
            <button onClick={syncBots} disabled={syncing}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-secondary transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync bots'}
            </button>
          </div>
          {lastSynced && (
            <span className="text-[10px] text-muted-foreground/50">
              synced {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
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
          <p className="text-sm font-medium text-foreground">No bots imported yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Use <span className="font-medium text-foreground">Sync bots</span> to import bots from your hotel inventory.
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
              statusBadgeClass = 'bg-destructive/10 text-destructive border border-destructive/20'
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
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold">Edit Bot</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Changes to name, motto &amp; appearance apply <span className="text-foreground font-medium">live in the hotel</span> immediately after saving.
                  </p>
                </div>
                <button onClick={cancelEditBot} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors ml-4 flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
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
  useEscapeKey(onClose)

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
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
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
  const { showToast } = useToast()
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState({})
  const [reviewing, setReviewing] = useState(null) // { id, decision }
  const [adminNote, setAdminNote] = useState('')

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
        <button onClick={load} aria-label="Refresh requests" className="text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

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

// Skill-linked integrations (referenced by requires_integration in SKILL.md files)
const CURATED_INTEGRATIONS = [
  {
    slug: 'atlassian',
    name: 'Atlassian',
    title: 'Atlassian (Jira & Confluence)',
    description: 'Connect Jira for sprint planning, issue tracking, and Confluence knowledge bases.',
    icon: '/integrations/atlassian.svg',
    defaultUrl: 'https://mcp.atlassian.com/v1/mcp',
    headers: [{ name: 'Authorization', description: 'Service account API key (Bearer) — ask your Atlassian admin to create one at admin.atlassian.com. Personal API tokens use Basic auth and are not compatible here.', isRequired: true, isSecret: true }],
    docsUrl: 'https://support.atlassian.com/atlassian-rovo-mcp-server/docs/configuring-authentication-via-api-token/',
  },
  {
    slug: 'notion',
    name: 'Notion',
    title: 'Notion',
    description: 'Read and search pages, databases, and structured content in your Notion workspace. Uses a static integration token — no OAuth required.',
    icon: '/integrations/notion.svg',
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    envFields: [{ key: 'NOTION_TOKEN', description: 'Your internal integration token (starts with ntn_) — create one at notion.so/profile/integrations, then share target pages under the Access tab', isRequired: true, isSecret: true }],
    docsUrl: 'https://developers.notion.com/docs/mcp',
  },
  {
    slug: 'resend',
    name: 'Resend',
    title: 'Resend Email',
    description: 'Send transactional emails, manage contacts, domains and broadcasts via Resend\'s official MCP server. Free tier available.',
    icon: 'https://www.google.com/s2/favicons?domain=resend.com&sz=64',
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'resend-mcp'],
    envFields: [{ key: 'RESEND_API_KEY', description: 'Your Resend API key (starts with re_) — sign up free at resend.com', isRequired: true, isSecret: true }],
    docsUrl: 'https://resend.com/docs/mcp-server',
  },
]

// Popular integrations sourced from the official MCP Registry
const POPULAR_INTEGRATIONS = [
  {
    slug: 'airtable',
    name: 'Airtable',
    description: 'Access and manage your Airtable bases, tables, and records.',
    icon: 'https://www.airtable.com/images/favicon/baymax/apple-touch-icon.png',
    defaultUrl: 'https://waystation.ai/mcp',
    headers: [{ name: 'Authorization', description: 'Bearer token from waystation.ai — first connect your Airtable account at waystation.ai/dashboard (one-time OAuth setup), then copy your WayStation API key.', isRequired: true, isSecret: true }],
    docsUrl: 'https://waystation.ai',
  },
  {
    slug: 'gmail',
    name: 'Gmail',
    description: 'Manage Gmail messages, threads, labels, drafts, and send emails.',
    icon: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico',
    defaultUrl: 'https://server.smithery.ai/@faithk7/gmail-mcp/mcp',
    authType: 'oauth',
    oauthNote: 'Gmail requires Google OAuth to access mailbox data — no static API key path exists. Smithery\'s own bearer token is for their registry, not for Gmail access.',
    headers: [{ name: 'Authorization', description: 'Bearer token from smithery.ai — required for Smithery-hosted servers', isRequired: true, isSecret: true }],
    docsUrl: 'https://smithery.ai',
  },
  {
    slug: 'onedrive',
    name: 'OneDrive',
    description: 'Access OneDrive and SharePoint files via Microsoft\'s official MCP server.',
    icon: 'https://www.google.com/s2/favicons?domain=onedrive.live.com&sz=64',
    defaultUrl: 'https://agent365.svc.cloud.microsoft/agents/tenants/{tenant_id}/servers/mcp_ODSPRemoteServer',
    authType: 'oauth',
    oauthNote: 'Microsoft Entra tokens expire in ~1 hour and cannot be used as a static key. OneDrive MCP requires an OAuth flow with token refresh — not compatible with server-side agent runs.',
    headers: [{ name: 'Authorization', description: 'Replace {tenant_id} in the URL with your Azure tenant ID, then use a Microsoft Entra bearer token', isRequired: true, isSecret: true }],
    docsUrl: 'https://learn.microsoft.com/en-us/onedrive/',
  },
  {
    slug: 'supabase',
    name: 'Supabase',
    description: 'Query and manage your Supabase database, auth, and schemas.',
    icon: 'https://supabase.com/favicon/favicon-32x32.png',
    defaultUrl: 'https://waystation.ai/mcp',
    headers: [{ name: 'Authorization', description: 'Bearer token from waystation.ai — first connect your Supabase project at waystation.ai/dashboard (one-time OAuth setup), then copy your WayStation API key.', isRequired: true, isSecret: true }],
    docsUrl: 'https://supabase.com/docs',
  },
  {
    slug: 'lucid',
    name: 'Lucidchart',
    description: 'Create diagrams, search and share Lucidchart documents from your agents.',
    icon: 'https://corporate-assets.lucid.co/co/cab2c5c2-21ed-4272-8606-4ce6e117da17.png',
    defaultUrl: 'https://mcp.lucid.app/mcp',
    authType: 'oauth',
    oauthNote: 'mcp.lucid.app uses OAuth 2.1 with Dynamic Client Registration — static API keys only work with the self-hosted lucid-mcp-server npm package, not this endpoint.',
    headers: [{ name: 'Authorization', description: 'Bearer token from your Lucid developer settings', isRequired: true, isSecret: true }],
    docsUrl: 'https://developer.lucid.co/',
  },
  {
    slug: 'linear',
    name: 'Linear',
    description: 'Project management and issue tracking via Linear\'s official MCP server.',
    icon: 'https://linear.app/favicon.ico',
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@linear/mcp-server'],
    envFields: [{ key: 'LINEAR_API_KEY', description: 'Your personal API key — linear.app → Settings → API → Personal API keys (starts with lin_api_)', isRequired: true, isSecret: true }],
    docsUrl: 'https://developers.linear.app/docs',
  },
  {
    slug: 'telegram',
    name: 'Telegram',
    description: 'Send messages, manage groups, and post to Telegram channels via a bot. Create a bot with @BotFather to get a static token — no OAuth required.',
    icon: 'https://telegram.org/img/apple-touch-icon.png',
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'telegram-bot-mcp-server'],
    envFields: [{ key: 'TELEGRAM_BOT_API_TOKEN', description: 'Your bot token from @BotFather — message @BotFather on Telegram, send /newbot, and copy the token (format: 123456:ABCdef…)', isRequired: true, isSecret: true }],
    docsUrl: 'https://core.telegram.org/bots',
  },
  {
    slug: 'prince',
    name: 'Prince Cloud',
    description: 'Convert Markdown, HTML, and web pages to high-quality PDF documents.',
    icon: 'https://www.google.com/s2/favicons?domain=prince.cloud&sz=64',
    defaultUrl: 'https://prince.cloud/mcp',
    headers: [{ name: 'Authorization', description: 'Bearer token — get your API key after signing up at prince.cloud', isRequired: true, isSecret: true }],
    docsUrl: 'https://prince.cloud',
  },
  {
    slug: 'crabbitmq',
    name: 'CrabbitMQ',
    description: 'Async message queue for AI agents. Self-provision queues, push/poll messages.',
    icon: '',
    defaultUrl: 'https://crabbitmq.com/mcp',
    headers: [],
    docsUrl: 'https://crabbitmq.com',
  },
  {
    slug: 'mailjunky',
    name: 'MailJunky',
    description: 'Send and manage emails via the MailJunky API using Bearer token auth.',
    icon: 'https://mailjunky.ai/favicon.ico',
    defaultUrl: 'https://mcp.mailjunky.ai/sse',
    headers: [{ name: 'Authorization', description: 'Your MailJunky API key in Bearer format (e.g. Bearer mj_live_xxx) — get one at mailjunky.ai', isRequired: true, isSecret: true }],
    docsUrl: 'https://mailjunky.ai',
  },
  {
    slug: 'trends-mcp',
    name: 'Trends MCP',
    description: 'Live trend data from 12+ sources: Google, YouTube, TikTok, Reddit, Amazon, Wikipedia, news sentiment, and more.',
    icon: 'https://www.google.com/s2/favicons?domain=trendsmcp.com&sz=64',
    defaultUrl: 'https://api.trendsmcp.com/mcp',
    headers: [{ name: 'Authorization', description: 'Your Trends MCP API key — free tier included (100 req/day), get one at trendsmcp.com', isRequired: true, isSecret: true }],
    docsUrl: 'https://trendsmcp.com',
  },
  {
    slug: 'unulu',
    name: 'Unulu',
    description: 'AI-powered link-in-bio site builder. Create, update, and publish sites instantly via MCP — no auth needed.',
    icon: 'https://www.google.com/s2/favicons?domain=unulu.ai&sz=64',
    defaultUrl: 'https://mcp.unulu.ai',
    headers: [],
    docsUrl: 'https://unulu.ai',
  },
  {
    slug: 'slack',
    name: 'Slack',
    description: 'Send messages, manage channels, search conversations, and interact with Slack workspaces.',
    icon: 'https://a.slack-edge.com/80588/marketing/img/meta/favicon-32.png',
    defaultUrl: '',
    headers: [{ name: 'Authorization', description: 'Slack Bot Token (starts with xoxb-) — create a Slack app at api.slack.com and install it to your workspace', isRequired: true, isSecret: true }],
    docsUrl: 'https://api.slack.com/docs/mcp',
  },
  {
    slug: 'agentictotem',
    name: 'AgenticTotem Web Extractor',
    description: 'Send URLs + a JSON schema and get clean structured data back. Pay-per-use via x402/MPP — no API keys required.',
    icon: 'https://www.google.com/s2/favicons?domain=agentictotem.com&sz=64',
    defaultUrl: 'https://agentictotem.com/mcp',
    headers: [],
    docsUrl: 'https://agentictotem.com',
  },
]

const ALL_CURATED = [...CURATED_INTEGRATIONS, ...POPULAR_INTEGRATIONS]

function IntegrationsTab({ me, hotelStatus, onHotelToggle, figureTypes }) {
  const { showToast } = useToast()
  const { habboConnected } = useHotel()
  const [hotelToggleBusy, setHotelToggleBusy] = useState(false)
  const [myIntegrations, setMyIntegrations] = useState([])
  const [loadingMy, setLoadingMy] = useState(true)
  const [setupTarget, setSetupTarget] = useState(null)
  const [pingStatus, setPingStatus] = useState({})
  const [integrationTools, setIntegrationTools] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [busy, setBusy] = useState(false)

  const [registryServers, setRegistryServers] = useState([])
  const [registryLoading, setRegistryLoading] = useState(false)
  const [registryNextCursor, setRegistryNextCursor] = useState(null)
  const [registryQuery, setRegistryQuery] = useState('')
  const [registryFetched, setRegistryFetched] = useState(false)

  useEscapeKey(() => {
    if (confirmDelete) setConfirmDelete(null)
    else if (setupTarget) setSetupTarget(null)
  }, !!(confirmDelete || setupTarget))

  const loadMy = useCallback(async () => {
    setLoadingMy(true)
    try {
      const data = await api('/api/my/integrations')
      setMyIntegrations(data.integrations || [])
    } catch (err) { showToast(err.message, 'error') }
    finally { setLoadingMy(false) }
  }, [showToast])

  useEffect(() => { loadMy() }, [loadMy])

  async function loadRegistry(cursor = null) {
    setRegistryLoading(true)
    try {
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=60` : '?limit=60'
      const data = await api(`/api/registry/servers${qs}`)
      const servers = (data.servers || []).map(s => s.server ?? s)
      setRegistryServers(prev => cursor ? [...prev, ...servers] : servers)
      setRegistryNextCursor(data.metadata?.nextCursor || null)
      setRegistryFetched(true)
    } catch (err) { showToast('Registry unavailable: ' + err.message, 'error') }
    finally { setRegistryLoading(false) }
  }

  function findCuratedMatch(integration) {
    const n = integration.name.toLowerCase()
    return ALL_CURATED.find(c => n.includes(c.slug) || c.slug.includes(n.split(/\s/)[0])) || null
  }

  function getCuratedStatus(curated) {
    return myIntegrations.find(i => {
      const n = i.name.toLowerCase()
      return n.includes(curated.slug) || curated.slug.includes(n.split(/\s/)[0])
    }) || null
  }

  function openCuratedSetup(curated, existingIntegration = null) {
    setSetupTarget({
      name: existingIntegration?.name ?? curated.name,
      title: curated.title,
      icon: curated.icon,
      defaultUrl: existingIntegration?.url ?? curated.defaultUrl,
      headers: curated.headers,
      docsUrl: curated.docsUrl,
      existingId: existingIntegration?.id ?? null,
      type: curated.type,
      command: curated.command,
      args: curated.args,
      envFields: curated.envFields,
    })
  }

  function openRegistrySetup(server) {
    const remote = server.remotes?.[0]
    const stdioPackage = server.packages?.find(p => p.transport?.type === 'stdio')
    const commonFields = {
      name: server.title || server.name?.split('/').pop() || server.name,
      title: server.title || server.name,
      icon: server.icons?.[0]?.src ?? null,
      docsUrl: server.websiteUrl ?? null,
      existingId: null,
    }

    if (!remote && stdioPackage) {
      const cmd = stdioPackage.runtimeHint
        ?? (stdioPackage.registryType === 'npm' ? 'npx'
          : stdioPackage.registryType === 'pypi' ? 'uvx'
          : null)
      const args = cmd === 'npx'
        ? ['-y', stdioPackage.identifier]
        : stdioPackage.identifier ? [stdioPackage.identifier] : []
      setSetupTarget({
        ...commonFields,
        type: 'stdio',
        command: cmd,
        args,
        envFields: (stdioPackage.environmentVariables ?? []).map(ev => ({
          key: ev.name,
          description: ev.description ?? '',
          isRequired: !!ev.isRequired,
          isSecret: !!ev.isSecret,
        })),
      })
      return
    }

    setSetupTarget({
      ...commonFields,
      defaultUrl: remote?.url ?? '',
      headers: remote?.headers ?? [],
    })
  }

  function openEditSetup(integration) {
    const curated = findCuratedMatch(integration)
    if (curated) { openCuratedSetup(curated, integration); return }
    if (integration.type === 'stdio') {
      setSetupTarget({
        name: integration.name, title: integration.name,
        icon: null, docsUrl: null, existingId: integration.id,
        type: 'stdio',
        command: integration.command ?? null,
        args: integration.args ?? [],
        envFields: [],
      })
      return
    }
    setSetupTarget({
      name: integration.name, title: integration.name,
      icon: null, defaultUrl: integration.url,
      headers: [], docsUrl: null, existingId: integration.id,
    })
  }

  async function pingIntegration(id) {
    setPingStatus(s => ({ ...s, [id]: 'checking' }))
    try {
      const data = await api(`/api/my/integrations/${id}/test`, { method: 'POST' })
      if (data.authenticated) {
        setPingStatus(s => ({ ...s, [id]: 'online' }))
        if (data.tools?.length) setIntegrationTools(s => ({ ...s, [id]: data.tools }))
      } else {
        setPingStatus(s => ({ ...s, [id]: data.online ? 'auth_fail' : 'offline' }))
      }
    } catch { setPingStatus(s => ({ ...s, [id]: 'offline' })) }
  }

  async function handleDelete(id) {
    if (confirmDelete !== id) { setConfirmDelete(id); return }
    setConfirmDelete(null)
    setBusy(true)
    try {
      await api(`/api/my/integrations/${id}`, { method: 'DELETE' })
      setMyIntegrations(prev => prev.filter(i => i.id !== id))
      showToast('Integration removed.')
    } catch (err) { showToast(err.message, 'error') }
    finally { setBusy(false) }
  }

  const deduped = useMemo(() => {
    const q = registryQuery.trim().toLowerCase()
    if (!q) return registryServers
    return registryServers.filter(s => {
      const name = (s.name || '').toLowerCase()
      const title = (s.title || '').toLowerCase()
      const desc = (s.description || '').toLowerCase()
      return name.includes(q) || title.includes(q) || desc.includes(q)
    })
  }, [registryServers, registryQuery])

  async function toggleHotelIntegration() {
    setHotelToggleBusy(true)
    try {
      await api('/api/my/hotel-enabled', { method: 'PATCH', body: JSON.stringify({ hotel_enabled: !habboConnected }) })
      onHotelToggle?.()
    } catch (err) { showToast(err.message, 'error') }
    finally { setHotelToggleBusy(false) }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
      <div>
        <h2 className="font-semibold text-foreground">Integrations</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Connect tools and services. Configured integrations are injected into your agent runs automatically.
        </p>
      </div>

      {/* Habbo Hotel integration card */}
      <section className="space-y-3">
        <IntSectionHeading icon={Hotel} label="Virtual Office" />
        <div className={`bg-card border rounded-xl p-4 transition-colors ${habboConnected ? 'border-primary/20' : 'border-border'}`}>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Hotel className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-foreground">Habbo Hotel</p>
                {habboConnected && (
                  <span className="flex items-center gap-1 text-[10px] text-success font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-success" />
                    {hotelStatus?.loading ? 'Connecting…' : hotelStatus?.socket_online ? 'Online' : 'Offline'}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {habboConnected
                  ? 'Your agents have Habbo avatars and operate in virtual hotel rooms.'
                  : 'Give your agents a physical presence — they get Habbo avatars and live in virtual hotel rooms.'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {habboConnected && hotelStatus?.socket_online && (
                <button
                  onClick={async () => {
                    try {
                      const data = await api('/api/hotel/join', { method: 'POST' })
                      window.open(data.login_url, '_blank')
                    } catch (err) { showToast(err.message, 'error') }
                  }}
                  className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-border rounded-lg hover:bg-secondary transition-colors"
                >
                  <Hotel className="w-3 h-3" />
                  Join Hotel
                </button>
              )}
              <button
                onClick={toggleHotelIntegration}
                disabled={hotelToggleBusy}
                className={`h-8 px-3 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                  habboConnected
                    ? 'border border-border text-muted-foreground hover:bg-secondary'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {hotelToggleBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : habboConnected ? 'Disable' : 'Enable virtual office'}
              </button>
            </div>
          </div>

          {/* Bots section — shown when hotel is connected */}
          {habboConnected && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <BotsTab figureTypes={figureTypes ?? FALLBACK_FIGURE_TYPES} compact />
            </div>
          )}
        </div>
      </section>

      {/* My Configured Integrations */}
      {!loadingMy && myIntegrations.length > 0 && (
        <section className="space-y-3">
          <IntSectionHeading icon={CheckCircle} label="Configured" />
          <div className="space-y-2">
            {myIntegrations.map(integration => {
              const ping = pingStatus[integration.id]
              const tools = integrationTools[integration.id] ?? []
              const curated = findCuratedMatch(integration)
              const isStdioInt = integration.type === 'stdio'
              const borderColor = isStdioInt ? 'border-success/20'
                : ping === 'auth_fail' ? 'border-amber-500/30'
                : ping === 'offline' ? 'border-destructive/20'
                : 'border-success/20'
              return (
                <div key={integration.id} className={`bg-card border rounded-xl p-3 transition-colors ${borderColor}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-secondary flex items-center justify-center overflow-hidden">
                      {curated
                        ? <img src={curated.icon} alt={curated.name} className="w-5 h-5 object-contain" onError={e => { e.currentTarget.style.display = 'none' }} />
                        : <Network className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{integration.name}</p>
                      {isStdioInt
                        ? <p className="text-xs text-muted-foreground">Local process (stdio)</p>
                        : <p className="text-xs text-muted-foreground truncate">{integration.url}</p>}
                    </div>
                    {isStdioInt && (
                      <span className="flex items-center gap-1 text-[10px] text-success font-medium flex-shrink-0">
                        <Terminal className="w-3 h-3" /> Configured
                      </span>
                    )}
                    {!isStdioInt && ping !== 'checking' && ping !== 'auth_fail' && ping !== 'offline' && (
                      <span className="flex items-center gap-1 text-[10px] text-success font-medium flex-shrink-0">
                        <Check className="w-3 h-3" /> {ping === 'online' ? 'Verified' : 'Saved'}
                      </span>
                    )}
                    {!isStdioInt && ping === 'auth_fail' && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-500 font-medium flex-shrink-0">
                        <Lock className="w-3 h-3" /> Auth failed
                      </span>
                    )}
                    {!isStdioInt && ping === 'offline' && (
                      <span className="flex items-center gap-1 text-[10px] text-destructive font-medium flex-shrink-0">
                        <WifiOff className="w-3 h-3" /> Offline
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!isStdioInt && (
                        <button onClick={() => pingIntegration(integration.id)} disabled={ping === 'checking'}
                          title="Test connection"
                          className="h-7 w-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40">
                          {ping === 'checking'
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : ping === 'online' ? <Wifi className="w-3.5 h-3.5 text-success" />
                            : ping === 'auth_fail' ? <Lock className="w-3.5 h-3.5 text-amber-500" />
                            : ping === 'offline' ? <WifiOff className="w-3.5 h-3.5 text-destructive" />
                            : <Wifi className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button onClick={() => openEditSetup(integration)} title="Edit"
                        className="h-7 w-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(integration.id)} disabled={busy}
                        title={confirmDelete === integration.id ? 'Click again to confirm' : 'Remove'}
                        className={`h-7 px-2 text-xs rounded-md border transition-colors disabled:opacity-40 flex items-center gap-1 ${
                          confirmDelete === integration.id
                            ? 'border-destructive bg-destructive text-white'
                            : 'border-destructive/30 text-destructive hover:bg-destructive/10'
                        }`}>
                        {confirmDelete === integration.id ? 'Sure?' : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  {tools.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-1">
                      {tools.map(t => (
                        <span key={t.name} title={t.description}
                          className="inline-flex items-center gap-1 text-[10px] bg-secondary text-muted-foreground rounded px-1.5 py-0.5 font-mono">
                          <Wrench className="w-2.5 h-2.5 flex-shrink-0" />{t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Skill-linked integrations */}
      <section className="space-y-3">
        <IntSectionHeading icon={Sparkles} label="Required by skills" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {CURATED_INTEGRATIONS.map(curated => {
            const configured = getCuratedStatus(curated)
            return (
              <CuratedIntCard key={curated.slug} curated={curated} configured={configured}
                onSetup={() => openCuratedSetup(curated, configured ?? undefined)} />
            )
          })}
        </div>
      </section>

      {/* Popular integrations */}
      <section className="space-y-3">
        <IntSectionHeading icon={LayoutGrid} label="Popular" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {POPULAR_INTEGRATIONS.map(curated => {
            const configured = getCuratedStatus(curated)
            return (
              <CuratedIntCard key={curated.slug} curated={curated} configured={configured}
                onSetup={() => openCuratedSetup(curated, configured ?? undefined)} />
            )
          })}
        </div>
      </section>

      {/* Browse MCP Registry */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <IntSectionHeading icon={LayoutGrid} label="Browse MCP Registry" />
          {registryFetched && registryServers.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{registryServers.length} servers loaded</span>
          )}
        </div>

        {/* Search — always visible since approved cards are always shown */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input type="text" placeholder="Search servers…" value={registryQuery}
            onChange={e => setRegistryQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        {/* Unified grid — approved cards always pinned first, registry streams in below */}
        {(() => {
          const q = registryQuery.trim().toLowerCase()
          const approvedVisible = ALL_CURATED.filter(c =>
            !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.slug.includes(q)
          )
          const registryVisible = deduped // already filtered by registryQuery via useMemo
          const hasResults = approvedVisible.length > 0 || registryVisible.length > 0

          return hasResults ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {approvedVisible.map(curated => {
                const configured = getCuratedStatus(curated)
                return (
                  <RegistryIntCard
                    key={`approved-${curated.slug}`}
                    server={{
                      name: curated.slug,
                      title: curated.name,
                      description: curated.description,
                      icons: curated.icon ? [{ src: curated.icon }] : [],
                      websiteUrl: curated.docsUrl,
                    }}
                    approved
                    configured={!!configured}
                    onAdd={() => openCuratedSetup(curated, configured ?? undefined)}
                  />
                )
              })}

              {registryFetched && registryVisible.map(server => (
                <RegistryIntCard key={server.name} server={server} onAdd={() => openRegistrySetup(server)} />
              ))}

              {registryFetched && registryNextCursor && !q && (
                <RegistryScrollSentinel loading={registryLoading} onVisible={() => loadRegistry(registryNextCursor)} />
              )}
            </div>
          ) : (
            <p className="text-center py-8 text-sm text-muted-foreground">No matching servers.</p>
          )
        })()}

        {/* Load full registry CTA */}
        {!registryFetched && !registryLoading && (
          <button onClick={() => loadRegistry()}
            className="w-full flex items-center justify-center gap-2 h-9 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Browse 800+ more servers from the official MCP Registry
          </button>
        )}
        {registryLoading && !registryFetched && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </section>

      {/* Setup modal */}
      {setupTarget && (
        <IntegrationSetupModal target={setupTarget} onClose={() => setSetupTarget(null)}
          onSaved={() => { setSetupTarget(null); loadMy() }} />
      )}
    </div>
  )
}

function RegistryScrollSentinel({ loading, onVisible }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !loading) onVisible() },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loading, onVisible])

  return (
    <div ref={ref} className="col-span-full flex justify-center py-4">
      {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
    </div>
  )
}

function IntSectionHeading({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="w-3.5 h-3.5 opacity-70" />
      {label}
    </div>
  )
}

function CuratedIntCard({ curated, configured, onSetup }) {
  const [imgError, setImgError] = useState(false)
  const isOAuth = curated.authType === 'oauth'
  return (
    <div className={`relative bg-card border rounded-xl p-4 flex flex-col gap-3 transition-colors ${isOAuth ? 'border-amber-500/20' : configured ? 'border-success/30' : 'border-border'}`}>
      {configured && !isOAuth && (
        <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] text-success font-medium">
          <Check className="w-3 h-3" /> Connected
        </span>
      )}
      {configured && isOAuth && (
        <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] text-amber-500 font-medium">
          <Lock className="w-3 h-3" /> Saved, not working
        </span>
      )}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
          {curated.icon && !imgError
            ? <img src={curated.icon} alt={curated.name} className="w-6 h-6 object-contain" onError={() => setImgError(true)} />
            : <span className="text-sm font-bold text-muted-foreground">{curated.name[0]?.toUpperCase() ?? '?'}</span>}
        </div>
        <p className="text-sm font-semibold text-foreground leading-tight">{curated.name}</p>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed flex-1">{curated.description}</p>
      {isOAuth && (
        <div className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-2">
          <Lock className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">{curated.oauthNote}</p>
        </div>
      )}
      {!isOAuth && curated.docsUrl && (
        <a href={curated.docsUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors"
          onClick={e => e.stopPropagation()}>
          <ExternalLink className="w-3 h-3" /> Docs
        </a>
      )}
      {isOAuth ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-amber-500/70 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Not available for automated agents
          </span>
          {curated.docsUrl && (
            <a href={curated.docsUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors flex-shrink-0"
              onClick={e => e.stopPropagation()}>
              <ExternalLink className="w-3 h-3" /> Docs
            </a>
          )}
        </div>
      ) : (
        <button onClick={onSetup}
          className={`w-full h-8 rounded-md text-xs font-medium transition-colors ${
            configured ? 'border border-border text-muted-foreground hover:bg-secondary' : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}>
          {configured ? 'Edit' : 'Connect'}
        </button>
      )}
    </div>
  )
}

function RegistryIntCard({ server, onAdd, approved = false, configured = false }) {
  const [imgError, setImgError] = useState(false)
  const icon = server.icons?.[0]?.src
  const title = server.title || server.name?.split('/').pop() || server.name
  const desc = server.description || ''
  const isStdioOnly = !server.remotes?.length && server.packages?.some(p => p.transport?.type === 'stdio')
  let hostname = null
  try { if (server.websiteUrl) hostname = new URL(server.websiteUrl).hostname } catch {}

  return (
    <div className={`relative bg-card border rounded-xl p-3 flex flex-col gap-2 ${approved ? 'border-primary/20' : 'border-border'}`}>
      {approved && (
        <span className="absolute top-2 right-2 flex items-center gap-0.5 text-[9px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5 leading-none">
          ★ verified
        </span>
      )}
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0 mt-0.5">
          {icon && !imgError
            ? <img src={icon} alt={title} className="w-5 h-5 object-contain" onError={() => setImgError(true)} />
            : <span className="text-xs font-bold text-muted-foreground">{title[0]?.toUpperCase() ?? '?'}</span>}
        </div>
        <div className="flex-1 min-w-0 pr-16">
          <p className="text-xs font-semibold text-foreground leading-tight truncate">{title}</p>
          {isStdioOnly ? (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
              <Terminal className="w-2.5 h-2.5" /> stdio
            </span>
          ) : hostname && (
            <a href={server.websiteUrl} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground hover:text-primary truncate block"
              onClick={e => e.stopPropagation()}>
              {hostname}
            </a>
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 flex-1">{desc}</p>
      <button onClick={onAdd}
        className={`w-full h-7 rounded-md text-xs font-medium transition-colors ${
          configured
            ? 'border border-success/30 text-success hover:bg-success/10'
            : approved
              ? 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20'
              : 'border border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
        }`}>
        {configured ? '✓ Configured' : 'Add'}
      </button>
    </div>
  )
}

function IntegrationSetupModal({ target, onClose, onSaved }) {
  const { showToast } = useToast()
  const isStdio = target.type === 'stdio'
  const [form, setForm] = useState({ name: target.name || '', url: target.defaultUrl || '', api_key: '' })
  const [envForm, setEnvForm] = useState(
    (target.envFields ?? []).reduce((acc, f) => ({ ...acc, [f.key]: '' }), {})
  )
  const [busy, setBusy] = useState(false)
  const [testResult, setTestResult] = useState(null)
  useEscapeKey(onClose)

  const header = target.headers?.[0] ?? null

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setTestResult(null)
    try {
      let integrationId = target.existingId

      if (isStdio) {
        // Build stdio_config from command/args/env — only include non-empty env values
        const env = Object.fromEntries(
          Object.entries(envForm).filter(([, v]) => v.trim() !== '')
        )
        const stdio_config = { command: target.command, args: target.args, env }
        const payload = { name: form.name, stdio_config }
        if (target.existingId) {
          await api(`/api/my/integrations/${target.existingId}`, { method: 'PUT', body: JSON.stringify(payload) })
        } else {
          const data = await api('/api/my/integrations', { method: 'POST', body: JSON.stringify(payload) })
          integrationId = data.integration?.id
        }
        showToast(`${target.name} configured.`)
        setTestResult({ online: true, authenticated: true, tools: [], stdio: true })
        onSaved()
        return
      }

      // HTTP integration (existing path)
      if (target.existingId) {
        await api(`/api/my/integrations/${target.existingId}`, { method: 'PUT', body: JSON.stringify(form) })
      } else {
        const data = await api('/api/my/integrations', { method: 'POST', body: JSON.stringify(form) })
        integrationId = data.integration?.id
      }

      if (integrationId) {
        try {
          const result = await api(`/api/my/integrations/${integrationId}/test`, { method: 'POST' })
          setTestResult(result)
          if (result.authenticated) {
            showToast(result.tools?.length ? `Connected — ${result.tools.length} tools found` : 'Connected successfully.')
          } else {
            showToast(result.error || 'Saved, but authentication test failed.', 'error')
          }
        } catch {
          showToast(target.existingId ? 'Integration updated.' : 'Integration connected.')
        }
      }
      onSaved()
    } catch (err) { showToast(err.message, 'error') }
    finally { setBusy(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
              {target.icon
                ? <img src={target.icon} alt={target.name} className="w-7 h-7 object-contain" onError={e => { e.currentTarget.style.display = 'none' }} />
                : <Network className="w-5 h-5 text-muted-foreground" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {target.existingId ? 'Edit' : 'Connect'} {target.name}
              </h2>
              {target.title && target.title !== target.name && (
                <p className="text-xs text-muted-foreground">{target.title}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors ml-4 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Name</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>

          {isStdio ? (
            <>
              <div className="flex items-start gap-1.5 rounded-lg bg-secondary px-2.5 py-2">
                <Terminal className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Runs as a local process: <code className="font-mono">{[target.command, ...(target.args ?? [])].filter(Boolean).join(' ')}</code>
                </p>
              </div>
              {(target.envFields ?? []).map(field => (
                <div key={field.key} className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground flex items-center gap-1">
                    {field.label}
                    {field.isRequired && <span className="text-destructive">*</span>}
                  </label>
                  {field.description && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{field.description}</p>
                  )}
                  <input
                    type={field.isSecret ? 'password' : 'text'}
                    required={field.isRequired && !target.existingId}
                    placeholder={target.existingId && field.isSecret ? '••••••• (leave blank to keep current)' : field.key}
                    value={envForm[field.key] ?? ''}
                    onChange={e => setEnvForm(f => ({ ...f, [field.key]: e.target.value }))}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Server URL</label>
                <input required type="url" placeholder="https://mcp.example.com" value={form.url}
                  onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground flex items-center gap-1">
                  {header ? header.name : 'API Key'}
                  {header?.isRequired && <span className="text-destructive">*</span>}
                  {header && !header.isRequired && <span className="text-muted-foreground font-normal">(optional)</span>}
                </label>
                {header?.description && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{header.description}</p>
                )}
                <input type="password"
                  placeholder={target.existingId ? '••••••• (leave blank to keep current)' : (header?.name ?? 'API key or bearer token')}
                  value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </>
          )}

          {target.docsUrl && (
            <a href={target.docsUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
              <ExternalLink className="w-3 h-3" /> Setup guide & docs
            </a>
          )}

          {testResult && (
            <div className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${
              testResult.authenticated
                ? 'bg-success/10 border-success/20'
                : 'bg-amber-500/10 border-amber-500/20'
            }`}>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${testResult.authenticated ? 'text-success' : 'text-amber-600 dark:text-amber-400'}`}>
                {testResult.stdio
                  ? <><Terminal className="w-3.5 h-3.5" /> Saved — runs as local process on the server</>
                  : testResult.authenticated
                  ? <><Check className="w-3.5 h-3.5" /> Connection verified</>
                  : <><Lock className="w-3.5 h-3.5" /> Authentication failed</>}
              </div>
              {testResult.error && !testResult.authenticated && !testResult.stdio && (
                <p className="text-[11px] text-muted-foreground">{testResult.error}</p>
              )}
              {testResult.authenticated && !testResult.stdio && testResult.tools?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {testResult.tools.map(t => (
                    <span key={t.name} title={t.description}
                      className="inline-flex items-center gap-1 text-[10px] bg-secondary text-muted-foreground rounded px-1.5 py-0.5 font-mono">
                      <Wrench className="w-2.5 h-2.5 flex-shrink-0" />{t.name}
                    </span>
                  ))}
                </div>
              )}
              {testResult.authenticated && !testResult.stdio && !testResult.tools?.length && (
                <p className="text-[11px] text-muted-foreground">No tools discovered (SSE transport or empty list).</p>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 rounded-lg border border-border text-sm hover:bg-secondary transition-colors">
              {testResult ? 'Close' : 'Cancel'}
            </button>
            <button type="submit" disabled={busy}
              className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy ? 'Testing…' : target.existingId ? 'Save changes' : 'Connect'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
