import { Loader2, Wifi, WifiOff, AlertTriangle } from 'lucide-react'

export function McpHealthBadge({ health }) {
  if (!health) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">
        <Loader2 className="w-3 h-3 animate-spin" /> checking…
      </span>
    )
  }
  const ok = health.ok === true
  const reachable = health.reachable !== false
  const rcon = health.checks?.rcon
  const db = health.checks?.db
  let tone, label, Icon
  if (ok) {
    tone = 'bg-success/10 text-success border-success/20'
    label = 'Connected'
    Icon = Wifi
  } else if (reachable) {
    tone = 'bg-warning/10 text-warning border-warning/20'
    const failing = []
    if (rcon && !rcon.ok) failing.push('emulator')
    if (db && !db.ok) failing.push('database')
    label = failing.length ? `${failing.join(' + ')} down` : 'Degraded'
    Icon = AlertTriangle
  } else {
    tone = 'bg-destructive/10 text-destructive border-destructive/20'
    label = 'Offline'
    Icon = WifiOff
  }
  const title = [
    rcon ? `RCON ${rcon.ok ? 'ok' : 'fail'}${typeof rcon.latency_ms === 'number' ? ` (${rcon.latency_ms}ms)` : ''}${rcon.error ? `: ${rcon.error}` : ''}` : null,
    db ? `DB ${db.ok ? 'ok' : 'fail'}${typeof db.latency_ms === 'number' ? ` (${db.latency_ms}ms)` : ''}${db.error ? `: ${db.error}` : ''}` : null,
    health.error ? `Error: ${health.error}` : null,
    typeof health.uptime_s === 'number' ? `Uptime ${health.uptime_s}s` : null,
  ].filter(Boolean).join(' · ')
  return (
    <span title={title || undefined}
      className={`inline-flex items-center gap-1 text-[10px] border rounded px-1.5 py-0.5 ${tone}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  )
}
