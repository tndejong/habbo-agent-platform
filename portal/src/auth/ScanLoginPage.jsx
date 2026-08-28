import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle, Loader2, MonitorSmartphone } from 'lucide-react'
import { api } from '../utils/api'

export function ScanLoginPage() {
  const [ticket] = useState(() => new URLSearchParams(window.location.search).get('ticket') || '')
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!ticket) { setError('Missing login ticket.'); return }
    api(`/api/auth/qr/${ticket}/info`)
      .then(setInfo)
      .catch(err => setError(err.message))
  }, [ticket])

  async function handleApprove() {
    setBusy(true); setError('')
    try {
      await api(`/api/auth/qr/${ticket}/approve`, { method: 'POST' })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-2xl text-center">
        <MonitorSmartphone className="w-8 h-8 text-primary mx-auto mb-3" />
        <h1 className="text-lg font-semibold text-foreground">Log in on another device?</h1>

        {error && (
          <div className="flex items-start gap-2 p-3 mt-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm text-left">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {done && (
          <div className="flex items-start gap-2 p-3 mt-4 rounded-lg bg-success/10 border border-success/20 text-success text-sm text-left">
            <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Confirmed. The other device is logging in — you can close this page.</span>
          </div>
        )}

        {!error && !done && !info && (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!error && !done && info && (
          <>
            <p className="text-sm text-muted-foreground mt-3">
              Make sure this code matches what's shown on the other screen:
            </p>
            <p className="text-2xl font-semibold tracking-widest text-foreground mt-1">{info.short_code}</p>
            <p className="text-xs text-muted-foreground mt-3 break-words">
              Requested from IP {info.requested_ip || 'unknown'}
              {info.requested_user_agent ? ` · ${info.requested_user_agent}` : ''}
            </p>
            <button onClick={handleApprove} disabled={busy}
              className="w-full h-10 mt-5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy ? 'Confirming...' : 'Confirm login'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
