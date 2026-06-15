import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import { HabboFigure } from './HabboFigure'
import { SkillDetail } from './MarketplaceView'
import { SkillChip } from './SkillChip'
import { api } from '../utils/api'
import { friendlyFetchError } from '../utils/fetchError'
import { useToast } from '../ToastContext'
import { useHotel } from '../HotelContext'
import { can } from '../utils/permissions'
import { parseSkillSlugs, parseSkills } from '../utils/parseSkills'
import { useSkillsCatalog } from '../utils/useSkillsCatalog'
import { useEscapeKey } from '../utils/useEscapeKey'
import { MarkdownEditor } from './editor/MarkdownEditor'
import { LoadingState, ErrorBanner, EmptyState } from './dashboard/states'
import { McpHealthBadge } from './dashboard/McpHealthBadge'
import { VoiceAudioSettings } from './settings/VoiceAudioSettings'
import { DeployGoalModal } from './dashboard/DeployGoalModal'
import { RunReportsSection } from './dashboard/RunReports'
import { SkillBrowser, SkillDetailModal } from './dashboard/SkillBrowser'
import { IntegratedView } from './dashboard/IntegratedView'
import {
  Bot, Edit2, Trash2, Plus, X, Check,
  Loader2, AlertCircle, AlertTriangle, Users, Zap, ChevronLeft, Square,
  Shield, Wifi, WifiOff, Key, ServerCog, Terminal, RefreshCw, User, Eye, EyeOff,
  Phone, Copy, Sparkles, LinkIcon,
  FileText, Building2, Workflow, ExternalLink, Mic, Volume2,
} from 'lucide-react'



// ── Main Dashboard Component ───────────────────────────────────────────────

