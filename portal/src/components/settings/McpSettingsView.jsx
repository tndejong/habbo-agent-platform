import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle, Check, ChevronDown, Copy, ExternalLink, Hotel,
  Key, Loader2, Network, Plus, Trash2,
} from 'lucide-react'
import { api } from '../../utils/api'
import { can } from '../../utils/permissions'

function HabboBrandTile() {
  return (
    <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary ring-1 ring-black/10 dark:ring-white/10">
      <Hotel className="w-[18px] h-[18px] text-primary-foreground" />
    </span>
  )
}

function Toggle({ enabled, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed ${
        enabled ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
        enabled ? 'translate-x-4' : 'translate-x-0'
      }`} />
    </button>
  )
}

export function McpSettingsView({ me, onTokenChange }) {
  const canUseMcp = can(me, 'mcp.use')

  const [mcpTokens, setMcpTokens] = useState([])
  const [mcpAuthSource, setMcpAuthSource] = useState(null)
  const [mcpEnvKeyConfigured, setMcpEnvKeyConfigured] = useState(false)
  const [mcpLoading, setMcpLoading] = useState(false)
  const [mcpBusy, setMcpBusy] = useState(false)
  const [mcpMsg, setMcpMsg] = useState(null)
  const [tokenLabel, setTokenLabel] = useState('')
  const [newMcpToken, setNewMcpToken] = useState(null)
  const [copiedToken, setCopiedToken] = useState(false)

  const [integrations, setIntegrations] = useState([])
  const [integrationsLoading, setIntegrationsLoading] = useState(true)
  const [togglingId, setTogglingId] = useState(null)
  const [removingId, setRemovingId] = useState(null)

  const loadMcp = useCallback(async () => {
    if (!canUseMcp) return
    setMcpLoading(true)
    try {
      const tokenData = await api('/api/mcp/tokens')
      setMcpTokens(tokenData.tokens || [])
      setMcpAuthSource(tokenData.auth_source || 'none')
      setMcpEnvKeyConfigured(!!tokenData.env_key_configured)
    } catch {
      // non-blocking
    } finally {
      setMcpLoading(false)
    }
  }, [canUseMcp])

  const loadIntegrations = useCallback(async () => {
    setIntegrationsLoading(true)
    try {
      const data = await api('/api/my/integrations')
      setIntegrations(data.integrations || [])
    } catch {
      setIntegrations([])
    } finally {
      setIntegrationsLoading(false)
    }
  }, [])

  useEffect(() => { loadMcp() }, [loadMcp])
  useEffect(() => { loadIntegrations() }, [loadIntegrations])

  async function handleCreateToken() {
    setMcpBusy(true); setMcpMsg(null)
    try {
      const data = await api('/api/mcp/tokens', { method: 'POST', body: { label: tokenLabel } })
      setNewMcpToken(data.token?.value ?? null)
      setTokenLabel('')
      setMcpMsg({ type: 'success', text: 'Token generated — copy it now, it is only shown once.' })
      await loadMcp()
      onTokenChange?.()
    } catch (err) {
      setMcpMsg({ type: 'error', text: err.message })
    } finally {
      setMcpBusy(false)
    }
  }

  async function handleRevokeToken(tokenId) {
    setMcpBusy(true); setMcpMsg(null)
    try {
      await api(`/api/mcp/tokens/${tokenId}`, { method: 'DELETE' })
      setMcpMsg({ type: 'success', text: 'Token revoked.' })
      await loadMcp()
      onTokenChange?.()
    } catch (err) {
      setMcpMsg({ type: 'error', text: err.message })
    } finally {
      setMcpBusy(false)
    }
  }

  function copyMcpToken(value) {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2000)
    })
  }

  async function handleToggleEnabled(integration) {
    setTogglingId(integration.id)
    try {
      await api(`/api/my/integrations/${integration.id}`, {
        method: 'PATCH',
        body: { enabled: !integration.enabled },
      })
      setIntegrations(prev => prev.map(i =>
        i.id === integration.id ? { ...i, enabled: !i.enabled } : i
      ))
    } catch (err) {
      setMcpMsg({ type: 'error', text: err.message })
    } finally {
      setTogglingId(null)
    }
  }

  async function handleRemoveIntegration(id) {
    if (!window.confirm('Remove this MCP integration?')) return
    setRemovingId(id)
    try {
      await api(`/api/my/integrations/${id}`, { method: 'DELETE' })
      setIntegrations(prev => prev.filter(i => i.id !== id))
    } catch (err) {
      setMcpMsg({ type: 'error', text: err.message })
    } finally {
      setRemovingId(null)
    }
  }

  if (!canUseMcp) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
          <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0"><Network className="w-3.5 h-3.5" /></span>
          MCP
        </h2>
        <div className="bg-card border border-border rounded-xl p-6 text-center space-y-2">
          <p className="text-sm text-foreground font-medium">Available on Pro</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Connect your agents to MCP servers. Upgrade to Pro to manage MCP tokens and integrations.
          </p>
          <Link to="/app/settings?subtab=account" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-2">
            View plans <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </section>
    )
  }

  const now = new Date()
  const habboConnected = (mcpTokens || []).some(t => t.status === 'active' && new Date(t.expires_at) > now)
    || mcpAuthSource === 'env_key'

  return (
    <div className="space-y-6">

      {/* Habbo Hotel MCP status */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
          <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
            <Network className="w-3.5 h-3.5" />
          </span>
          MCP
        </h2>
        <p className="text-xs text-muted-foreground">
          MCP servers your agents can call. Habbo Hotel is built in; add third-party integrations from the orchestration page.
          Toggle each integration on or off — disabled ones are not exposed to any agent.
        </p>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Habbo MCP — built-in */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
            <HabboBrandTile />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">Habbo Hotel</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-secondary rounded px-1.5 py-0.5">Built-in</span>
              </div>
            </div>
            {habboConnected ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20 flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-success" /> Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" /> Not connected
              </span>
            )}
          </div>

          {/* User-configured integrations with toggles */}
          {integrationsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-6">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading integrations…
            </div>
          ) : integrations.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground">No integrations yet.</p>
            </div>
          ) : integrations.map(integration => (
            <div key={integration.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
              <span className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                <Network className="w-4 h-4 text-muted-foreground" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{integration.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {integration.type === 'stdio' ? 'Local process (stdio)' : integration.url}
                </p>
              </div>
              <Toggle
                enabled={integration.enabled}
                onChange={() => handleToggleEnabled(integration)}
                disabled={togglingId === integration.id}
              />
              <button
                type="button"
                onClick={() => handleRemoveIntegration(integration.id)}
                disabled={removingId === integration.id}
                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50"
                aria-label={`Remove ${integration.name}`}
              >
                {removingId === integration.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>

        <div className="bg-card border border-dashed border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Add more integrations</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Browse curated MCP servers in the orchestration page.
            </p>
          </div>
          <Link to="/orchestration/mcp#curated-integrations"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0">
            <Plus className="w-4 h-4" />
            Browse integrations
          </Link>
        </div>
      </section>

      {/* MCP Token Management */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
          <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0"><Key className="w-3.5 h-3.5" /></span>
          MCP Tokens
        </h2>
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            MCP tokens authenticate external clients (like the game emulator) to call the Habbo Hotel MCP server.
          </p>

          {mcpMsg && (
            <div className={`text-xs rounded-lg px-3 py-2 flex items-center gap-2 ${mcpMsg.type === 'success' ? 'bg-success/10 text-success border border-success/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
              {mcpMsg.type === 'success' ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
              {mcpMsg.text}
            </div>
          )}

          {newMcpToken && (
            <div className="bg-background border border-border rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">New token (copy now — shown once)</p>
              <div className="flex gap-2">
                <code className="flex-1 bg-secondary rounded px-2 py-1.5 text-xs font-mono text-foreground break-all select-all">
                  {newMcpToken}
                </code>
                <button onClick={() => copyMcpToken(newMcpToken)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-secondary transition-colors">
                  <Copy className="w-3 h-3" />
                  {copiedToken ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          {mcpLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading tokens…
            </div>
          ) : mcpTokens.length > 0 ? (
            <div className="space-y-2">
              {mcpTokens.map(token => (
                <div key={token.id} className="flex items-center justify-between bg-background rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-foreground">{token.label || 'Unnamed'}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Created {new Date(token.created_at).toLocaleDateString()} &middot;
                      {token.status === 'active' && new Date(token.expires_at) > now
                        ? ` Expires ${new Date(token.expires_at).toLocaleDateString()}`
                        : ' Expired'}
                    </p>
                  </div>
                  <button onClick={() => handleRevokeToken(token.id)} disabled={mcpBusy}
                    className="text-xs text-destructive hover:text-destructive/70 border border-destructive/30 hover:border-destructive/50 rounded px-2 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No tokens yet.</p>
          )}

          <div className="flex gap-2">
            <input type="text" value={tokenLabel} onChange={e => setTokenLabel(e.target.value)}
              placeholder="Token label (optional)" maxLength={64}
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              onKeyDown={e => e.key === 'Enter' && handleCreateToken()} />
            <button onClick={handleCreateToken} disabled={mcpBusy}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {mcpBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
              Generate
            </button>
          </div>

          {mcpAuthSource === 'env_key' && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Check className="w-3 h-3 text-success" />
              Server fallback key is configured — MCP is reachable even without a user token.
            </p>
          )}
        </div>
      </section>

    </div>
  )
}
