import { useState, useEffect } from 'react'
import { Terminal, Loader2, Download } from 'lucide-react'
import { can } from '../utils/permissions'
import { LogPanel } from '../components/AgentDashboard'

export function DevToolsView({ me }) {
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
