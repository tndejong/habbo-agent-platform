import { useState, useEffect } from 'react'
import { Bell, Check, CreditCard, Minus } from 'lucide-react'
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

// ── TiersSection — embedded in Settings → Account ─────────────────────────
export function TiersSection({ me }) {
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
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
        <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
          <CreditCard className="w-3.5 h-3.5" />
        </span>
        Plan &amp; Billing
      </h2>

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TIER_PLANS.map(plan => {
          const tierRank = { basic: 0, pro: 1, enterprise: 2 }
          const isCurrent = activeTier === plan.id
          const isBelow = tierRank[activeTier] > tierRank[plan.id]
          let cta = null
          if (plan.id === 'enterprise') {
            cta = (
              <a href="mailto:hello@thepixeloffice.ai"
                className="block text-center text-xs font-medium h-8 px-3 leading-8 rounded-lg border border-border hover:bg-secondary transition-colors">
                Contact us
              </a>
            )
          } else if (isCurrent) {
            cta = <div className="h-8 px-3 flex items-center justify-center rounded-lg bg-secondary text-xs text-muted-foreground">Current plan</div>
          } else if (isBelow) {
            cta = <div className="h-8 px-3 flex items-center justify-center rounded-lg bg-secondary/50 text-xs text-muted-foreground/60">Included</div>
          } else if (hasPendingRequest && upgradeRequest?.requested_tier === plan.id) {
            cta = <div className="h-8 px-3 flex items-center justify-center rounded-lg bg-warning/10 text-xs text-warning/80">Request pending</div>
          } else {
            cta = (
              <button onClick={() => setShowUpgradeModal(true)}
                className="w-full h-8 px-3 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                Request upgrade
              </button>
            )
          }
          return (
            <div key={plan.id} className={`bg-card border rounded-xl p-4 flex flex-col gap-3 ${isCurrent ? 'ring-2 ring-primary border-primary/40' : 'border-border'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{plan.price}</p>
                </div>
                {isCurrent && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">Current</span>}
              </div>
              <ul className="space-y-1.5 flex-1">
                {plan.features.map(f => (
                  <li key={f.label} className="flex items-center gap-1.5 text-xs">
                    {f.included
                      ? <Check className="w-3 h-3 text-success flex-shrink-0" />
                      : <Minus className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
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

