import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate, useParams, useOutletContext } from 'react-router-dom'
import { Provider as TooltipProvider } from '@radix-ui/react-tooltip'
import {
  Bot, ChevronLeft, ChevronRight, FileText, Hotel, LayoutGrid,
  LogOut, Mic, Moon, Network, Settings, Sun, Users, Zap, Square, Terminal,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { api } from '../utils/api'
import { useTheme } from '../ThemeContext'
import { can } from '../utils/permissions'
import { HabboFigure } from '../components/HabboFigure'
import { IntegratedView } from '../components/dashboard/IntegratedView'
import { SkillBrowser, SkillDetailModal } from '../components/dashboard/SkillBrowser'
import { RunReportsSection } from '../components/dashboard/RunReports'
import { MarketplaceView } from '../components/MarketplaceView'
import { IntegrationsTab } from '../tabs/IntegrationsTab'
import { DevToolsView } from '../tabs/DevToolsView'
import VoiceChat from '../components/VoiceChat'
import { FeedbackWidget } from '../components/FeedbackWidget'
import { JoinHotelMenuItem } from '../components/JoinHotelMenuItem'
import { UiBuildFooter } from '../UiBuildFooter'

// ── Log panel (reused from AgentDashboard) ────────────────────────────────

const LOG_COLORS = {
  '[session]':    'text-violet-400 font-medium',
  '[mcp:ok]':     'text-emerald-400',
  '[mcp:err]':    'text-destructive',
  '[tool:err]':   'text-destructive font-medium',
  '[tool←]':      'text-emerald-400',
  '[think]':      'text-warning/80',
  '[done]':       'text-green-400 font-semibold',
  '[trigger]':    'text-purple-400',
  '[claude:err]': 'text-destructive',
  '[voice]':      'text-cyan-400',
  '[sms]':        'text-cyan-400',
  '[timeout]':    'text-destructive',
}

function logColor(line) {
  if (line.includes('[tool→]')) return 'text-info'
  for (const [key, cls] of Object.entries(LOG_COLORS)) {
    if (line.includes(key)) return cls
  }
  return 'text-muted-foreground'
}

function LiveLogDrawer({ lines, activeTeam, stopping, onStop }) {
  const [open, setOpen] = useState(true)
  const bottomRef = useRef(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (!paused && open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lines, paused, open])

  if (!activeTeam) return null

  return (
    <div className="border-t border-border bg-card/80 backdrop-blur-sm flex-shrink-0">
      {/* drawer header */}
      <div className="flex items-center gap-2 px-4 h-9 cursor-pointer select-none" onClick={() => setOpen(v => !v)}>
        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse flex-shrink-0" />
        <Terminal className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-medium text-foreground flex-1">
          Room {activeTeam.roomId} — live log
        </span>
        <button
          onClick={e => { e.stopPropagation(); setPaused(p => !p) }}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded border border-border"
        >
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={e => { e.stopPropagation(); onStop() }}
          disabled={stopping}
          className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/70 transition-colors disabled:opacity-50 ml-1"
        >
          <Square className="w-3 h-3" />
          Stop
        </button>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
      </div>
      {/* log content */}
      {open && (
        <div className="h-40 overflow-y-auto px-4 pb-3 font-mono text-[11px] space-y-0.5">
          {lines.length === 0 ? (
            <p className="text-muted-foreground/50 pt-2">Waiting for output…</p>
          ) : (
            lines.map((line, i) => (
              <div key={i} className={`leading-relaxed whitespace-pre-wrap break-all ${logColor(line)}`}>
                {line}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}

// ── Skills catalog view (read-only for pro, authoring stays in persona editor) ─

function SkillsCatalogView() {
  const [openSkill, setOpenSkill] = useState(null)
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h2 className="font-semibold text-foreground">Skills Catalog</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Browse available skills. To add skills to an agent, edit the persona in the Personas tab.
        </p>
      </div>
      <SkillBrowser selectedSlugs={[]} onChange={() => {}} readOnly />
      <SkillDetailModal slug={openSkill} onClose={() => setOpenSkill(null)} />
    </div>
  )
}

// ── Tab definitions ────────────────────────────────────────────────────────

const ORCH_TABS = [
  { id: 'teams',       label: 'Teams',       icon: Users },
  { id: 'personas',    label: 'Personas',    icon: Bot },
  { id: 'skills',      label: 'Skills',      icon: Zap },
  { id: 'marketplace', label: 'Marketplace', icon: LayoutGrid },
  { id: 'mcp',         label: 'MCP',         icon: Network },
  { id: 'reports',     label: 'Reports',     icon: FileText },
  { id: 'voice',       label: 'Voice',       icon: Mic },
  { id: 'devtools',    label: 'Dev Tools',   icon: Terminal, permission: 'devtools.access' },
]

const ORCH_TAB_IDS = new Set(ORCH_TABS.map(t => t.id))

// Mobile bottom bar: first 4 + overflow "More"
const MOBILE_PRIMARY_TABS = ['teams', 'personas', 'mcp', 'voice']

function resolveOrchTab(tab) {
  if (!tab || !ORCH_TAB_IDS.has(tab)) return 'teams'
  return tab
}

// ── OrchestrationLayout ───────────────────────────────────────────────────

export function OrchestrationLayout() {
  const { me, setMe } = useOutletContext()
  const { tab: tabParam } = useParams()
  const navigate = useNavigate()
  const { theme, setThemeByName } = useTheme()

  const activeTab = resolveOrchTab(tabParam)
  const setActiveTab = useCallback((id) => navigate(`/orchestration/${id}`), [navigate])

  const scrollToCuratedIntegrations = useCallback(() => {
    document.getElementById('curated-integrations')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  useEffect(() => {
    if (activeTab !== 'mcp' || window.location.hash !== '#curated-integrations') return
    const t = setTimeout(scrollToCuratedIntegrations, 150)
    return () => clearTimeout(t)
  }, [activeTab, tabParam, scrollToCuratedIntegrations])

  // Pro gate — redirect basic users back to home
  useEffect(() => {
    if (me && !can(me, 'teams.view')) {
      navigate('/app/home', { replace: true })
    }
  }, [me, navigate])

  // Redirect invalid tab slugs
  useEffect(() => {
    if (tabParam && resolveOrchTab(tabParam) !== tabParam) {
      navigate(`/orchestration/${resolveOrchTab(tabParam)}`, { replace: true })
    }
  }, [tabParam, navigate])

  // ── Active run + logs polling ─────────────────────────────────────────
  const [activeTeam, setActiveTeam] = useState(null)
  const [liveBots, setLiveBots] = useState([])
  const [logLines, setLogLines] = useState([])
  const [stopping, setStopping] = useState(false)
  const [teamError, setTeamError] = useState(null)

  const fetchStatus = useCallback(async () => {
    try {
      const d = await api('/api/agents/status')
      const runs = d.trigger?.activeRuns ?? []
      const myRun = runs.find(r => r.from === me?.username) ?? null
      setActiveTeam(myRun)
      setLiveBots((d.bots || []).filter(b => b.room_id > 0))
    } catch { setActiveTeam(null) }
  }, [me?.username])

  const fetchLogs = useCallback(async () => {
    try {
      const roomParam = activeTeam?.roomId ? `&room_id=${activeTeam.roomId}` : ''
      const d = await api(`/api/agents/logs?lines=150${roomParam}`)
      if (!d.lines) return
      setLogLines(d.lines)
      const tail = d.lines.slice(-20).join('\n')
      if (/\[trigger\].*error:/i.test(tail) && !activeTeam) {
        if (/credit balance is too low/i.test(tail)) {
          setTeamError({ type: 'billing', message: 'Anthropic credit balance is too low — top up at console.anthropic.com' })
        } else {
          const errLine = d.lines.slice(-20).reverse().find(l => /\[trigger\].*error:/i.test(l))
          setTeamError({ type: 'error', message: errLine?.split('error:')[1]?.trim() || 'Team stopped with an error' })
        }
      }
    } catch { /* ignore */ }
  }, [activeTeam])

  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, 5000)
    return () => clearInterval(id)
  }, [fetchStatus])

  useEffect(() => {
    fetchLogs()
    const id = setInterval(fetchLogs, 3000)
    return () => clearInterval(id)
  }, [fetchLogs])

  async function stopTeam() {
    setStopping(true)
    try {
      await api('/api/agents/stop', {
        method: 'POST',
        body: JSON.stringify({ room_id: activeTeam?.roomId }),
      })
    } catch { /* ignore */ }
    finally { setStopping(false) }
  }

  // ── MCP token version (passed to IntegratedView) ──────────────────────
  const [mcpTokenVersion, setMcpTokenVersion] = useState(0)
  const handleTokenChange = useCallback(() => setMcpTokenVersion(v => v + 1), [])

  // ── Sidebar collapsed state ───────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('orch-sidebar-collapsed') === 'true' } catch { return false }
  })
  function toggleSidebar() {
    setSidebarCollapsed(v => {
      try { localStorage.setItem('orch-sidebar-collapsed', String(!v)) } catch { /* ignore */ }
      return !v
    })
  }

  // ── User menu ─────────────────────────────────────────────────────────
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

  const [busy, setBusy] = useState(false)
  async function handleLogout() {
    setBusy(true)
    try {
      await api('/api/auth/logout', { method: 'POST' })
      setMe(null)
      navigate('/login', { replace: true })
    } catch { setBusy(false) }
  }

  // ── Mobile overflow menu ──────────────────────────────────────────────
  const [showMobileMore, setShowMobileMore] = useState(false)

  const visibleTabs = ORCH_TABS.filter(t => !t.permission || can(me, t.permission))
  const mobilePrimary = visibleTabs.filter(t => MOBILE_PRIMARY_TABS.includes(t.id))
  const mobileOverflow = visibleTabs.filter(t => !MOBILE_PRIMARY_TABS.includes(t.id))

  if (!me || !can(me, 'teams.view')) return null

  return (
    <TooltipProvider delayDuration={400}>
    <div className="h-screen bg-background flex flex-col overflow-hidden">

      {/* ── Top navbar ── */}
      <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex-shrink-0 z-20">
        <div className="h-full px-4 flex items-center gap-3">

          {/* Logo / back to hotel */}
          <button
            onClick={() => navigate('/app/home')}
            className="hidden md:flex items-center gap-2.5 mr-2 hover:opacity-70 transition-opacity"
          >
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <Hotel className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-foreground whitespace-nowrap">AgentHotel</span>
          </button>

          {/* Spacer — pushes right-side controls to the right on desktop */}
          <div className="flex-1" />

          {/* Mode switcher pill */}
          <div className="hidden md:flex rounded-lg border border-border bg-secondary p-0.5 gap-0.5">
            <button
              onClick={() => navigate('/app/home')}
              className="flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
            >
              <Hotel className="w-3 h-3" />
              Hotel
            </button>
            <button
              className="flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium bg-background text-foreground shadow-sm border border-border/50"
            >
              <Users className="w-3 h-3" />
              Orchestration
              {activeTeam && (
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse flex-shrink-0" />
              )}
            </button>
          </div>

          {/* Error banner inline (billing/error) */}
          {teamError && (
            <div className={`hidden sm:flex items-center gap-2 text-xs px-2.5 py-1 rounded-lg border ${
              teamError.type === 'billing'
                ? 'bg-warning/10 border-warning/30 text-warning/80'
                : 'bg-destructive/10 border-destructive/30 text-destructive/80'
            }`}>
              {teamError.message.length > 60 ? teamError.message.slice(0, 60) + '…' : teamError.message}
              <button onClick={() => setTeamError(null)} className="ml-1 opacity-60 hover:opacity-100">×</button>
            </div>
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
                <button
                  onClick={() => { navigate('/app/settings'); setShowUserMenu(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
                >
                  <Settings className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  Settings
                </button>
                <JoinHotelMenuItem onClose={() => setShowUserMenu(false)} />

                <div className="border-t border-border my-0.5" />

                {/* Theme switcher */}
                <div className="px-3 py-2.5">
                  <p className="text-xs text-muted-foreground mb-2">Theme</p>
                  <div className="relative flex items-center bg-secondary rounded-lg p-0.5 gap-0">
                    <div
                      className="absolute top-0.5 bottom-0.5 w-1/2 rounded-md bg-background border border-border shadow-sm transition-all duration-200 ease-in-out"
                      style={{ left: theme === 'light' ? '0.125rem' : 'calc(50% + 0.125rem)' }}
                    />
                    {[{ id: 'light', icon: Sun }, { id: 'dark', icon: Moon }].map(({ id, icon: Icon }) => (
                      <button
                        key={id}
                        onClick={() => { setThemeByName(id); setShowUserMenu(false) }}
                        className={`relative z-10 flex-1 flex items-center justify-center h-7 rounded-md transition-colors duration-150 ${theme === id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-border my-0.5" />

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

      {/* ── Body: sidebar + content ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* ── Collapsible sidebar (desktop) ── */}
        <aside className={`hidden md:flex flex-col flex-shrink-0 border-r border-border bg-card/60 backdrop-blur-sm transition-all duration-200 z-10 ${sidebarCollapsed ? 'w-14' : 'w-52'}`}>
          <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
            {visibleTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                title={sidebarCollapsed ? label : undefined}
                className={`w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{label}</span>}
              </button>
            ))}
          </nav>

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

        {/* ── Main content ── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <main className="flex-1 overflow-y-auto">
            <div key={activeTab} className="animate-fade-up">
              {(activeTab === 'teams' || activeTab === 'personas') && (
                <div className="max-w-5xl mx-auto px-4 py-6">
                  <IntegratedView
                    me={me}
                    onAfterTrigger={fetchLogs}
                    liveBots={liveBots}
                    mcpTokenVersion={mcpTokenVersion}
                    activeSection={activeTab}
                  />
                </div>
              )}
              {activeTab === 'skills' && <SkillsCatalogView />}
              {activeTab === 'marketplace' && (
                <div className="max-w-5xl mx-auto px-4 py-6">
                  <MarketplaceView me={me} onNavigate={(tab) => setActiveTab(tab === 'integrations' ? 'mcp' : tab)} />
                </div>
              )}
              {activeTab === 'mcp' && (
                <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
                  <section className="space-y-3">
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0"><Settings className="w-3.5 h-3.5" /></span>
                      MCP Settings
                    </h2>
                    <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Manage your MCP connections</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Enable or disable integrations, generate MCP tokens, and configure connection settings.
                        </p>
                      </div>
                      <Link to="/app/settings?subtab=mcp"
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors flex-shrink-0">
                        <Settings className="w-3.5 h-3.5" />
                        Open Settings
                      </Link>
                    </div>
                  </section>
                  <div id="curated-integrations" className="border-t border-border pt-6 scroll-mt-6">
                    <IntegrationsTab me={me} />
                  </div>
                </div>
              )}
              {activeTab === 'reports' && (
                <div className="max-w-5xl mx-auto px-4 py-6">
                  <RunReportsSection />
                </div>
              )}
              {activeTab === 'voice' && (
                <div className="max-w-5xl mx-auto px-4 py-6">
                  <VoiceChat me={me} />
                </div>
              )}
              {activeTab === 'devtools' && can(me, 'devtools.access') && (
                <DevToolsView me={me} />
              )}
            </div>
          </main>

          {/* ── Persistent live log drawer ── */}
          <LiveLogDrawer
            lines={logLines}
            activeTeam={activeTeam}
            stopping={stopping}
            onStop={stopTeam}
          />
        </div>
      </div>

      {/* ── Mobile bottom tab bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 flex border-t border-border bg-card/95 backdrop-blur-sm z-20">
        {mobilePrimary.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); setShowMobileMore(false) }}
            className={`relative flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
              activeTab === id && !showMobileMore ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
        {/* More button */}
        <button
          onClick={() => setShowMobileMore(v => !v)}
          className={`relative flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
            showMobileMore || mobileOverflow.some(t => t.id === activeTab)
              ? 'text-primary'
              : 'text-muted-foreground'
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          More
        </button>
      </div>

      {/* Mobile overflow sheet */}
      {showMobileMore && (
        <div className="md:hidden fixed bottom-14 left-0 right-0 bg-card border-t border-border z-20 pb-2">
          {mobileOverflow.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setActiveTab(id); setShowMobileMore(false) }}
              className={`w-full flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
                activeTab === id ? 'text-primary bg-primary/5' : 'text-foreground hover:bg-secondary'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </div>
      )}

      <FeedbackWidget />
      <UiBuildFooter />
    </div>
    </TooltipProvider>
  )
}
