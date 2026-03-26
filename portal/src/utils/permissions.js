/**
 * Canonical permission registry — single source of truth for all access control.
 *
 * KEEP IN SYNC with the PERMISSIONS map in portal/server.js.
 * When adding a new feature:
 *   1. Add the permission key here with minTier + requiresDev + description.
 *   2. Add the same key to server.js PERMISSIONS (backend enforcement).
 *   3. Gate the UI element with can(me, 'your.permission').
 *   4. Gate the API route with authRequired, permRequired('your.permission').
 *
 * The pre-deploy analysis will surface any changed permission gates in its report.
 */

export const TIER_RANK = { basic: 0, pro: 1, enterprise: 2 }

/**
 * @typedef {{ minTier: 'basic'|'pro'|'enterprise', requiresDev: boolean, description: string }} PermRule
 * @type {Record<string, PermRule>}
 */
export const PERMISSIONS = {
  // ── Teams ──────────────────────────────────────────────────────────────────
  // Who can see the teams list + deploy panel
  'teams.view':    { minTier: 'pro',   requiresDev: false, description: 'View own teams list' },
  // Who can trigger (deploy) a team to a hotel room
  'teams.deploy':  { minTier: 'pro',   requiresDev: false, description: 'Deploy/trigger a team to a hotel room' },
  // Who can create new teams from scratch
  'teams.create':  { minTier: 'pro',   requiresDev: true,  description: 'Create new teams from scratch' },
  // Who can edit team configuration (name, prompts, tasks, members)
  'teams.edit':    { minTier: 'pro',   requiresDev: true,  description: 'Edit existing team configuration' },
  // Who can delete teams
  'teams.delete':  { minTier: 'pro',   requiresDev: true,  description: 'Delete teams' },

  // ── Personas ───────────────────────────────────────────────────────────────
  // Who can see the personas list
  'personas.view':   { minTier: 'pro',   requiresDev: false, description: 'View own agent personas list' },
  // Who can create new personas
  'personas.create':   { minTier: 'pro', requiresDev: true,  description: 'Create new agent personas' },
  // Who can edit persona configuration
  'personas.edit':     { minTier: 'pro', requiresDev: true,  description: 'Edit existing agent personas' },
  // Who can delete personas
  'personas.delete':   { minTier: 'pro', requiresDev: true,  description: 'Delete agent personas' },
  // Who can link/unlink a hotel bot to a persona (pro users can assign bots without full edit rights)
  'personas.link_bot': { minTier: 'pro', requiresDev: false, description: 'Link or unlink a hotel bot on a persona' },

  // ── Marketplace ────────────────────────────────────────────────────────────
  // Who can browse marketplace teams, skills, and personas
  'marketplace.browse':  { minTier: 'basic', requiresDev: false, description: 'Browse marketplace content' },
  // Who can install a marketplace team into their own account
  'marketplace.install':   { minTier: 'pro', requiresDev: false, description: 'Install marketplace teams' },
  // Who can uninstall (remove) a previously installed marketplace team from their account
  'marketplace.uninstall': { minTier: 'pro', requiresDev: false, description: 'Uninstall marketplace teams from own account' },
  // Who can create/edit/delete marketplace templates (developer-only authoring)
  'marketplace.manage':    { minTier: 'pro', requiresDev: true,  description: 'Author and manage marketplace templates' },

  // ── MCP ────────────────────────────────────────────────────────────────────
  // Who can generate and use MCP tokens
  'mcp.use':    { minTier: 'pro', requiresDev: false, description: 'Generate and use MCP tokens' },
  // Who can administer MCP tokens across all users
  'mcp.manage': { minTier: 'pro', requiresDev: true,  description: 'Manage MCP tokens for all users' },

  // ── Account ────────────────────────────────────────────────────────────────
  // All authenticated users can access their own account settings
  'account.settings': { minTier: 'basic', requiresDev: false, description: 'Access own account settings' },

  // ── Developer / admin tools ────────────────────────────────────────────────
  // Who can access the Dev Tools panel (logs, Habbo status)
  'devtools.access':  { minTier: 'basic', requiresDev: true, description: 'Access developer tools and live log panel' },
  // Who can review and approve tier upgrade requests
  'admin.requests':   { minTier: 'basic', requiresDev: true, description: 'Review tier upgrade requests' },
  // Who can view and manage user feedback submissions
  'admin.feedback':   { minTier: 'basic', requiresDev: true, description: 'View and manage user feedback' },
}

/**
 * Check whether a user has a given permission.
 *
 * @param {object|null} me  - User object from /api/auth/me (fields: ai_tier, is_developer)
 * @param {string} permission - Key from PERMISSIONS above
 * @returns {boolean}
 */
export function can(me, permission) {
  if (!me) return false
  const rule = PERMISSIONS[permission]
  if (!rule) {
    console.warn(`[permissions] Unknown permission key: "${permission}"`)
    return false
  }
  const tierOk = (TIER_RANK[me.ai_tier] || 0) >= (TIER_RANK[rule.minTier] || 0)
  if (!tierOk) return false
  if (rule.requiresDev && !me.is_developer) return false
  return true
}

/**
 * Return a human-readable description of who can access a permission.
 * Used in the pre-deploy analysis report.
 *
 * @param {string} permission
 * @returns {string}
 */
export function describeAccess(permission) {
  const rule = PERMISSIONS[permission]
  if (!rule) return `Unknown permission: "${permission}"`
  const eligibleTiers = Object.keys(TIER_RANK).filter(
    t => TIER_RANK[t] >= TIER_RANK[rule.minTier]
  )
  const tierStr = eligibleTiers.join(' / ')
  return rule.requiresDev
    ? `${tierStr} + developer flag required`
    : tierStr
}
