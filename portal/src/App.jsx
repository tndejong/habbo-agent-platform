import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Routes, Route, Navigate, Outlet, useNavigate, useParams, useOutletContext } from 'react-router-dom'
import { useEscapeKey } from './utils/useEscapeKey'
import { createPortal } from 'react-dom'
import { Provider as TooltipProvider } from '@radix-ui/react-tooltip'
import { HabboFigure } from './components/HabboFigure'
import { AgentDashboard, SettingsView, LogPanel, OnlineView } from './components/AgentDashboard'
import VoiceChat from './components/VoiceChat'
import { ReportsView } from './components/ReportsView'
import { FeedbackWidget, FeedbackView } from './components/FeedbackWidget'
import { MarketplaceView } from './components/MarketplaceView'
import { useTheme } from './ThemeContext'
import { HotelProvider, useHotel } from './HotelContext'
import { api } from './utils/api'
import { AuthPage } from './auth/AuthPage'
import { BotsTab } from './tabs/BotsTab'
import { UpgradeRequestModal, UpgradeRequestsTab } from './tabs/UpgradeRequests'
import { IntegrationsTab } from './tabs/IntegrationsTab'
import { useToast } from './ToastContext'
import { can } from './utils/permissions'
import {
  Home, Bot, Key, Users, LogOut, Hotel, ShoppingBag,
  Eye, EyeOff, Loader2, AlertCircle, AlertTriangle, CheckCircle,
  Wifi, WifiOff, Copy, Check, Trash2, RefreshCw,
  Edit, Settings, Square, ArrowUpCircle, Bell,
  ClipboardList, X, Sun, Moon, Network, Plus,
  Terminal, ChevronDown, ChevronLeft, ChevronRight, Wrench, PanelLeft, MessageSquarePlus, Minus, Waves,
  Search, Sparkles, LayoutGrid, ExternalLink, Lock, Download, FileText, Mic,
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
  'settings', 'tiers', 'online', 'devtools', 'feedback', 'chat',
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
        element={me ? <Navigate to="/app/home" replace /> : <AuthPage onLogin={setMe} UiBuildFooter={UiBuildFooter} />}
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
    { id: 'chat', label: 'Voice Chat', icon: Mic },
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
          {activeTab === 'chat' && (
            <VoiceChat me={me} />
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

