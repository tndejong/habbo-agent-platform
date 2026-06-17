import { useState, useEffect, useRef, useMemo } from 'react'
import { Terminal, RefreshCw } from 'lucide-react'

// AgentDashboard component removed — orchestration logic lives in OrchestrationLayout.
// This module only exports LogPanel, used by DevToolsView.

// ── Log Panel ─────────────────────────────────────────────────────────────

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
  habbo:     { label: 'Habbo MCP',       color: 'text-amber-400',    bg: 'bg-amber-500/10 border-amber-500/20',    toolColor: 'text-amber-300'   },
  atlassian: { label: 'Jira/Confluence', color: 'text-blue-400',     bg: 'bg-blue-500/10 border-blue-500/20',      toolColor: 'text-blue-300'    },
  notion:    { label: 'Notion',          color: 'text-neutral-300',  bg: 'bg-neutral-500/10 border-neutral-500/20', toolColor: 'text-neutral-300' },
  resend:    { label: 'Email',           color: 'text-emerald-400',  bg: 'bg-emerald-500/10 border-emerald-500/20', toolColor: 'text-emerald-300' },
  web:       { label: 'Web',             color: 'text-sky-400',      bg: 'bg-sky-500/10 border-sky-500/20',         toolColor: 'text-sky-300'     },
  mcp:       { label: 'MCP',             color: 'text-violet-400',   bg: 'bg-violet-500/10 border-violet-500/20',   toolColor: 'text-violet-300'  },
}

function extractToolName(line) {
  const m = line.match(/\[tool→\]\s+(\S+)/)
  return m ? m[1] : null
}

function toolToIntegrationKey(toolName) {
  if (!toolName) return null
  const mcpMatch = toolName.match(/^mcp__(.+?)__/)
  if (mcpMatch) {
    const server = mcpMatch[1].toLowerCase()
    for (const [keyword, key] of MCP_SERVER_INTEGRATION_MAP) {
      if (server.includes(keyword)) return key
    }
    return 'mcp'
  }
  return null
}

function logColor(line) {
  if (line.includes('[tool→]')) {
    const intKey = toolToIntegrationKey(extractToolName(line))
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

  const configuredServers = useMemo(() => {
    const sessionLine = lines.find(l => l.includes('[session]'))
    const match = sessionLine?.match(/configured:\s*(.+)/)
    if (!match) return []
    return match[1].split(',').map(s => s.trim()).filter(Boolean)
  }, [lines])

  const usedIntegrations = useMemo(() => {
    const seen = new Set()
    for (const line of lines) {
      if (!line.includes('[tool→]')) continue
      const intKey = toolToIntegrationKey(extractToolName(line))
      if (intKey) seen.add(intKey)
    }
    return [...seen]
  }, [lines])

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

        {configuredServers.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-violet-400/60 uppercase tracking-wider font-medium">MCP</span>
            {configuredServers.map(server => (
              <span key={server} className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border bg-violet-500/10 border-violet-500/20 text-violet-400">
                {server}
              </span>
            ))}
          </div>
        )}

        {usedIntegrations.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {usedIntegrations.map(key => {
              const meta = INTEGRATION_DISPLAY[key]
              const count = toolCallCounts[key] || 0
              return (
                <span key={key} title={`${count} ${key} tool call${count !== 1 ? 's' : ''}`}
                  className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${meta.bg} ${meta.color}`}>
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