export function AgentDashboard({ me, onActiveTeamChange, onStopTeam, mcpTokenVersion }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlTab = searchParams.get('section')
  const validTabs = ['teams', 'personas', 'reports']
  const initialTab = validTabs.includes(urlTab) ? urlTab : 'teams'
  
  const [tab, setTab] = useState(initialTab)
  const [inSubpage, setInSubpage] = useState(false)
  const [activeTeam, setActiveTeam] = useState(null)  // my own active run
  const [stopping, setStopping] = useState(false)

  const [liveBots, setLiveBots] = useState([])
  const [logLines, setLogLines] = useState([])
  const [logPaused, setLogPaused] = useState(false)
  const [teamError, setTeamError] = useState(null)
  const prevActiveTeam = useRef(null)

  // Update URL when tab changes
  const handleTabChange = (newTab) => {
    setTab(newTab)
    const newParams = new URLSearchParams(searchParams)
    newParams.set('section', newTab)
    setSearchParams(newParams)
  }

  // Sync URL tab changes
  useEffect(() => {
    if (urlTab && validTabs.includes(urlTab) && urlTab !== tab) {
      setTab(urlTab)
    }
  }, [urlTab])

  // Poll agent-trigger health every 5s — find this user's own run by matching username
  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch('/api/agents/status', { credentials: 'include' })
        const d = await res.json().catch(() => ({}))
        const runs = d.trigger?.activeRuns ?? []
        // Match the run that was triggered by this user (by Habbo username)
        const myRun = runs.find(r => r.from === me?.username) ?? null
        setActiveTeam(myRun)
        onActiveTeamChange?.(myRun)
        setLiveBots((d.bots || []).filter(b => b.room_id > 0))
      } catch { setActiveTeam(null) }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [me?.username])

  // Poll logs every 3s — filter to this user's room so they only see their own output
  const fetchLogs = useCallback(async () => {
    try {
      const roomParam = activeTeam?.roomId ? `&room_id=${activeTeam.roomId}` : ''
      const res = await fetch(`/api/agents/logs?lines=150${roomParam}`, { credentials: 'include' })
      const d = await res.json().catch(() => ({}))
      if (!d.lines) return d
      setLogLines(d.lines)

      // Detect errors by scanning the last 20 lines
      // Only show banner if there's no active team (crash) and we haven't already shown it
      const tail = d.lines.slice(-20).join('\n')
      const hasRecentError = /\[trigger\].*error:/i.test(tail)
      if (hasRecentError && !activeTeam) {
        if (/credit balance is too low/i.test(tail)) {
          setTeamError({ type: 'billing', message: 'Anthropic credit balance is too low — top up at console.anthropic.com' })
        } else {
          const errLine = d.lines.slice(-20).reverse().find(l => /\[trigger\].*error:/i.test(l))
          const detail = errLine ? errLine.split('error:')[1]?.trim() : null
          setTeamError({ type: 'error', message: detail || 'Team stopped with an error — check the log panel for details' })
        }
      }
      return d
    } catch { return {} }
  }, [activeTeam])

  useEffect(() => {
    fetchLogs()
    if (logPaused) return
    const id = setInterval(fetchLogs, 3000)
    return () => clearInterval(id)
  }, [logPaused, fetchLogs])

  async function stopTeam() {
    setStopping(true)
    try {
      // Pass room_id so only this user's room is stopped, not other users' runs
      await api('/api/agents/stop', {
        method: 'POST',
        body: JSON.stringify({ room_id: activeTeam?.roomId }),
      })
    } catch { /* ignore */ }
    finally { setStopping(false) }
  }

  const tabs = [
    { id: 'teams', label: 'Teams', icon: Users },
    { id: 'personas', label: 'Personas', icon: User },
    { id: 'reports', label: 'Reports', icon: FileText },
  ]

  return (
    <div className="bg-background">
      {/* Sub-tabs — hidden when inside a team/persona detail page */}
      {!inSubpage && <div className="border-b border-border bg-card/30">
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          {tabs.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {badge && (
                <span className="w-4 h-4 rounded-full bg-success text-success-foreground text-[9px] font-bold flex items-center justify-center">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>}

      {/* Error banner */}
      {teamError && (
        <div className={`border-b px-4 py-3 flex items-center gap-3 ${
          teamError.type === 'billing'
            ? 'bg-warning/10 border-warning/30'
            : 'bg-destructive/10 border-destructive/30'
        }`}>
          <AlertCircle className={`w-4 h-4 flex-shrink-0 ${teamError.type === 'billing' ? 'text-warning' : 'text-destructive'}`} />
          <span className={`text-sm flex-1 ${teamError.type === 'billing' ? 'text-warning/80' : 'text-destructive/80'}`}>
            {teamError.type === 'billing' && <strong>Billing: </strong>}
            {teamError.message}
            {teamError.type === 'billing' && (
              <a href="https://console.anthropic.com" target="_blank" rel="noreferrer"
                className="ml-2 underline underline-offset-2 hover:text-warning/70">
                Add credits →
              </a>
            )}
          </span>
          <button onClick={() => setTeamError(null)} aria-label="Dismiss error" className="text-muted-foreground hover:text-foreground ml-auto flex-shrink-0 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* IntegratedView is always mounted so state (teams, personas, modals) persists across tab switches */}
        <IntegratedView me={me} onAfterTrigger={fetchLogs} liveBots={liveBots} mcpTokenVersion={mcpTokenVersion} activeSection={tab} onSubpageChange={setInSubpage} />
        {/* Live log panel — shown when a team is running */}
        {activeTeam && (
          <LogPanel lines={logLines} paused={logPaused} onTogglePause={() => setLogPaused(p => !p)} />
        )}
      </div>
    </div>
  )
}

// ── Log Panel ─────────────────────────────────────────────────────────────

const LOG_COLORS = {
  '[session]':  'text-violet-400 font-medium',
  '[mcp:ok]':   'text-emerald-400',
  '[mcp:err]':  'text-destructive',
  '[tool:err]': 'text-destructive font-medium',
  '[tool←]':    'text-emerald-400',
  '[think]':    'text-warning/80',
  '[done]':     'text-green-400 font-semibold',
  '[trigger]':  'text-purple-400',
  '[claude:err]': 'text-destructive',
  '[voice]':    'text-cyan-400',
  '[sms]':      'text-cyan-400',
  '[timeout]':  'text-destructive',
}

// Claude CLI emits MCP tools as mcp__<server-name>__<tool-name>
// Map server-name substrings → integration display key
const MCP_SERVER_INTEGRATION_MAP = [
  ['hotel',      'habbo'],
  ['habbo',      'habbo'],
  ['atlassian',  'atlassian'],
  ['jira',       'atlassian'],
  ['confluence', 'atlassian'],
  ['notion',     'notion'],
  ['resend',     'resend'],
  ['email',      'resend'],
  ['web',        'web'],
  ['browser',    'web'],
]

const INTEGRATION_DISPLAY = {
  habbo:     { label: 'Habbo MCP',      color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20',   toolColor: 'text-amber-300' },
  atlassian: { label: 'Jira/Confluence', color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20',     toolColor: 'text-blue-300' },
  notion:    { label: 'Notion',          color: 'text-neutral-300', bg: 'bg-neutral-500/10 border-neutral-500/20', toolColor: 'text-neutral-300' },
  resend:    { label: 'Email',           color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', toolColor: 'text-emerald-300' },
  web:       { label: 'Web',             color: 'text-sky-400',     bg: 'bg-sky-500/10 border-sky-500/20',       toolColor: 'text-sky-300' },
  mcp:       { label: 'MCP',            color: 'text-violet-400',   bg: 'bg-violet-500/10 border-violet-500/20', toolColor: 'text-violet-300' },
}

function extractToolName(line) {
  const m = line.match(/\[tool→\]\s+(\S+)/)
  return m ? m[1] : null
}

/**
 * Given a raw tool name from the log (e.g. "mcp__hotel-mcp__talk_bot" or "Read"),
 * returns the integration key or null for built-in tools.
 */
function toolToIntegrationKey(toolName) {
  if (!toolName) return null
  // Claude CLI prefixes MCP tools as mcp__<server-name>__<tool>
  const mcpMatch = toolName.match(/^mcp__(.+?)__/)
  if (mcpMatch) {
    const server = mcpMatch[1].toLowerCase()
    for (const [keyword, key] of MCP_SERVER_INTEGRATION_MAP) {
      if (server.includes(keyword)) return key
    }
    return 'mcp' // unknown MCP server — still colour it distinctly
  }
  return null // built-in tool (Read, Write, Bash, Agent…) — no integration
}

function logColor(line) {
  if (line.includes('[tool→]')) {
    const tool = extractToolName(line)
    const intKey = toolToIntegrationKey(tool)
    if (intKey) return INTEGRATION_DISPLAY[intKey].toolColor
    return 'text-info'
  }
  for (const [key, cls] of Object.entries(LOG_COLORS)) {
    if (line.includes(key)) return cls
  }
  return 'text-muted-foreground'
}

export function LogPanel({ lines, paused, onTogglePause }) {
  const bottomRef = useRef(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && !paused && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lines, autoScroll, paused])

  // Derive which MCP servers were configured at session start from [session] line
  const configuredServers = useMemo(() => {
    const sessionLine = lines.find(l => l.includes('[session]'))
    const match = sessionLine?.match(/configured:\s*(.+)/)
    if (!match) return []
    return match[1].split(',').map(s => s.trim()).filter(Boolean)
  }, [lines])

  // Derive which integrations appeared in this run from [tool→] lines
  const usedIntegrations = useMemo(() => {
    const seen = new Set()
    for (const line of lines) {
      if (!line.includes('[tool→]')) continue
      const intKey = toolToIntegrationKey(extractToolName(line))
      if (intKey) seen.add(intKey)
    }
    return [...seen]
  }, [lines])

  // Count tool calls per integration for tooltip
  const toolCallCounts = useMemo(() => {
    const counts = {}
    for (const line of lines) {
      if (!line.includes('[tool→]')) continue
      const intKey = toolToIntegrationKey(extractToolName(line))
      if (intKey) counts[intKey] = (counts[intKey] || 0) + 1
    }
    return counts
  }, [lines])

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-card flex items-center gap-2 flex-wrap">
        <Terminal className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-semibold text-foreground">Agent Logs</span>
        <span className="text-xs text-muted-foreground">— live output from running team</span>

        {/* Configured MCP server badges — shown as soon as session starts */}
        {configuredServers.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-violet-400/60 uppercase tracking-wider font-medium">MCP</span>
            {configuredServers.map(server => (
              <span
                key={server}
                className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border bg-violet-500/10 border-violet-500/20 text-violet-400"
              >
                {server}
              </span>
            ))}
          </div>
        )}

        {/* Integration call badges — appear as tools are called */}
        {usedIntegrations.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {usedIntegrations.map(key => {
              const meta = INTEGRATION_DISPLAY[key]
              const count = toolCallCounts[key] || 0
              return (
                <span
                  key={key}
                  title={`${count} ${key} tool call${count !== 1 ? 's' : ''}`}
                  className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${meta.bg} ${meta.color}`}
                >
                  {meta.label}
                  <span className="opacity-60">×{count}</span>
                </span>
              )
            })}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} className="w-3 h-3 accent-primary" />
            Auto-scroll
          </label>
          <button
            onClick={onTogglePause}
            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-colors ${paused ? 'text-warning border-warning/40 bg-warning/10' : 'text-muted-foreground border-border hover:text-foreground'}`}
          >
            <RefreshCw className={`w-3 h-3 ${paused ? '' : 'animate-spin'}`} />
            {paused ? 'Paused' : 'Live'}
          </button>
        </div>
      </div>
      <div className="h-72 overflow-y-auto font-mono text-xs px-4 py-3 space-y-0.5 bg-[#0d0d0d]">
        {lines.length === 0 && (
          <p className="text-muted-foreground/50 italic">No log entries yet — trigger a team to see output here.</p>
        )}
        {lines.map((line, i) => {
          const ts = line.slice(0, 24)
          const rest = line.slice(25)
          // For tool→ lines, annotate with a tiny integration tag
          const toolName = line.includes('[tool→]') ? extractToolName(line) : null
          const intKey = toolToIntegrationKey(toolName)
          const intMeta = intKey ? INTEGRATION_DISPLAY[intKey] : null
          return (
            <div key={i} className="flex gap-2 leading-5">
              <span className="text-muted-foreground/40 flex-shrink-0 select-none">{ts.slice(11, 23)}</span>
              {intMeta && (
                <span className={`flex-shrink-0 text-[9px] font-medium px-1 rounded border self-center ${intMeta.bg} ${intMeta.color}`}>
                  {intMeta.label}
                </span>
              )}
              <span className={`min-w-0 break-all ${logColor(line)}`}>{rest}</span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ── Online View ───────────────────────────────────────────────────────────

export function OnlineView() {
  const [personas, setPersonas] = useState([])
  const [liveBots, setLiveBots] = useState([])

  // Self-contained polling — works when mounted outside AgentDashboard
  useEffect(() => {
    async function poll() {
      try {
        const [pd, statusData] = await Promise.all([
          api('/api/my/personas'),
          fetch('/api/agents/status', { credentials: 'include' }).then(r => r.json().catch(() => ({}))),
        ])
        setPersonas(pd.personas || [])
        setLiveBots((statusData.bots || []).filter(b => b.room_id > 0))
      } catch { /* non-blocking */ }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [])

  const onlineAgentNames = new Set(liveBots.filter(b => b.is_agent).map(b => b.name?.toLowerCase()))

  const rooms = liveBots.reduce((acc, bot) => {
    if (!bot.is_agent) return acc // only show agent bots in room cards
    const key = bot.room_id
    if (!acc[key]) acc[key] = []
    acc[key].push(bot)
    return acc
  }, {})

  const offlinePersonas = personas.filter(p => !onlineAgentNames.has(p.name?.toLowerCase()))
  const roomCount = Object.keys(rooms).length
  const agentCount = liveBots.filter(b => b.is_agent).length

  return (
    <div className="space-y-6">
      {/* Online section */}
      <div className="space-y-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <h2 className="text-sm font-semibold text-foreground">Online</h2>
            <span className="text-xs text-muted-foreground">
              {agentCount} agent{agentCount !== 1 ? 's' : ''} in {roomCount} room{roomCount !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 ml-4">
            Only bots linked to a persona are shown here — unlinked hotel bots are not listed.
          </p>
        </div>

        {roomCount === 0 ? (
          <div className="rounded-xl border border-border bg-card/50 p-8 flex flex-col items-center gap-2 text-center">
            <WifiOff className="w-7 h-7 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No agents online</p>
            <p className="text-xs text-muted-foreground">Deploy a team to a hotel room to see agents here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(rooms).map(([roomId, bots]) => (
              <div key={roomId} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{bots[0]?.room_name || `Room ${roomId}`}</p>
                    <p className="text-xs text-muted-foreground">#{roomId}</p>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse flex-shrink-0" />
                </div>
                <div className="space-y-2">
                  {bots.map(bot => (
                    <div key={bot.id} className="flex items-center gap-3">
                      <HabboFigure figure={bot.figure || bot.persona_figure || null} size="sm" animate={true} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{bot.persona_name || bot.name}</p>
                        {bot.team_name && <p className="text-xs text-muted-foreground">{bot.team_name}</p>}
                      </div>
                      {(bot.x != null && bot.y != null) && (
                        <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums flex-shrink-0">
                          {bot.x},{bot.y}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Offline section */}
      {offlinePersonas.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
            <h2 className="text-sm font-semibold text-muted-foreground">Offline</h2>
            <span className="text-xs text-muted-foreground">{offlinePersonas.length} agent{offlinePersonas.length !== 1 ? 's' : ''} not deployed</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {offlinePersonas.map(p => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-card/30 px-4 py-3 opacity-50">
                <HabboFigure figure={p.figure || null} size="sm" animate={false} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  {p.role && <p className="text-xs text-muted-foreground">{p.role}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

