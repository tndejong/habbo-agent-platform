import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../utils/api'
import {
  MessageSquarePlus, X, ChevronLeft, Check, Loader2,
  AlertCircle, Bug, Lightbulb, HelpCircle, MessageSquare,
} from 'lucide-react'

// ── Step config (data-driven branching) ───────────────────────────────────────

const TYPE_OPTIONS = [
  { label: '🐛 Bug', value: 'bug', icon: Bug },
  { label: '💡 Idea', value: 'idea', icon: Lightbulb },
  { label: '❓ Confused', value: 'confused', icon: HelpCircle },
  { label: '💬 Other', value: 'other', icon: MessageSquare },
]

const PAGE_OPTIONS = [
  { label: 'Home', value: 'home' },
  { label: 'Agents', value: 'agents' },
  { label: 'Marketplace', value: 'marketplace' },
  { label: 'Reports', value: 'reports' },
  { label: 'Integrations', value: 'integrations' },
  { label: 'Settings', value: 'settings' },
  { label: 'Other', value: 'other' },
]

const DETAIL_OPTIONS_BY_TYPE = {
  bug: ['App is broken', 'Workaround exists', 'Minor annoyance'],
  idea: ['Big improvement', 'Nice to have', 'Just a thought'],
  confused: ['Unclear button / action', 'Whole flow unclear', 'Missing info', 'Other'],
  other: null, // skip detail step
}

const STEPS = [
  {
    key: 'type',
    question: 'What kind of feedback?',
    options: TYPE_OPTIONS.map(o => ({ label: o.label, value: o.value })),
  },
  {
    key: 'page',
    question: 'Which area of the app?',
    options: PAGE_OPTIONS,
  },
  {
    key: 'detail',
    question: 'How would you describe it?',
    optionsByType: DETAIL_OPTIONS_BY_TYPE,
  },
  {
    key: 'message',
    question: 'Anything to add?',
  },
]

function getVisibleSteps(answers) {
  return STEPS.filter(step => {
    if (step.key !== 'detail') return true
    // Skip detail step when type is 'other' or has no options
    const opts = DETAIL_OPTIONS_BY_TYPE[answers.type]
    return opts !== null && opts !== undefined
  })
}

// ── Floating Widget ────────────────────────────────────────────────────────────

export function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState(null)
  const cardRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (cardRef.current && !cardRef.current.contains(e.target)) close()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function close() {
    setOpen(false)
    setTimeout(reset, 300)
  }

  function reset() {
    setStep(0)
    setAnswers({})
    setDone(false)
    setErr(null)
    setSubmitting(false)
  }

  function pickOption(key, value) {
    const next = { ...answers, [key]: value }
    setAnswers(next)
    const visible = getVisibleSteps(next)
    if (step + 1 < visible.length) {
      setStep(s => s + 1)
    }
    // If it was the last auto-advance step and next is message step, stay (user types + sends)
  }

  function goBack() {
    if (step === 0) { close(); return }
    // Remove the answer for current step before going back
    const visible = getVisibleSteps(answers)
    const currentKey = visible[step]?.key
    setAnswers(prev => { const n = { ...prev }; delete n[currentKey]; return n })
    setStep(s => s - 1)
  }

  async function submit(message) {
    setSubmitting(true)
    setErr(null)
    try {
      await api('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          type: answers.type || 'other',
          page: answers.page || '',
          detail: answers.detail || '',
          message: message || '',
          answers,
        }),
      })
      setDone(true)
      setTimeout(() => { close() }, 1800)
    } catch (e) {
      setErr(e.message)
      setSubmitting(false)
    }
  }

  const visible = getVisibleSteps(answers)
  const totalSteps = visible.length
  const currentStep = visible[step]

  const card = open ? (
    <div
      ref={cardRef}
      className="fixed bottom-28 right-4 z-50 md:bottom-20 md:right-6 w-72 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
      style={{ animation: 'fadeSlideUp 0.18s ease-out' }}
    >
      {done ? (
        <SuccessState />
      ) : (
        <>
          <CardHeader
            step={step}
            totalSteps={totalSteps}
            question={currentStep?.question}
            onBack={goBack}
            onClose={close}
          />
          <div className="px-4 py-3">
            {currentStep?.key === 'message' ? (
              <MessageStep
                onSend={submit}
                submitting={submitting}
                err={err}
              />
            ) : (
              <OptionStep
                options={
                  currentStep?.optionsByType
                    ? (currentStep.optionsByType[answers.type] || []).map(v => ({ label: v, value: v }))
                    : currentStep?.options || []
                }
                selected={answers[currentStep?.key]}
                onPick={val => pickOption(currentStep.key, val)}
              />
            )}
          </div>
        </>
      )}
    </div>
  ) : null

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => { setOpen(v => !v); if (!open) reset() }}
        className="fixed bottom-16 right-4 z-40 md:bottom-6 md:right-6 flex items-center gap-1.5 h-9 px-4 rounded-full bg-primary text-primary-foreground text-xs font-medium shadow-lg hover:bg-primary/90 transition-all duration-150 hover:shadow-xl"
        title="Give feedback"
      >
        <MessageSquarePlus className="w-3.5 h-3.5" />
        Feedback
      </button>

      {/* Card via portal so sidebar backdrop-blur never clips it */}
      {createPortal(card, document.body)}

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}

