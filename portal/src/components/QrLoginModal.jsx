import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { AlertCircle, Loader2, X } from 'lucide-react'
import { api } from '../utils/api'

const POLL_INTERVAL_MS = 2000

export function QrLoginModal({ onClose, onLogin }) {
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [shortCode, setShortCode] = useState('')
  const [expiresAt, setExpiresAt] = useState(null)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const ticketRef = useRef(null)
  const pollRef = useRef(null)

  async function start() {
    setError('')
    setExpired(false)
    setQrDataUrl(null)
    try {
      const data = await api('/api/auth/qr/start', { method: 'POST' })
      ticketRef.current = data.ticket
      setShortCode(data.short_code)
      setExpiresAt(Date.now() + data.expires_in * 1000)

      const target = new URL('/scan-login', window.location.origin)
      target.searchParams.set('ticket', data.ticket)
      setQrDataUrl(await QRCode.toDataURL(target.toString(), { width: 220, margin: 1 }))

      pollRef.current = setInterval(poll, POLL_INTERVAL_MS)
    } catch (err) {
      setError(err.message)
    }
  }

  async function poll() {
    const ticket = ticketRef.current
    if (!ticket) return
    if (expiresAt && Date.now() > expiresAt) {
      clearInterval(pollRef.current)
      setExpired(true)
      return
    }
    try {
      const data = await api(`/api/auth/qr/${ticket}/status`)
      if (data.status === 'confirmed') {
        clearInterval(pollRef.current)
        const meData = await api(`/api/auth/qr/${ticket}/exchange`, { method: 'POST' }).then(() => api('/api/auth/me'))
        onLogin(meData.user)
      } else if (data.status === 'expired' || data.status === 'used') {
        clearInterval(pollRef.current)
        setExpired(true)
      }
    } catch {
      clearInterval(pollRef.current)
      setExpired(true)
    }
  }

  useEffect(() => {
    start()
    return () => clearInterval(pollRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">Log in with QR code</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs text-left">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!error && !qrDataUrl && (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!error && qrDataUrl && (
          <>
            <div className="relative inline-block rounded-xl overflow-hidden border border-border">
              <img src={qrDataUrl} alt="QR login code" width={220} height={220} />
              {expired && (
                <div className="absolute inset-0 bg-background/90 flex items-center justify-center">
                  <button onClick={start} className="text-sm font-medium text-primary underline underline-offset-2">
                    Expired — refresh
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Scan with your phone's camera. Make sure the code shown there matches:
            </p>
            <p className="text-2xl font-semibold tracking-widest text-foreground mt-1">{shortCode}</p>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
