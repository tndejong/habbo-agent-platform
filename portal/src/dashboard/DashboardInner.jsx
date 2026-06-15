import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams, useOutletContext } from 'react-router-dom'
import { Provider as TooltipProvider } from '@radix-ui/react-tooltip'
import {
  Bot, ChevronDown, ChevronLeft, ChevronRight, ClipboardList,
  Home, Hotel, Loader2, LogOut, MessageSquarePlus, Moon,
  Settings, Square, Sun, Wifi, WifiOff, Wrench,
} from 'lucide-react'
import { api } from '../utils/api'
import { useTheme } from '../ThemeContext'
import { useHotel } from '../HotelContext'
import { can } from '../utils/permissions'
import { HabboFigure } from '../components/HabboFigure'
import { AgentDashboard, OnlineView } from '../components/AgentDashboard'
import { SettingsView } from '../components/settings/SettingsView'
import { FeedbackWidget, FeedbackView } from '../components/FeedbackWidget'
import { BotsTab } from '../tabs/BotsTab'
import { UpgradeRequestsTab } from '../tabs/UpgradeRequests'
import { DevToolsView } from '../tabs/DevToolsView'
import { HomeTab } from '../tabs/HomeTab'
import { TiersTab } from '../tabs/TiersTab'
import { UiBuildFooter } from '../UiBuildFooter'

const DASHBOARD_TAB_IDS = new Set([
  'home', 'agents', 'settings', 'requests',
  'tiers', 'online', 'devtools', 'feedback',
])

function resolveDashboardTab(tab, me) {
  if (!tab || !DASHBOARD_TAB_IDS.has(tab)) return 'home'
  if (tab === 'requests' && !can(me, 'admin.requests')) return 'home'
  if (tab === 'devtools' && !can(me, 'devtools.access')) return 'home'
  if (tab === 'feedback' && !can(me, 'admin.feedback')) return 'home'
  return tab
}

export { resolveDashboardTab }

const FALLBACK_FIGURE_TYPES = {
  'default-m':  { gender: 'M', figure: 'hd-180-1.ch-210-66.lg-270-110.sh-300-91' },
  'citizen-m':  { gender: 'M', figure: 'hd-180-1.ch-210-66.lg-270-110.sh-300-91.ha-1012-110.hr-828-61' },
  'agent-m':    { gender: 'M', figure: 'hd-3095-12.ch-255-64.lg-3235-96.sh-295-91.ha-3426-110.hr-3531-61.he-1601-0.ea-3169-0.fa-1211-1408.cp-3310-0.cc-3007-0.ca-1809-0.wa-2007-0' },
  'default-f':  { gender: 'F', figure: 'hd-620-1.ch-680-66.lg-715-110.sh-905-91' },
  'citizen-f':  { gender: 'F', figure: 'hd-620-1.ch-680-66.lg-715-110.sh-905-91.ha-1012-110.hr-828-61' },
  'agent-f':    { gender: 'F', figure: 'hd-620-12.ch-3005-64.lg-3006-96.sh-905-91.ha-3426-110.hr-3531-61.he-1601-0.ea-3169-0' },
}

export function DashboardInner() {
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
    { id: 'home', label: 'Dashboard', icon: Home },
    { id: 'agents', label: 'My Agents', icon: Bot },
    { id: 'online', label: 'Active Bots', icon: Hotel },
    { id: 'settings', label: 'Settings', icon: Settings },
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
                        className="absolute top-0.5 bottom-0.5 w-1/2 rounded-md bg-background border border-border shadow-sm transition-all duration-200 ease-in-out"
                        style={{ left: theme === 'light' ? '0.125rem' : 'calc(50% + 0.125rem)' }}
                      />
                      {[
                        { id: 'light', icon: Sun,   label: 'Light' },
                        { id: 'dark',  icon: Moon,  label: 'Dark'  },
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
          {activeTab === 'settings' && (
            <SettingsView me={me} onTokenChange={handleTokenChange} onKeyUpdated={refreshMe} />
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