function CardHeader({ step, totalSteps, question, onBack, onClose }) {
  return (
    <div className="px-4 pt-3 pb-2 border-b border-border flex items-start gap-2">
      <button
        onClick={onBack}
        className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        title="Back"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground leading-snug">{question}</p>
        {/* Progress dots */}
        <div className="flex items-center gap-1 mt-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={`inline-block rounded-full transition-all duration-150 ${
                i < step
                  ? 'w-3.5 h-1.5 bg-primary'
                  : i === step
                    ? 'w-3.5 h-1.5 bg-primary/60'
                    : 'w-1.5 h-1.5 bg-border'
              }`}
            />
          ))}
        </div>
      </div>
      <button
        onClick={onClose}
        className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        title="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function OptionStep({ options, selected, onPick }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onPick(opt.value)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-100 ${
            selected === opt.value
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background border-border text-foreground hover:border-primary/50 hover:bg-primary/5'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function MessageStep({ onSend, submitting, err }) {
  const [msg, setMsg] = useState('')
  return (
    <div className="space-y-2">
      <textarea
        value={msg}
        onChange={e => setMsg(e.target.value)}
        placeholder="Optional — add more detail…"
        rows={3}
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
      />
      {err && (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {err}
        </div>
      )}
      <button
        onClick={() => onSend(msg)}
        disabled={submitting}
        className="w-full h-8 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
      >
        {submitting
          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
          : <><Check className="w-3.5 h-3.5" /> Send Feedback</>
        }
      </button>
    </div>
  )
}

function SuccessState() {
  return (
    <div className="px-4 py-8 flex flex-col items-center gap-3 text-center">
      <div className="w-10 h-10 rounded-full bg-success/15 flex items-center justify-center">
        <Check className="w-5 h-5 text-success" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Thanks for your feedback!</p>
        <p className="text-xs text-muted-foreground mt-0.5">We'll use it to improve the platform.</p>
      </div>
    </div>
  )
}

// ── Developer Feedback View ────────────────────────────────────────────────────

const TYPE_LABELS = {
  bug: { label: '🐛 Bug', cls: 'bg-destructive/10 text-destructive border-destructive/20' },
  idea: { label: '💡 Idea', cls: 'bg-primary/10 text-primary border-primary/20' },
  confused: { label: '❓ Confused', cls: 'bg-warning/10 text-warning border-warning/20' },
  other: { label: '💬 Other', cls: 'bg-secondary text-muted-foreground border-border' },
}

const STATUS_LABELS = {
  open: { label: 'Open', cls: 'bg-success/10 text-success border-success/20' },
  reviewed: { label: 'Reviewed', cls: 'bg-primary/10 text-primary border-primary/20' },
  resolved: { label: 'Resolved', cls: 'bg-muted text-muted-foreground border-border' },
}

export function FeedbackView() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState({})
  const [notes, setNotes] = useState({}) // id → admin_note input

  async function load() {
    setLoading(true)
    try {
      const d = await api(`/api/feedback${filter !== 'all' ? `?status=${filter}` : ''}`)
      setItems(d.feedback || [])
    } catch { /* non-blocking */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filter])

  async function updateStatus(id, status) {
    setBusy(prev => ({ ...prev, [id]: true }))
    try {
      await api(`/api/feedback/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, admin_note: notes[id] ?? '' }),
      })
      setItems(prev => prev.map(i => i.id === id ? { ...i, status, admin_note: notes[id] ?? i.admin_note } : i))
    } catch { /* ignore */ }
    finally { setBusy(prev => ({ ...prev, [id]: false })) }
  }

  async function saveNote(id) {
    setBusy(prev => ({ ...prev, [`note-${id}`]: true }))
    try {
      await api(`/api/feedback/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ admin_note: notes[id] ?? '' }),
      })
      setItems(prev => prev.map(i => i.id === id ? { ...i, admin_note: notes[id] ?? i.admin_note } : i))
    } catch { /* ignore */ }
    finally { setBusy(prev => ({ ...prev, [`note-${id}`]: false })) }
  }

  const FILTERS = ['all', 'open', 'reviewed', 'resolved']

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <MessageSquarePlus className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-foreground">Feedback</h1>
          <p className="text-xs text-muted-foreground">User-submitted feedback for improving the platform</p>
        </div>
        <span className="ml-auto text-[10px] bg-primary/10 text-primary border border-primary/20 rounded px-1.5 py-0.5 font-medium">Developer</span>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize ${
              filter === f
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <MessageSquarePlus className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No feedback yet{filter !== 'all' ? ` with status "${filter}"` : ''}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const typeMeta = TYPE_LABELS[item.type] || TYPE_LABELS.other
            const statusMeta = STATUS_LABELS[item.status] || STATUS_LABELS.open
            const note = notes[item.id] ?? item.admin_note ?? ''
            return (
              <div key={item.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="p-4 space-y-3">
                  {/* Row 1 — meta */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">{item.username}</span>
                    <span className="text-xs text-muted-foreground">{item.email}</span>
                    <span className={`ml-auto text-[10px] font-medium border rounded px-1.5 py-0.5 ${typeMeta.cls}`}>
                      {typeMeta.label}
                    </span>
                    {item.page && (
                      <span className="text-[10px] font-medium border border-border rounded px-1.5 py-0.5 bg-secondary text-muted-foreground capitalize">
                        {item.page}
                      </span>
                    )}
                    <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${statusMeta.cls}`}>
                      {statusMeta.label}
                    </span>
                  </div>

                  {/* Row 2 — detail tag */}
                  {item.detail && (
                    <p className="text-xs text-muted-foreground italic">"{item.detail}"</p>
                  )}

                  {/* Row 3 — message */}
                  {item.message && (
                    <p className="text-sm text-foreground bg-background/60 border border-border rounded-lg px-3 py-2">
                      {item.message}
                    </p>
                  )}

                  {/* Row 4 — timestamp */}
                  <p className="text-[10px] text-muted-foreground/60">
                    {new Date(item.created_at).toLocaleString()}
                  </p>

                  {/* Row 5 — admin note + actions */}
                  <div className="pt-1 border-t border-border space-y-2">
                    <div className="flex gap-2">
                      <input
                        value={note}
                        onChange={e => setNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                        placeholder="Add a developer note…"
                        className="flex-1 h-7 bg-background border border-border rounded-md px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <button
                        onClick={() => saveNote(item.id)}
                        disabled={!!busy[`note-${item.id}`]}
                        className="h-7 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        {busy[`note-${item.id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Save
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      {item.status !== 'reviewed' && (
                        <button
                          onClick={() => updateStatus(item.id, 'reviewed')}
                          disabled={!!busy[item.id]}
                          className="flex-1 h-7 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                        >
                          Mark reviewed
                        </button>
                      )}
                      {item.status !== 'resolved' && (
                        <button
                          onClick={() => updateStatus(item.id, 'resolved')}
                          disabled={!!busy[item.id]}
                          className="flex-1 h-7 rounded-md border border-success/30 text-xs text-success hover:bg-success/10 transition-colors disabled:opacity-50"
                        >
                          Resolve
                        </button>
                      )}
                      {item.status === 'resolved' && (
                        <button
                          onClick={() => updateStatus(item.id, 'open')}
                          disabled={!!busy[item.id]}
                          className="flex-1 h-7 rounded-md border border-border text-xs text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                        >
                          Re-open
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
