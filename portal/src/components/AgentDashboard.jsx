import { useState, useEffect, useCallback, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { HabboFigure } from './HabboFigure'
import {
  Bot, Package, Play, Edit2, Trash2, Plus, X, Check,
  Loader2, AlertCircle, Users, Zap, ChevronDown, ChevronUp, Square,
  Shield, Wifi, WifiOff, Key, ServerCog, Terminal, RefreshCw,
} from 'lucide-react'

// ── Markdown Editor ───────────────────────────────────────────────────────

function MarkdownEditor({ value, onChange, placeholder, rows = 16 }) {
  const [mode, setMode] = useState('edit')
  return (
    <div className="rounded-md border border-border overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-border bg-muted/30">
        <button
          type="button"
          onClick={() => setMode('edit')}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'edit' ? 'text-foreground bg-background border-r border-border' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setMode('preview')}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'preview' ? 'text-foreground bg-background border-r border-border' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Preview
        </button>
        <span className="ml-auto px-3 text-xs text-muted-foreground/50">Markdown</span>
      </div>

      {/* Edit mode */}
      {mode === 'edit' && (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full text-sm bg-background px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none font-mono resize-y min-h-[200px]"
        />
      )}

      {/* Preview mode */}
      {mode === 'preview' && (
        <div className="px-4 py-3 min-h-[200px] bg-background prose prose-sm prose-invert max-w-none
          [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-foreground [&_h1]:mb-2
          [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-4 [&_h2]:mb-1
          [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-3 [&_h3]:mb-1
          [&_p]:text-sm [&_p]:text-muted-foreground [&_p]:my-1
          [&_ul]:text-sm [&_ul]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1
          [&_ol]:text-sm [&_ol]:text-muted-foreground [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1
          [&_li]:my-0.5
          [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-primary
          [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto
          [&_strong]:text-foreground [&_strong]:font-semibold
          [&_hr]:border-border">
          {value ? <ReactMarkdown>{value}</ReactMarkdown> : <p className="text-muted-foreground/50 text-sm italic">Nothing to preview yet.</p>}
        </div>
      )}
    </div>
  )
}

// ── API helper ────────────────────────────────────────────────────────────

async function api(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

// ── Main Dashboard Component ───────────────────────────────────────────────

export function AgentDashboard({ me }) {
  const [tab, setTab] = useState('packs')
  const [activeTeam, setActiveTeam] = useState(null)
  const [stopping, setStopping] = useState(false)

  const [liveBots, setLiveBots] = useState([])
  const [mcpStatus, setMcpStatus] = useState(null)
  const [logLines, setLogLines] = useState([])
  const [logPaused, setLogPaused] = useState(false)
  const [teamError, setTeamError] = useState(null)
  const prevActiveTeam = useRef(null)

  // Poll agent-trigger health every 5s to show active team status
  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch('/api/agents/status', { credentials: 'include' })
        const d = await res.json().catch(() => ({}))
        setActiveTeam(d.trigger?.activeTeam ?? null)
        setLiveBots((d.bots || []).filter(b => b.room_id > 0))
        if (d.mcp) setMcpStatus(d.mcp)
      } catch { setActiveTeam(null) }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [])

  // Poll logs every 3s + detect errors when team stops
  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/logs?lines=150', { credentials: 'include' })
      const d = await res.json().catch(() => ({}))
      if (!d.lines) return d
      setLogLines(d.lines)
      return d
    } catch { return {} }
  }, [])

  useEffect(() => {
    async function pollLogs() {
      if (logPaused) return
      const d = await fetchLogs()
      if (!d.lines) return

      // Detect team stopping with an error by scanning the last 20 lines
      const wasActive = prevActiveTeam.current
      const isActive = activeTeam
      if (wasActive && !isActive) {
        const tail = d.lines.slice(-20).join('\n')
        let detected = null
        if (/credit balance is too low/i.test(tail)) {
          detected = { type: 'billing', message: 'Anthropic credit balance is too low — top up at console.anthropic.com' }
        } else if (/claude exited 1/i.test(tail)) {
          const errLine = d.lines.slice(-20).reverse().find(l => l.includes('[trigger]') && l.includes('error:'))
          const detail = errLine ? errLine.split('error:')[1]?.trim() : null
          detected = { type: 'error', message: detail || 'Team stopped with an error — check the log panel for details' }
        }
        if (detected) setTeamError(detected)
      }
      prevActiveTeam.current = isActive
    }
    pollLogs()
    const id = setInterval(pollLogs, 3000)
    return () => clearInterval(id)
  }, [logPaused, activeTeam, fetchLogs])

  async function stopTeam() {
    setStopping(true)
    try { await api('/api/agents/stop', { method: 'POST' }) } catch { /* ignore */ }
    finally { setStopping(false) }
  }

  const tabs = [
    { id: 'packs', label: 'Packs', icon: Package },
    { id: 'integrated', label: 'Integrated', icon: Users },
    ...(me?.is_developer ? [{ id: 'developer', label: 'Developer', icon: Shield }] : []),
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-sm text-foreground">Agent Command Center</h1>
            <p className="text-xs text-muted-foreground">Orchestration Hub</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {/* Live status + stop */}
            {activeTeam && (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                <span className="text-xs text-green-400 font-medium">Room {activeTeam.roomId} active</span>
                <button
                  onClick={stopTeam}
                  disabled={stopping}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-400/50 rounded px-2 py-0.5 ml-1 transition-colors disabled:opacity-50"
                >
                  {stopping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                  Stop
                </button>
              </div>
            )}
            {me?.figure && <HabboFigure figure={me.figure} size="sm" animate={false} />}
            <span className="text-sm text-muted-foreground">{me?.habbo_username}</span>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4 flex gap-1 pb-0">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Error banner */}
      {teamError && (
        <div className={`border-b px-4 py-3 flex items-center gap-3 ${
          teamError.type === 'billing'
            ? 'bg-amber-500/10 border-amber-500/30'
            : 'bg-red-500/10 border-red-500/30'
        }`}>
          <AlertCircle className={`w-4 h-4 flex-shrink-0 ${teamError.type === 'billing' ? 'text-amber-400' : 'text-red-400'}`} />
          <span className={`text-sm flex-1 ${teamError.type === 'billing' ? 'text-amber-300' : 'text-red-300'}`}>
            {teamError.type === 'billing' && <strong>Billing: </strong>}
            {teamError.message}
            {teamError.type === 'billing' && (
              <a href="https://console.anthropic.com" target="_blank" rel="noreferrer"
                className="ml-2 underline underline-offset-2 hover:text-amber-200">
                Add credits →
              </a>
            )}
          </span>
          <button onClick={() => setTeamError(null)} className="text-muted-foreground hover:text-foreground ml-auto flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Live rooms panel */}
        {liveBots.length > 0 && (() => {
          // Group bots by room_id
          const rooms = liveBots.reduce((acc, bot) => {
            const key = bot.room_id
            if (!acc[key]) acc[key] = []
            acc[key].push(bot)
            return acc
          }, {})
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <p className="text-sm font-semibold text-green-400">Live rooms</p>
                <span className="ml-auto text-xs text-muted-foreground">{Object.keys(rooms).length} room{Object.keys(rooms).length !== 1 ? 's' : ''} loaded</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(rooms).map(([roomId, bots]) => {
                  const agentBots = bots.filter(b => b.is_agent)
                  const otherBots = bots.filter(b => !b.is_agent)
                  return (
                    <div key={roomId} className={`rounded-xl border p-4 space-y-3 ${agentBots.length > 0 ? 'border-yellow-500/25 bg-yellow-500/5' : 'border-border bg-card/50'}`}>
                      {/* Room header */}
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="text-xs font-bold text-foreground">{bots[0]?.room_name || `Room ${roomId}`}</p>
                          <p className="text-xs text-muted-foreground">#{roomId}</p>
                        </div>
                        <span className="ml-auto text-xs text-muted-foreground">{bots.length} bot{bots.length !== 1 ? 's' : ''}</span>
                      </div>
                      {/* Agent bots */}
                      {agentBots.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {agentBots.map(bot => (
                            <div key={bot.id} className="flex items-center gap-2">
                              <HabboFigure figure={bot.figure || null} size="sm" animate={true} />
                              <div>
                                <p className="text-xs font-semibold text-foreground">{bot.name}</p>
                                {bot.team_name && <p className="text-xs text-yellow-400/80">{bot.team_name}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Other bots — compact pill list */}
                      {otherBots.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {otherBots.map(bot => (
                            <span key={bot.id} className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-0.5">{bot.name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
        {tab === 'packs' && <PacksView />}
        {tab === 'integrated' && <IntegratedView onAfterTrigger={fetchLogs} />}
        {tab === 'developer' && me?.is_developer && <DeveloperView mcpStatus={mcpStatus} logLines={logLines} logPaused={logPaused} setLogPaused={setLogPaused} />}

        {/* Live log panel — shown on all tabs when a team is running */}
        {activeTeam && tab !== 'developer' && (
          <LogPanel lines={logLines} paused={logPaused} onTogglePause={() => setLogPaused(p => !p)} />
        )}
      </div>
    </div>
  )
}

// ── Log Panel ─────────────────────────────────────────────────────────────

const LOG_COLORS = {
  '[tool→]':    'text-blue-400',
  '[tool←]':    'text-emerald-400',
  '[think]':    'text-yellow-300/80',
  '[done]':     'text-green-400 font-semibold',
  '[trigger]':  'text-purple-400',
  '[narrator]': 'text-pink-400',
  '[claude:err]': 'text-red-400',
  '[voice]':    'text-cyan-400',
}

function logColor(line) {
  for (const [key, cls] of Object.entries(LOG_COLORS)) {
    if (line.includes(key)) return cls
  }
  return 'text-muted-foreground'
}

function LogPanel({ lines, paused, onTogglePause }) {
  const bottomRef = useRef(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && !paused && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lines, autoScroll, paused])

  return (
    <div className="rounded-xl border border-border bg-[#0d0d0d] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <Terminal className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">Agent Logs</span>
        <span className="text-xs text-muted-foreground ml-1">— live output from running team</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} className="w-3 h-3 accent-primary" />
            Auto-scroll
          </label>
          <button
            onClick={onTogglePause}
            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-colors ${paused ? 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10' : 'text-muted-foreground border-border hover:text-foreground'}`}
          >
            <RefreshCw className={`w-3 h-3 ${paused ? '' : 'animate-spin'}`} />
            {paused ? 'Paused' : 'Live'}
          </button>
        </div>
      </div>
      <div className="h-72 overflow-y-auto font-mono text-xs px-4 py-3 space-y-0.5">
        {lines.length === 0 && (
          <p className="text-muted-foreground/50 italic">No log entries yet — trigger a team to see output here.</p>
        )}
        {lines.map((line, i) => {
          const ts = line.slice(0, 24)
          const rest = line.slice(25)
          return (
            <div key={i} className="flex gap-2 leading-5">
              <span className="text-muted-foreground/40 flex-shrink-0 select-none">{ts.slice(11, 23)}</span>
              <span className={logColor(line)}>{rest}</span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ── Developer View ────────────────────────────────────────────────────────

function DeveloperView({ mcpStatus, logLines, logPaused, setLogPaused }) {
  const servers = mcpStatus?.servers ?? []
  const loading = mcpStatus === null

  return (
    <div className="space-y-6">
      {/* MCP Servers */}
      <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <ServerCog className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Connected MCP Servers</h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {loading ? 'Loading…' : `${servers.filter(s => s.reachable).length} / ${servers.length} reachable`}
          </span>
        </div>

        {loading && (
          <div className="px-5 py-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Checking MCP servers…</span>
          </div>
        )}

        {!loading && mcpStatus?.error && (
          <div className="px-5 py-4 flex items-center gap-2 text-amber-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{mcpStatus.error}</span>
          </div>
        )}

        {!loading && !mcpStatus?.error && servers.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No MCP servers configured in <code className="text-xs bg-muted px-1 py-0.5 rounded">.mcp.json</code>
          </div>
        )}

        {!loading && servers.length > 0 && (
          <div className="divide-y divide-border">
            {servers.map(server => (
              <div key={server.name} className="px-5 py-4 flex items-center gap-4">
                {/* Status dot */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${server.reachable ? 'bg-green-400' : 'bg-red-400'}`} />

                {/* Name + URL */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{server.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{server.url}</p>
                </div>

                {/* Auth badge */}
                <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md border ${
                  server.hasKey
                    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                    : 'text-muted-foreground border-border bg-muted/30'
                }`}>
                  <Key className="w-3 h-3" />
                  {server.hasKey ? server.keyPreview : 'No key'}
                </div>

                {/* Reachable badge */}
                <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border font-medium ${
                  server.reachable
                    ? 'text-green-400 border-green-500/30 bg-green-500/10'
                    : 'text-red-400 border-red-500/30 bg-red-500/10'
                }`}>
                  {server.reachable
                    ? <><Wifi className="w-3 h-3" /> {server.statusCode ?? 'OK'}</>
                    : <><WifiOff className="w-3 h-3" /> Unreachable</>
                  }
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && mcpStatus?.mcpJsonPath && (
          <div className="px-5 py-2 border-t border-border bg-muted/20">
            <p className="text-xs text-muted-foreground">
              Config: <code className="text-xs">{mcpStatus.mcpJsonPath}</code>
            </p>
          </div>
        )}
      </div>

      {/* Log panel always visible in Developer tab */}
      <LogPanel lines={logLines} paused={logPaused} onTogglePause={() => setLogPaused(p => !p)} />
    </div>
  )
}

// ── Packs View ────────────────────────────────────────────────────────────

function PacksView() {
  const [packs, setPacks] = useState([])
  const [bots, setBots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingPack, setEditingPack] = useState(null) // null | pack object
  const [runningIds, setRunningIds] = useState(new Set())
  const [toast, setToast] = useState(null) // { msg, type }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pd, bd] = await Promise.all([
        api('/api/agents/packs'),
        api('/api/agents/bots'),
      ])
      setPacks(pd.packs || [])
      setBots(bd.bots || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function runPack(pack) {
    setRunningIds(prev => new Set([...prev, pack.id]))
    try {
      await api(`/api/agents/packs/${pack.id}/trigger`, { method: 'POST' })
      showToast(`Pack "${pack.name}" triggered successfully.`)
    } catch (e) {
      showToast(`Failed to run pack: ${e.message}`, 'error')
    } finally {
      setRunningIds(prev => {
        const next = new Set(prev)
        next.delete(pack.id)
        return next
      })
    }
  }

  async function deletePack(pack) {
    if (!confirm(`Delete pack "${pack.name}"?`)) return
    // Optimistic remove
    setPacks(prev => prev.filter(p => p.id !== pack.id))
    try {
      await api(`/api/agents/packs/${pack.id}`, { method: 'DELETE' })
    } catch (e) {
      showToast(`Delete failed: ${e.message}`, 'error')
      load()
    }
  }

  function openNewForm() {
    setEditingPack(null)
    setShowForm(true)
  }

  function openEditForm(pack) {
    setEditingPack(pack)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingPack(null)
  }

  async function savePack(data) {
    if (editingPack) {
      await api(`/api/agents/packs/${editingPack.id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
    } else {
      await api('/api/agents/packs', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    }
    closeForm()
    load()
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorBanner message={error} onRetry={load} />

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
          toast.type === 'error'
            ? 'bg-destructive/10 border border-destructive/30 text-destructive'
            : 'bg-green-500/10 border border-green-500/30 text-green-400'
        }`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <Check className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Packs</h2>
        {!showForm && (
          <button
            onClick={openNewForm}
            className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3 h-3" /> Add Pack
          </button>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <PackForm
          pack={editingPack}
          bots={bots}
          onSave={savePack}
          onCancel={closeForm}
        />
      )}

      {/* Cards grid */}
      {packs.length === 0 && !showForm ? (
        <EmptyState icon={Package} title="No packs yet" description="Create your first pack to get started" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packs.map(pack => (
            <PackCard
              key={pack.id}
              pack={pack}
              running={runningIds.has(pack.id)}
              onRun={() => runPack(pack)}
              onEdit={() => openEditForm(pack)}
              onDelete={() => deletePack(pack)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Pack Card ─────────────────────────────────────────────────────────────

function PackCard({ pack, running, onRun, onEdit, onDelete }) {
  const sourceDisplay = pack.pack_source_url
    ? pack.pack_source_url.length > 40
      ? pack.pack_source_url.slice(0, 37) + '...'
      : pack.pack_source_url
    : null

  const assignments = Array.isArray(pack.role_assignments) ? pack.role_assignments : []

  return (
    <div className="relative flex flex-col gap-3 p-4 rounded-xl border border-border bg-card">
      {/* Edit / Delete buttons top-right */}
      <div className="absolute top-3 right-3 flex gap-1">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Edit pack"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Delete pack"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Top */}
      <div className="flex items-start gap-3 pr-16">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Package className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-foreground">{pack.name}</p>
          {pack.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{pack.description}</p>
          )}
        </div>
      </div>

      {/* Source */}
      {sourceDisplay && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/60 mr-1">Source</span>
          <span className="font-mono">{sourceDisplay}</span>
        </div>
      )}

      {/* Role assignments */}
      {assignments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {assignments.map((a, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full"
            >
              <span className="text-muted-foreground">{a.role}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-medium">{a.bot_name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Room badge */}
      {pack.room_id && (
        <div>
          <span className="inline-flex items-center text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
            Room {pack.room_id}
          </span>
        </div>
      )}

      {/* Run button */}
      <button
        onClick={onRun}
        disabled={running}
        className="mt-auto flex items-center justify-center gap-1.5 text-xs bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {running ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running...
          </>
        ) : (
          <>
            <Play className="w-3.5 h-3.5" /> Run
          </>
        )}
      </button>
    </div>
  )
}

// ── Pack Form ─────────────────────────────────────────────────────────────

function PackForm({ pack, bots, onSave, onCancel }) {
  const [name, setName] = useState(pack?.name || '')
  const [description, setDescription] = useState(pack?.description || '')
  const [roomId, setRoomId] = useState(pack?.room_id ?? 202)
  const [sourceUrl, setSourceUrl] = useState(pack?.pack_source_url || '')
  const [assignments, setAssignments] = useState(
    Array.isArray(pack?.role_assignments) && pack.role_assignments.length > 0
      ? pack.role_assignments.map(a => ({ role: a.role || '', bot_name: a.bot_name || '' }))
      : [{ role: '', bot_name: '' }]
  )
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  function addAssignment() {
    setAssignments(prev => [...prev, { role: '', bot_name: '' }])
  }

  function removeAssignment(i) {
    setAssignments(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateAssignment(i, field, value) {
    setAssignments(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: value } : a))
  }

  async function handleSave() {
    if (!name.trim()) { setFormError('Name is required'); return }
    setSaving(true)
    setFormError(null)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        room_id: Number(roomId),
        pack_source_url: sourceUrl.trim(),
        role_assignments: assignments.filter(a => a.role.trim()),
      })
    } catch (e) {
      setFormError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="font-semibold text-sm text-foreground">{pack ? 'Edit Pack' : 'New Pack'}</h3>

      {formError && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {formError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My Pack"
            className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Room ID</label>
          <input
            type="number"
            value={roomId}
            onChange={e => setRoomId(e.target.value)}
            className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Description</label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What does this pack do?"
          className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Pack Source URL</label>
        <input
          value={sourceUrl}
          onChange={e => setSourceUrl(e.target.value)}
          placeholder="https://raw.githubusercontent.com/.../orchestrator.md"
          className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
        />
      </div>

      {/* Role assignments */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-foreground">Role Assignments</label>
        {assignments.map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={a.role}
              onChange={e => updateAssignment(i, 'role', e.target.value)}
              placeholder="researcher"
              className="flex-1 text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <span className="text-muted-foreground text-sm flex-shrink-0">→</span>
            <select
              value={a.bot_name}
              onChange={e => updateAssignment(i, 'bot_name', e.target.value)}
              className="flex-1 text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">Select bot…</option>
              {bots.map(b => (
                <option key={b.id ?? b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
            <button
              onClick={() => removeAssignment(i)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={addAssignment}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Role
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="text-xs border border-border px-4 py-2 rounded-md hover:bg-secondary transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Integrated View ───────────────────────────────────────────────────────

function IntegratedView({ onAfterTrigger }) {
  const [personas, setPersonas] = useState([])
  const [teams, setTeams] = useState([])
  const [bots, setBots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showPersonaForm, setShowPersonaForm] = useState(false)
  const [showTeamForm, setShowTeamForm] = useState(false)
  const [editingPersona, setEditingPersona] = useState(null)
  const [editingTeam, setEditingTeam] = useState(null)
  const [toast, setToast] = useState(null)
  const [deployingIds, setDeployingIds] = useState(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pd, bd, td] = await Promise.all([
        api('/api/agents/personas'),
        api('/api/agents/bots'),
        api('/api/agents/teams'),
      ])
      setPersonas(pd.personas || [])
      setBots(bd.bots || [])
      setTeams(td.teams || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function deployTeam(team) {
    setDeployingIds(prev => new Set([...prev, team.id]))
    try {
      await api(`/api/agents/teams/${team.id}/trigger`, { method: 'POST' })
      showToast(`Team "${team.name}" deployed!`)
      // Fetch logs immediately + again after 2s to catch fast crashes
      onAfterTrigger?.()
      setTimeout(() => onAfterTrigger?.(), 2000)
      setTimeout(() => onAfterTrigger?.(), 4000)
    } catch (e) {
      showToast(`Deploy failed: ${e.message}`, 'error')
      onAfterTrigger?.()
    } finally {
      setDeployingIds(prev => { const n = new Set(prev); n.delete(team.id); return n })
    }
  }

  async function deleteTeam(team) {
    if (!confirm(`Delete team "${team.name}"?`)) return
    setTeams(prev => prev.filter(t => t.id !== team.id))
    try { await api(`/api/agents/teams/${team.id}`, { method: 'DELETE' }) }
    catch { load() }
  }

  async function deletePersona(persona) {
    if (!confirm(`Delete agent "${persona.name}"?`)) return
    setPersonas(prev => prev.filter(p => p.id !== persona.id))
    try { await api(`/api/agents/personas/${persona.id}`, { method: 'DELETE' }) }
    catch { load() }
  }

  async function savePersona(data) {
    if (editingPersona) {
      await api(`/api/agents/personas/${editingPersona.id}`, { method: 'PUT', body: JSON.stringify(data) })
    } else {
      await api('/api/agents/personas', { method: 'POST', body: JSON.stringify(data) })
    }
    setShowPersonaForm(false)
    setEditingPersona(null)
    load()
  }

  async function saveTeam(data) {
    if (editingTeam) {
      await api(`/api/agents/teams/${editingTeam.id}`, { method: 'PUT', body: JSON.stringify(data) })
    } else {
      await api('/api/agents/teams', { method: 'POST', body: JSON.stringify(data) })
    }
    setShowTeamForm(false)
    setEditingTeam(null)
    load()
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorBanner message={error} onRetry={load} />

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
          toast.type === 'error'
            ? 'bg-destructive/10 border border-destructive/30 text-destructive'
            : 'bg-green-500/10 border border-green-500/30 text-green-400'
        }`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <Check className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* ── Teams ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Teams</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Group agents into a deployable team</p>
          </div>
          {!showTeamForm && (
            <button
              onClick={() => { setEditingTeam(null); setShowTeamForm(true) }}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3 h-3" /> New Team
            </button>
          )}
        </div>

        {showTeamForm && (
          <IntegratedTeamForm
            team={editingTeam}
            personas={personas}
            onSave={saveTeam}
            onCancel={() => { setShowTeamForm(false); setEditingTeam(null) }}
          />
        )}

        {teams.length === 0 && !showTeamForm ? (
          <EmptyState icon={Users} title="No teams yet" description="Create a team to group and deploy your integrated agents" />
        ) : (
          <div className="space-y-3">
            {teams.map(team => (
              <IntegratedTeamCard
                key={team.id}
                team={team}
                bots={bots}
                deploying={deployingIds.has(team.id)}
                onDeploy={() => deployTeam(team)}
                onEdit={() => { setEditingTeam(team); setShowTeamForm(true) }}
                onDelete={() => deleteTeam(team)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* ── Agents ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Agents</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Individual hotel personas that live in the hotel</p>
          </div>
          {!showPersonaForm && (
            <button
              onClick={() => { setEditingPersona(null); setShowPersonaForm(true) }}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3 h-3" /> Add Agent
            </button>
          )}
        </div>

        {/* New agent form — only shown when adding, not editing */}
        {showPersonaForm && !editingPersona && (
          <PersonaEditor
            persona={null}
            bots={bots}
            onSave={savePersona}
            onCancel={() => { setShowPersonaForm(false); setEditingPersona(null) }}
          />
        )}

        {personas.length === 0 && !showPersonaForm ? (
          <EmptyState icon={Bot} title="No agents yet" description="Add your first hotel agent to get started" />
        ) : (
          <div className="space-y-3">
            {personas.map(persona => (
              <PersonaCard
                key={persona.id}
                persona={persona}
                bots={bots}
                expanded={editingPersona?.id === persona.id}
                onEdit={() => { setEditingPersona(persona); setShowPersonaForm(true) }}
                onCollapse={() => { setShowPersonaForm(false); setEditingPersona(null) }}
                onSave={savePersona}
                onDelete={() => deletePersona(persona)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Integrated Team Card ───────────────────────────────────────────────────

function IntegratedTeamCard({ team, bots = [], deploying, onDeploy, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 p-4">
        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
          <Users className="w-4 h-4 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground">{team.name}</p>
          {team.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{team.description}</p>
          )}
        </div>
        <span className="text-xs text-muted-foreground flex-shrink-0">{team.member_count || 0} agent{team.member_count !== 1 ? 's' : ''}</span>
        <button
          onClick={() => setExpanded(e => !e)}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <button onClick={onEdit} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0">
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDeploy}
          disabled={deploying}
          className="flex items-center gap-1.5 text-xs bg-violet-600 text-white px-3 py-1.5 rounded-md hover:bg-violet-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          {deploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          {deploying ? 'Deploying…' : 'Deploy'}
        </button>
      </div>

      {/* Expanded members */}
      {expanded && (
        <IntegratedTeamMembers teamId={team.id} bots={bots} />
      )}
    </div>
  )
}

function IntegratedTeamMembers({ teamId, bots = [] }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    api(`/api/agents/teams/${teamId}`).then(d => setData(d.team)).catch(() => {})
  }, [teamId])

  if (!data) return (
    <div className="border-t border-border px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading members…
    </div>
  )

  if (!data.members?.length) return (
    <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
      No members assigned yet.
    </div>
  )

  return (
    <div className="border-t border-border divide-y divide-border">
      {data.members.map(m => {
        const figure = bots.find(b => b.name === m.bot_name)?.figure || null
        return (
          <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
            <HabboFigure figure={figure} size="sm" animate={true} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{m.name}</p>
              {m.role && <p className="text-xs text-muted-foreground">{m.role}</p>}
            </div>
            {m.bot_name && (
              <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
                {m.bot_name}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Integrated Team Form ───────────────────────────────────────────────────

function IntegratedTeamForm({ team, personas, onSave, onCancel }) {
  const [name, setName] = useState(team?.name || '')
  const [description, setDescription] = useState(team?.description || '')
  const [orchestratorPrompt, setOrchestratorPrompt] = useState(team?.orchestrator_prompt || '')
  const [executionMode, setExecutionMode] = useState(team?.execution_mode || 'concurrent')
  const parsedTasks = (() => { try { return JSON.parse(team?.tasks_json || '[]') } catch { return [] } })()
  const [tasks, setTasks] = useState(parsedTasks.length ? parsedTasks : [])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  function addTask() {
    const id = `t${tasks.length + 1}`
    setTasks(prev => [...prev, { id, title: '', description: '', assign_to: '', depends_on: [] }])
  }
  function updateTask(idx, field, value) {
    setTasks(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t))
  }
  function removeTask(idx) {
    setTasks(prev => prev.filter((_, i) => i !== idx).map((t, i) => ({ ...t, id: `t${i + 1}` })))
  }
  function toggleDepend(taskIdx, depId) {
    setTasks(prev => prev.map((t, i) => {
      if (i !== taskIdx) return t
      const deps = t.depends_on || []
      return { ...t, depends_on: deps.includes(depId) ? deps.filter(d => d !== depId) : [...deps, depId] }
    }))
  }

  async function handleSave() {
    if (!name.trim()) { setFormError('Name is required'); return }
    setSaving(true)
    setFormError(null)
    try {
      await onSave({ name: name.trim(), description: description.trim(), orchestrator_prompt: orchestratorPrompt.trim(), execution_mode: executionMode, tasks_json: tasks })
    } catch (e) {
      setFormError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="font-semibold text-sm text-foreground">{team ? 'Edit Team' : 'New Team'}</h3>

      {formError && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {formError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Team Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Sprint Team"
            className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Description</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What does this team do?"
            className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Execution mode */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Execution Mode</label>
        <div className="flex gap-2 flex-wrap">
          {[
            { value: 'concurrent', label: 'Concurrent', desc: 'All agents start at the same time, work independently' },
            { value: 'sequential', label: 'Sequential', desc: 'Tasks run one after another, each waits for the previous' },
            { value: 'shared', label: 'Shared Task List', desc: 'Agents collaborate via a shared task file, claiming tasks as they go' },
          ].map(m => (
            <button
              key={m.value}
              type="button"
              title={m.desc}
              onClick={() => setExecutionMode(m.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${executionMode === m.value ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/40 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground/60">
          {executionMode === 'concurrent' && 'Each agent receives their full persona prompt and works independently. Best for parallel, independent tasks.'}
          {executionMode === 'sequential' && 'The orchestrator spawns one agent at a time and waits for each to finish before starting the next.'}
          {executionMode === 'shared' && 'The orchestrator writes a shared task JSON file. Agents read it, claim tasks matching their capabilities, and write results back. Best for team collaboration.'}
        </p>
      </div>

      {/* Task editor — shown for sequential + shared modes */}
      {executionMode !== 'concurrent' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground">
              Tasks
              <span className="ml-1.5 text-muted-foreground font-normal">— define the work steps for this team run</span>
            </label>
            <button
              type="button"
              onClick={addTask}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add task
            </button>
          </div>

          {tasks.length === 0 && (
            <div className="text-xs text-muted-foreground/60 border border-dashed border-border rounded-lg px-4 py-3 text-center">
              No tasks yet — click "Add task" to define what this team should do
            </div>
          )}

          <div className="space-y-2">
            {tasks.map((task, idx) => (
              <div key={task.id} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground w-6 shrink-0">{task.id}</span>
                  <input
                    value={task.title}
                    onChange={e => updateTask(idx, 'title', e.target.value)}
                    placeholder="Task title…"
                    className="flex-1 text-sm bg-background border border-border rounded px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <input
                    value={task.assign_to || ''}
                    onChange={e => updateTask(idx, 'assign_to', e.target.value)}
                    placeholder="Assign to (optional)"
                    className="w-36 text-sm bg-background border border-border rounded px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <button type="button" onClick={() => removeTask(idx)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <textarea
                  value={task.description || ''}
                  onChange={e => updateTask(idx, 'description', e.target.value)}
                  placeholder="What should the agent do? What input does it need?"
                  rows={2}
                  className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 resize-y"
                />
                {idx > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Depends on:</span>
                    {tasks.slice(0, idx).map(dep => (
                      <button
                        key={dep.id}
                        type="button"
                        onClick={() => toggleDepend(idx, dep.id)}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${(task.depends_on || []).includes(dep.id) ? 'bg-primary/20 border-primary/50 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'}`}
                      >
                        {dep.id}: {dep.title || 'untitled'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {tasks.length > 0 && (
            <p className="text-xs text-muted-foreground/60">
              {executionMode === 'shared' && 'Use {{TASKS}} in the orchestrator prompt to inject the task file write instructions.'}
              {executionMode === 'sequential' && 'Use {{TASKS}} in the orchestrator prompt to inject the ordered task list.'}
            </p>
          )}
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Orchestrator Prompt <span className="text-muted-foreground font-normal">(optional — auto-generated if empty)</span></label>
        <div className="flex flex-wrap gap-2 mb-1.5">
          {[
            { tag: '{{ROOM_ID}}', desc: 'Hotel room number (e.g. 201)' },
            { tag: '{{TRIGGERED_BY}}', desc: 'Who triggered the run (Habbo username)' },
            { tag: '{{TASKS}}', desc: 'Rendered task instructions (sequential steps or shared task list JSON)' },
            { tag: '{{PERSONAS}}', desc: 'All team members — names, roles, bots & instructions' },
          ].map(({ tag, desc }) => (
            <button
              key={tag}
              type="button"
              title={desc}
              onClick={() => setOrchestratorPrompt(p => p + (p.endsWith('\n') || !p ? '' : '\n') + tag)}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/60 border border-border hover:border-primary/50 hover:bg-muted transition-colors group"
            >
              <code className="text-xs text-primary font-mono">{tag}</code>
              <span className="text-xs text-muted-foreground group-hover:text-foreground/70 hidden sm:inline">{desc}</span>
            </button>
          ))}
        </div>
        <MarkdownEditor
          value={orchestratorPrompt}
          onChange={setOrchestratorPrompt}
          placeholder="You are the orchestrator for this team. Launch all agents CONCURRENTLY…"
          rows={16}
        />
        <p className="text-xs text-muted-foreground/60 mt-1">
          Variables are replaced by the system before Claude sees the prompt — they are not filled in by AI.
          <code className="text-primary/70 ml-1">{'{{PERSONAS}}'}</code> expands to all team members with their full instructions.
        </p>
      </div>

      {personas.length > 0 && (
        <div className="text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">
          💡 After saving, assign agents to this team via the team detail page. Currently available: {personas.map(p => p.name).join(', ')}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="text-xs border border-border px-4 py-2 rounded-md hover:bg-secondary transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Persona Card ──────────────────────────────────────────────────────────

function PersonaCard({ persona, bots = [], expanded, onEdit, onCollapse, onSave, onDelete }) {
  const figure = persona.figure || bots.find(b => b.name === persona.bot_name)?.figure || null
  return (
    <div className={`rounded-xl border bg-card transition-colors ${expanded ? 'border-primary/40' : 'border-border'}`}>
      {/* Card row — always visible */}
      <div className="flex items-center gap-4 p-4">
        <HabboFigure figure={figure} size="md" animate={true} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground">{persona.name}</p>
          {persona.role && <p className="text-xs text-muted-foreground mt-0.5">{persona.role}</p>}
          {!expanded && (persona.prompt || persona.description) && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {persona.prompt || persona.description}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {persona.bot_name && (
            <span className="inline-flex items-center text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
              {persona.bot_name}
            </span>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={expanded ? onCollapse : onEdit}
            className={`p-1.5 rounded-md transition-colors ${expanded ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
            title={expanded ? 'Collapse' : 'Edit agent'}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete agent"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Inline edit — expands below */}
      {expanded && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3">
          <PersonaEditor
            persona={persona}
            bots={bots}
            onSave={onSave}
            onCancel={onCollapse}
          />
        </div>
      )}
    </div>
  )
}

// ── Persona Editor ────────────────────────────────────────────────────────

function PersonaEditor({ persona, bots, onSave, onCancel }) {
  const [name, setName] = useState(persona?.name || '')
  const [role, setRole] = useState(persona?.role || '')
  const [capabilities, setCapabilities] = useState(persona?.capabilities || '')
  const [prompt, setPrompt] = useState(persona?.prompt || persona?.description || '')
  const [botName, setBotName] = useState(persona?.bot_name || '')
  const [figure, setFigure] = useState(persona?.figure || '')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  async function handleSave() {
    if (!name.trim()) { setFormError('Name is required'); return }
    setSaving(true)
    setFormError(null)
    try {
      await onSave({
        name: name.trim(),
        role: role.trim(),
        capabilities: capabilities.trim(),
        prompt: prompt.trim(),
        bot_name: botName,
        figure: figure.trim(),
      })
    } catch (e) {
      setFormError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {!persona && <h3 className="font-semibold text-sm text-foreground">New Agent</h3>}

      {formError && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {formError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Agent name"
            className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Job Title</label>
          <input
            value={role}
            onChange={e => setRole(e.target.value)}
            placeholder="e.g. Senior backend developer"
            className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">
          Capabilities
          <span className="ml-1.5 text-muted-foreground font-normal">— what work this agent can do (used by orchestrator to assign tasks)</span>
        </label>
        <textarea
          value={capabilities}
          onChange={e => setCapabilities(e.target.value)}
          placeholder={'- Backend API development (Node.js, TypeScript)\n- Database schema design and SQL queries\n- Code review and architecture decisions\n- Writing and running tests'}
          rows={5}
          className="w-full text-sm bg-background border border-border rounded-md px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono resize-y"
        />
        <p className="text-xs text-muted-foreground/60">Use bullet points. The orchestrator reads this to decide who gets which tasks.</p>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">
          Personality &amp; Hotel Setup
          <span className="ml-1.5 text-muted-foreground font-normal">— character, behaviour, bot setup instructions</span>
        </label>
        <MarkdownEditor
          value={prompt}
          onChange={setPrompt}
          placeholder="You are [Name], a ... at The Pixel Office. Personality: ...&#10;&#10;Setup:&#10;1. Call list_bots to find your bot&#10;2. Deploy to room {{ROOM_ID}}&#10;3. Use talk_bot to narrate your work"
          rows={14}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Bot</label>
          <select
            value={botName}
            onChange={e => setBotName(e.target.value)}
            className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Select bot…</option>
            {bots.map(b => (
              <option key={b.id ?? b.name} value={b.name}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Habbo Figure</label>
          <input
            value={figure}
            onChange={e => setFigure(e.target.value)}
            placeholder="hr-115-42.hd-180-1.ch-…"
            className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
          />
        </div>
      </div>

      {/* Preview figure */}
      {figure && (
        <div className="flex items-center gap-3">
          <HabboFigure figure={figure} size="md" animate={true} />
          <p className="text-xs text-muted-foreground">Figure preview</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="text-xs border border-border px-4 py-2 rounded-md hover:bg-secondary transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Shared UI Primitives ──────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="w-6 h-6 animate-spin mr-2" />
      <span className="text-sm">Loading…</span>
    </div>
  )
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive">
      <AlertCircle className="w-5 h-5 flex-shrink-0" />
      <div className="flex-1 text-sm">{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs border border-destructive/40 px-3 py-1.5 rounded-md hover:bg-destructive/10 transition-colors flex-shrink-0"
        >
          Retry
        </button>
      )}
    </div>
  )
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-sm text-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>}
    </div>
  )
}
