import { useState, useEffect } from 'react'
import { Bell, Check, ChevronLeft, Minus } from 'lucide-react'
import { api } from '../utils/api'
import { UpgradeRequestModal } from './UpgradeRequests'


// ── Tiers Tab ─────────────────────────────────────────────────────────────

const TIER_PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: 'Free',
    description: 'Read-only access to explore the platform.',
    features: [
      { label: 'Browse Marketplace',                 included: true  },
      { label: 'View agent teams (read-only)',        included: true  },
      { label: 'View Bots list',                     included: true  },
      { label: 'Create & deploy agent teams',        included: false },
      { label: 'Custom agent personas',              included: false },
      { label: 'MCP integrations',                   included: false },
      { label: 'Anthropic API key support',          included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'On request',
    description: 'Full access to deploy and manage hotel agents.',
    features: [
      { label: 'Everything in Basic',               included: true  },
      { label: 'Create & deploy agent teams',       included: true  },
      { label: 'Install teams from Marketplace',    included: true  },
      { label: 'Custom agent personas',             included: true  },
      { label: 'MCP integrations',                  included: true  },
      { label: 'Anthropic API key support',         included: true  },
      { label: 'Custom agent logic',                included: false },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    description: 'Tailored solutions for large-scale hotel operations.',
    features: [
      { label: 'Everything in Pro',                 included: true  },
      { label: 'Custom agent logic on request',     included: true  },
      { label: 'Multi-team orchestration',          included: true  },
      { label: 'Dedicated support channel',         included: true  },
      { label: 'White-label options',               included: true  },
      { label: 'Priority onboarding',               included: true  },
    ],
  },
]

export function TiersTab({ me, onNavigate }) {
  const activeTier = me?.ai_tier || 'basic'
  const [upgradeRequest, setUpgradeRequest] = useState(null)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  useEffect(() => {
    api('/api/tier-requests/mine')
      .then(d => setUpgradeRequest(d.request || null))
      .catch(() => {})
  }, [])

  const hasPendingRequest = upgradeRequest?.status === 'pending'

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigate('home')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Home
        </button>
        <span className="text-muted-foreground/40 text-sm">/</span>
        <span className="text-sm text-foreground font-medium">Plans & Tiers</span>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Plans & Tiers</h1>
        <p className="text-sm text-muted-foreground mt-1">Compare what's included in each plan.</p>
      </div>

      {hasPendingRequest && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
          <Bell className="w-4 h-4 text-warning shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-warning/80">Upgrade request pending</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your request for <span className="capitalize font-medium">{upgradeRequest.requested_tier}</span> is being reviewed.
            </p>
          </div>
        </div>
      )}

      {showUpgradeModal && (
        <UpgradeRequestModal
          onClose={() => setShowUpgradeModal(false)}
          onSubmitted={(req) => { setUpgradeRequest(req); setShowUpgradeModal(false) }}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TIER_PLANS.map(plan => {
          const tierRank = { basic: 0, pro: 1, enterprise: 2 }
          const isCurrent = activeTier === plan.id
          const isBelow = tierRank[activeTier] > tierRank[plan.id]

          let cta = null
          if (plan.id === 'enterprise') {
            cta = (
              <a
                href="mailto:hello@thepixeloffice.ai"
                className="block text-center text-sm font-medium h-9 px-4 leading-9 rounded-lg border border-border hover:bg-secondary transition-colors"
              >
                Contact us
              </a>
            )
          } else if (isCurrent) {
            cta = (
              <div className="h-9 px-4 flex items-center justify-center rounded-lg bg-secondary text-sm text-muted-foreground">
                Current plan
              </div>
            )
          } else if (isBelow) {
            cta = (
              <div className="h-9 px-4 flex items-center justify-center rounded-lg bg-secondary/50 text-sm text-muted-foreground/60">
                Included in your plan
              </div>
            )
          } else if (hasPendingRequest && upgradeRequest?.requested_tier === plan.id) {
            cta = (
              <div className="h-9 px-4 flex items-center justify-center rounded-lg bg-warning/10 text-sm text-warning/80">
                Request pending
              </div>
            )
          } else {
            cta = (
              <button
                onClick={() => setShowUpgradeModal(true)}
                className="w-full h-9 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Request upgrade
              </button>
            )
          }

          return (
            <div
              key={plan.id}
              className={`bg-card border rounded-2xl p-6 flex flex-col gap-4 ${isCurrent ? 'ring-2 ring-primary border-primary/40' : 'border-border'}`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                  {isCurrent && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary">Current</span>
                  )}
                </div>
                <p className="text-2xl font-bold text-foreground">{plan.price}</p>
                <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
              </div>

              <ul className="space-y-2 flex-1">
                {plan.features.map(f => (
                  <li key={f.label} className="flex items-center gap-2 text-sm">
                    {f.included
                      ? <Check className="w-3.5 h-3.5 text-success flex-shrink-0" />
                      : <Minus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    }
                    <span className={f.included ? 'text-foreground' : 'text-muted-foreground'}>{f.label}</span>
                  </li>
                ))}
              </ul>

              {cta}
            </div>
          )
        })}
      </div>
    </div>
  )
}
