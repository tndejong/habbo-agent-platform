import { useState, useEffect, useCallback } from 'react'
import { AlertCircle, ClipboardList, Loader2, RefreshCw, X } from 'lucide-react'
import { api } from '../utils/api'
import { useToast } from '../ToastContext'
import { useEscapeKey } from '../utils/useEscapeKey'

export function UpgradeRequestModal({ onClose, onSubmitted }) {
  const [tier, setTier] = useState('pro')
  const [motivation, setMotivation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEscapeKey(onClose)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const data = await api('/api/tier-requests', {
        method: 'POST',
        body: JSON.stringify({ requested_tier: tier, motivation }),
      })
      onSubmitted({ id: data.id, requested_tier: tier, motivation, status: 'pending', admin_note: '' })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Request Tier Upgrade</h2>
            <p className="text-xs text-muted-foreground mt-1">Tell us what you'd like to do — an admin will review your request.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Requested tier</label>
            <div className="flex gap-2">
              {['pro', 'enterprise'].map(t => (
                <button
                  key={t} type="button"
                  onClick={() => setTier(t)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors capitalize ${
                    tier === t
                      ? 'bg-primary/10 border-primary/40 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Why do you need this? <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              rows={4}
              value={motivation}
              onChange={e => setMotivation(e.target.value)}
              placeholder="e.g. I want to deploy a Sprint Team in the hotel for daily stand-ups…"
              className="flex w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={busy}
              className="flex-1 h-10 rounded-lg border border-border text-sm hover:bg-secondary transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy ? 'Sending…' : 'Send Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Upgrade Requests Tab (developer) ─────────────────────────────────────

export function UpgradeRequestsTab({ onCountChange }) {
  const { showToast } = useToast()
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState({})
  const [reviewing, setReviewing] = useState(null) // { id, decision }
  const [adminNote, setAdminNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api(`/api/tier-requests?status=${filter}`)
      const list = d.requests || []
      setRequests(list)
      if (filter === 'pending') onCountChange(list.length)
    } catch { setRequests([]) }
    finally { setLoading(false) }
  }, [filter, onCountChange])

  useEffect(() => { load() }, [load])

  async function submitReview(requestId, decision) {
    setBusy(b => ({ ...b, [requestId]: true }))
    try {
      await api(`/api/tier-requests/${requestId}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, admin_note: adminNote }),
      })
      setReviewing(null)
      setAdminNote('')
      showToast(`Request ${decision}.`)
      load()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setBusy(b => ({ ...b, [requestId]: false }))
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-foreground">Tier Upgrade Requests</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Review and approve or deny user upgrade requests.</p>
        </div>
        <button onClick={load} aria-label="Refresh requests" className="text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2">
        {['pending', 'approved', 'denied'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors capitalize ${
              filter === s ? 'bg-primary/10 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
            }`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground">No {filter} requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req.id} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{req.username}</span>
                      <span className="text-xs text-muted-foreground">{req.email}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[11px] bg-muted px-2 py-0.5 rounded text-muted-foreground">
                        Current: <span className="font-medium text-foreground capitalize">{req.current_tier}</span>
                      </span>
                      <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded capitalize">
                        → {req.requested_tier}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {new Date(req.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {req.motivation && (
                      <p className="text-xs text-muted-foreground mt-2 italic leading-relaxed">"{req.motivation}"</p>
                    )}
                    {req.admin_note && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium not-italic text-foreground/80">Admin note:</span> {req.admin_note}
                      </p>
                    )}
                  </div>

                  {/* Status badge for non-pending */}
                  {req.status !== 'pending' && (
                    <span className={`shrink-0 text-xs px-2.5 py-1 rounded-lg capitalize ${
                      req.status === 'approved' ? 'bg-success/10 text-success border border-success/20' : 'bg-destructive/10 text-destructive border border-destructive/20'
                    }`}>
                      {req.status}
                    </span>
                  )}
                </div>

                {/* Approve/deny buttons for pending */}
                {req.status === 'pending' && (
                  reviewing?.id === req.id ? (
                    <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                      <input
                        placeholder={`Optional note to user (${reviewing.decision})…`}
                        value={adminNote}
                        onChange={e => setAdminNote(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => { setReviewing(null); setAdminNote('') }}
                          className="flex-1 h-8 text-xs rounded-md border border-border hover:bg-secondary transition-colors">
                          Cancel
                        </button>
                        <button
                          onClick={() => submitReview(req.id, reviewing.decision)}
                          disabled={!!busy[req.id]}
                          className={`flex-1 h-8 text-xs rounded-md font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 ${
                            reviewing.decision === 'approved'
                              ? 'bg-success/10 text-success border border-success/30 hover:bg-success/20'
                              : 'bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20'
                          }`}>
                          {busy[req.id] && <Loader2 className="w-3 h-3 animate-spin" />}
                          Confirm {reviewing.decision}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-border/60">
                      <button onClick={() => { setReviewing({ id: req.id, decision: 'denied' }); setAdminNote('') }}
                        className="flex-1 h-8 text-xs rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors">
                        Deny
                      </button>
                      <button onClick={() => { setReviewing({ id: req.id, decision: 'approved' }); setAdminNote('') }}
                        className="flex-1 h-8 text-xs rounded-md bg-success/10 text-success border border-success/30 hover:bg-success/20 transition-colors font-medium">
                        Approve
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
