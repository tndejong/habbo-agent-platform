import { Hotel } from 'lucide-react'
import { useHotel } from '../HotelContext'
import { BotsTab } from './BotsTab'

// ── Hotel Tab ─────────────────────────────────────────────────────────────

export function HotelTab({ me, figureTypes = {} }) {
  const { habboConnected } = useHotel()

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">

      {/* Bot management — only shown when hotel is connected */}
      {habboConnected && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Hotel className="w-3.5 h-3.5 opacity-70" />
            Bots
          </div>
          <BotsTab figureTypes={figureTypes} />
        </section>
      )}

    </div>
  )
}
