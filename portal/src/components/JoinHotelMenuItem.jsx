import { useState } from 'react'
import { Hotel, Loader2 } from 'lucide-react'
import { api } from '../utils/api'
import { useHotel } from '../HotelContext'
import { useToast } from '../ToastContext'

export function JoinHotelMenuItem({ onClose }) {
  const { habboConnected } = useHotel()
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)

  if (!habboConnected) return null

  async function handleClick() {
    setBusy(true)
    try {
      const data = await api('/api/hotel/join', { method: 'POST' })
      window.open(data.login_url, '_blank')
      onClose?.()
    } catch (e) {
      showToast(e.message || 'Could not join hotel.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
    >
      {busy
        ? <Loader2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 animate-spin" />
        : <Hotel className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
      Join Hotel
    </button>
  )
}
