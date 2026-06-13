import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Loader2, FileText, ChevronLeft } from 'lucide-react'
import { api } from '../../utils/api'

function RunReportRow({ report, isOpen, onToggle }) {
  const startedAt = new Date(report.started_at)
  const createdAt = new Date(report.created_at)
  const durationMs = createdAt - startedAt
  const durationStr = durationMs > 0
    ? durationMs > 60000
      ? `${Math.round(durationMs / 60000)}m`
      : `${Math.round(durationMs / 1000)}s`
    : null

  const costStr = report.cost_usd > 0
    ? `$${Number(report.cost_usd).toFixed(3)}`
    : null

  const dateStr = startedAt.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })
  const timeStr = startedAt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{report.team_name || 'Team run'}</p>
          <p className="text-xs text-muted-foreground truncate">
            Room {report.room_id} · {dateStr} {timeStr}
            {report.triggered_by ? ` · by ${report.triggered_by}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {costStr && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{costStr}</span>}
          {durationStr && <span className="text-xs text-muted-foreground">{durationStr}</span>}
          <ChevronLeft className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isOpen ? '-rotate-90' : 'rotate-180'}`} />
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border px-4 py-4">
          <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed
            [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2
            [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2
            [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-3 [&_h3]:mb-1
            [&_p]:text-muted-foreground [&_p]:mb-2
            [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:text-muted-foreground
            [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:text-muted-foreground
            [&_li]:mb-1
            [&_strong]:text-foreground [&_strong]:font-semibold
            [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono
            [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:text-xs [&_pre]:font-mono
            [&_pre_code]:bg-transparent [&_pre_code]:p-0
            [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs
            [&_th]:text-left [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted [&_th]:font-medium
            [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:text-muted-foreground
            [&_hr]:border-border">
            <ReactMarkdown>{report.report_md}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}

export function RunReportsSection({ me }) {
  const [reports, setReports] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    api('/api/agents/run-reports?limit=30')
      .then(d => { setReports(d.reports || []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return (
    <section className="space-y-4">
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    </section>
  )

  if (error) return (
    <section className="space-y-4">
      <p className="text-sm text-destructive py-8 text-center">{error}</p>
    </section>
  )

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-semibold text-foreground">Run Reports</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Full results from every agent team run</p>
      </div>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <FileText className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">No reports yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">Reports are saved automatically at the end of each team run</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map(report => (
            <RunReportRow
              key={report.id}
              report={report}
              isOpen={selected === report.id}
              onToggle={() => setSelected(selected === report.id ? null : report.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
