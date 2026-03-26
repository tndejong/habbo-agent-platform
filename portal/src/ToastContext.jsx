import { createContext, useContext, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'

const ToastContext = createContext({ showToast: () => {} })

const ICONS = {
  success: CheckCircle,
  error:   AlertCircle,
  warning: AlertTriangle,
  info:    Info,
}

const STYLES = {
  success: 'border-success/30 text-success',
  error:   'border-destructive/30 text-destructive',
  warning: 'border-warning/30 text-warning',
  info:    'border-primary/30 text-primary',
}

function Toast({ id, message, type = 'success', onDismiss }) {
  const Icon = ICONS[type] ?? CheckCircle
  return (
    <div
      className={`flex items-center gap-3 bg-card border rounded-xl px-4 py-3 shadow-lg text-sm w-80 max-w-[calc(100vw-3rem)] ${STYLES[type] ?? STYLES.success}`}
      style={{ animation: 'toast-slide-in 0.18s ease-out' }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 text-foreground leading-snug">{message}</span>
      <button
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null
  return createPortal(
    <div className="fixed bottom-6 left-6 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <Toast {...t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>,
    document.body
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message, type = 'success', duration = 3500) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
