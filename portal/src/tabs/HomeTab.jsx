import { useState, useEffect } from 'react'
import {
  AlertCircle, AlertTriangle, ArrowUpCircle, Bell, Bot, CheckCircle,
  ChevronRight, ClipboardList, Home, Hotel, Key,
  Mic, Settings, Users, Wifi, WifiOff,
} from 'lucide-react'
import { api } from '../utils/api'
import { useHotel } from '../HotelContext'
import { HabboFigure } from '../components/HabboFigure'

// ── Home Tab ──────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { label: 'My Agents',    description: 'Create and manage your AI agents', icon: Bot,     tab: 'agents'   },
  { label: 'Voice Chat',   description: 'Talk to your agents using voice',  icon: Mic,     tab: 'voice'   },
  { label: 'Active Bots',  description: 'See bots working in the hotel',    icon: Hotel,   tab: 'online'   },
  { label: 'Settings',     description: 'Account and API key settings',     icon: Settings, tab: 'settings' },
]

export function HomeTab({ me, onNavigate }) {
  const { hotelStatus, habboConnected } = useHotel()
  const activeTier = me?.ai_tier || 'basic'
  const [upgradeRequest, setUpgradeRequest] = useState(null)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [teamWarning, setTeamWarning] = useState(null) // { teamName } | null

  useEffect(() => {
    if (activeTier !== 'basic') return
    api('/api/tier-requests/mine')
      .then(d => setUpgradeRequest(d.request || null))
      .catch(() => {})
  }, [activeTier])

  useEffect(() => {
    if (activeTier === 'basic' || !habboConnected) {
      setTeamWarning(null)
      return
    }
    Promise.all([api('/api/my/teams'), api('/api/agents/bots?mine=true')])
      .then(([td, bd]) => {
        const botNames = new Set((bd.bots || []).map(b => b.name?.toLowerCase()).filter(Boolean))
        const bad = (td.teams || []).find(t =>
          (t.members || []).some(m => !m.bot_name?.trim() || !botNames.has(m.bot_name.toLowerCase()))
        )
        setTeamWarning(bad ? { teamName: bad.name } : null)
      })
      .catch(() => {})
  }, [activeTier, habboConnected])

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {/* Upgrade CTA for basic users */}
      {activeTier === 'basic' && (
        upgradeRequest?.status === 'pending' ? (
          <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
            <Bell className="w-4 h-4 text-warning shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-warning/80">Upgrade request pending</p>
              <p className="text-xs text-warning/60 mt-0.5">Your request for <span className="capitalize">{upgradeRequest.requested_tier}</span> tier is being reviewed. We'll email you when it's decided.</p>
            </div>
          </div>
        ) : upgradeRequest?.status === 'denied' ? (
          <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive/80">Upgrade request denied</p>
              {upgradeRequest.admin_note && <p className="text-xs text-destructive/60 mt-0.5">{upgradeRequest.admin_note}</p>}
            </div>
            <button onClick={() => setShowUpgradeModal(true)}
              className="shrink-0 text-xs h-8 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              Try again
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <ArrowUpCircle className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Want to deploy agent teams?</p>
              <p className="text-xs text-muted-foreground mt-0.5">Request a Pro upgrade to install and launch agents in the hotel.</p>
            </div>
            <button onClick={() => setShowUpgradeModal(true)}
              className="shrink-0 text-xs h-8 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              Request upgrade
            </button>
          </div>
        )
      )}

      {showUpgradeModal && (
        <UpgradeRequestModal
          onClose={() => setShowUpgradeModal(false)}
          onSubmitted={(req) => { setUpgradeRequest(req); setShowUpgradeModal(false) }}
        />
      )}

      {/* Welcome card — clickable → Settings */}
      {(() => {
        const setupSteps = activeTier === 'basic'
          ? [{ done: false, label: 'Upgrade to Pro to deploy agents', sub: 'Basic is read-only', tab: 'tiers' }]
          : [
              !me.has_anthropic_key && { done: false, label: 'Add your Anthropic API key', sub: 'Required for AI processing', tab: 'settings' },
              !me.has_mcp_token    && { done: false, label: 'Connect your Habbo MCP key',  sub: 'Required to deploy teams',    tab: 'settings' },
            ].filter(Boolean)

        const allDone = setupSteps.length === 0

        return (
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="w-full text-left bg-card border border-border rounded-2xl p-6 card-lift cursor-pointer hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center gap-5">
              {me.figure && (
                <div className="flex-shrink-0">
                  <HabboFigure figure={me.figure} size="md" animate={true} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-2xl font-semibold tracking-tight text-foreground truncate">Welcome back, {me.username}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Manage your hotel bots, agent teams, and MCP connections.
                </p>
                {me.habbo_username && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <Users className="w-3 h-3" />
                    Habbo: <span className="font-retro">{me.habbo_username}</span>
                  </p>
                )}
              </div>
              <Settings className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </div>

            {/* Setup checklist */}
            {!allDone && (
              <div className="mt-4 pt-4 border-t border-border space-y-2" onClick={e => e.stopPropagation()}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Setup required</p>
                {setupSteps.map((step, i) => (
                  <button
                    key={i}
                    onClick={() => onNavigate(step.tab)}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 bg-secondary/50 hover:bg-secondary transition-colors text-left"
                  >
                    <div className="w-5 h-5 rounded-full border-2 border-primary/40 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-primary/60">{i + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{step.label}</p>
                      <p className="text-xs text-muted-foreground">{step.sub}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {allDone && activeTier !== 'basic' && (
              <div className="mt-4 pt-4 border-t border-border" onClick={e => e.stopPropagation()}>
                {teamWarning ? (
                  <button
                    onClick={() => onNavigate('agents')}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 bg-warning/10 border border-warning/20 hover:bg-warning/15 transition-colors text-left"
                  >
                    <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-warning">Team needs attention</p>
                      <p className="text-xs text-warning/70 truncate">
                        <span className="font-medium">"{teamWarning.teamName}"</span> has agents missing a linked bot
                      </p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-warning/60 flex-shrink-0" />
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                    <p className="text-xs text-success font-medium">All set — your agents are ready to deploy.</p>
                  </div>
                )}
              </div>
            )}
          </button>
        )
      })()}

      {/* Status grid */}
      <div className="grid grid-cols-3 gap-4 stagger-children">
        <StatusCard
          label="Linked Habbo"
          value={me.habbo_username || '—'}
          icon={Users}
        />
        <StatusCard
          label="AI Tier"
          value={activeTier.charAt(0).toUpperCase() + activeTier.slice(1)}
          icon={Key}
          onClick={() => onNavigate('tiers')}
          hint="View all plans →"
        />
        <StatusCard
          label="Hotel"
          value={hotelStatus.loading ? 'Checking…' : hotelStatus.socket_online ? 'Online' : 'Offline'}
          icon={hotelStatus.socket_online ? Wifi : WifiOff}
          valueClassName={hotelStatus.socket_online ? 'text-success' : 'text-muted-foreground'}
          onClick={() => onNavigate('online')}
          hint="View online agents →"
        />
      </div>

      {/* Quick Links */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Links</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {QUICK_LINKS.map(({ label, description, icon: Icon, tab }) => (
            <button
              key={label}
              onClick={() => onNavigate(tab)}
              className="text-left bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all"
            >
              <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center mb-3">
                <Icon className="w-3.5 h-3.5 text-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function StatusCard({ label, value, icon: Icon, valueClassName = '', onClick, hint }) {
  const isClickable = !!onClick
  return (
    <div
      onClick={onClick}
      className={`border rounded-xl p-5 transition-colors ${
        isClickable
          ? 'bg-card border-border card-lift cursor-pointer hover:border-primary/40'
          : 'bg-muted/30 border-border/40 opacity-60 select-none'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${isClickable ? 'bg-secondary' : 'bg-muted/50'}`}>
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>
      <p className={`text-base sm:text-2xl font-semibold tracking-tight truncate ${isClickable ? 'text-foreground' : 'text-muted-foreground'} ${valueClassName}`}>{value}</p>
      {hint && <p className="text-xs text-primary mt-1">{hint}</p>}
    </div>
  )
}
