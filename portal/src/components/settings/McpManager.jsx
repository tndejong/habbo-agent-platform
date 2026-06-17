import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle, Check, Copy, Hotel, Key, Loader2, Network,
  Plus, Terminal, Trash2, ChevronDown, ExternalLink,
} from 'lucide-react'
import { api } from '../../utils/api'
import { McpHealthBadge } from '../dashboard/McpHealthBadge'

/**
 * MCP integrations hub — Habbo Hotel MCP (built-in) plus the user's configured
 * third-party MCP servers (portal_user_integrations, account-scoped).
 *
 * Pro / Enterprise only. Recent tool-call logs are visible to all Pro members.
 */

function HabboBrandTile() {
  return (
    <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#4A90D9] ring-1 ring-black/10 dark:ring-white/10">
      <Hotel className="w-[18px] h-[18px] text-white" />
    </span>
  )
}

function IntegrationBrandTile({ icon, name }) {
  const [imgError, setImgError] = useState(false)
  return (
    <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-secondary ring-1 ring-border overflow-hidden">
      {icon && !imgError
        ? <img src={icon} alt="" className="w-5 h-5 object-contain" onError={() => setImgError(true)} />
        : <Network className="w-4 h-4 text-muted-foreground" />}
    </span>
  )
}

function McpCallsList({ calls }) {
  if (!calls.length) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-4 text-center">
        <Terminal className="w-5 h-5 text-muted-foreground/40" />
        <p className="text-xs font-medium text-foreground">No calls yet</p>
        <p className="text-xs text-muted-foreground">Tool calls from your agents will appear here.</p>
      </div>
    )
  }
  return (
    <div className="space-y-1.5 max-h-64 overflow-y-auto">
      {calls.map(call => (
        <div key={call.id} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border bg-background/50">
          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${call.success ? 'bg-success' : 'bg-destructive'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground">
              {call.tool_name}
              <span className="text-muted-foreground font-normal ml-1">({call.channel})</span>
            </p>
            <p className="text-xs text-muted-foreground">{call.duration_ms}ms · {new Date(call.created_at).toLocaleString()}</p>
          </div>
          <span className={`text-xs flex-shrink-0 ${call.success ? 'text-success' : 'text-destructive'}`}>
            {call.success ? 'ok' : call.error_code || 'err'}
          </span>
        </div>
      ))}
    </div>
  )
}

function HabboMcpPanel({
  mcpTokens, mcpLoading, mcpBusy, mcpMsg, mcpHealth, mcpAuthSource, mcpEnvKeyConfigured,
  mcpCalls, newMcpToken, tokenLabel, copiedToken,
  onTokenLabelChange, onCreateToken, onStartBuilding, onRevokeToken, onCopyToken,
}) {
  const now = new Date()
  const hasActiveToken = (mcpTokens || []).some(t => t.status === 'active' && new Date(t.expires_at) > now)
  const connected = hasActiveToken || mcpAuthSource === 'env_key'

  return (
    <div className="space-y-4">
      {mcpMsg && (
        <div className={`text-xs rounded-lg px-3 py-2 flex items-center gap-2 ${mcpMsg.type === 'success' ? 'bg-success/10 text-success border border-success/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
          {mcpMsg.type === 'success' ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
          {mcpMsg.text}
        </div>
      )}

      {/* Connection status */}
      <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${mcpHealth?.ok ? 'bg-success' : mcpHealth?.reachable ? 'bg-warning' : 'bg-destructive'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Hotel MCP server</p>
          <p className="text-xs text-muted-foreground">
            {mcpHealth?.reachable
              ? (mcpHealth.ok ? 'Healthy and reachable' : 'Reachable but health check failed')
              : 'Unreachable — check your deployment'}
          </p>
        </div>
        <McpHealthBadge health={mcpHealth} />
      </div>

      {mcpAuthSource !== null && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground">Auth:</span>
          {mcpAuthSource === 'user_token' && (
            <span className="inline-flex items-center gap-1.5 font-medium px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
              <Key className="w-3 h-3" /> Your token
            </span>
          )}
          {mcpAuthSource === 'env_key' && (
            <span className="inline-flex items-center gap-1.5 font-medium px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">
              <Key className="w-3 h-3" /> Server fallback key
            </span>
          )}
          {mcpAuthSource === 'none' && (
            <span className="inline-flex items-center gap-1.5 font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
              <AlertCircle className="w-3 h-3" /> No token — generate one below
            </span>
          )}
          {mcpEnvKeyConfigured && mcpAuthSource === 'env_key' && (
            <span className="text-muted-foreground">Generate a personal token to use your own auth.</span>
          )}
        </div>
      )}

      {newMcpToken && (
        <div className="bg-success/10 border border-success/20 rounded-xl p-4 space-y-2">
          <p className="text-xs font-medium text-success">Copy this token now — it is only shown once!</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-xs bg-background/50 border border-border rounded-lg px-3 py-2 break-all">
              {newMcpToken}
            </code>
            <button type="button" onClick={() => onCopyToken(newMcpToken)} aria-label="Copy token"
              className="h-8 w-8 flex-shrink-0 flex items-center justify-center border border-border rounded-lg hover:bg-secondary transition-colors">
              {copiedToken ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* Token management */}
      {mcpLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading tokens…
        </div>
      ) : (
        <div className="space-y-3">
          {!connected && !newMcpToken && (
            <>
              <p className="text-xs text-muted-foreground">
                Generate a token so your agents can talk to the hotel. You only need to do this once.
              </p>
              <button type="button" onClick={onStartBuilding} disabled={mcpBusy}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {mcpBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Generate MCP token
              </button>
            </>
          )}

          {(connected || mcpTokens.length > 0) && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input placeholder="Token label (optional)" value={tokenLabel}
                  onChange={e => onTokenLabelChange(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && onCreateToken()}
                  className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                <button onClick={onCreateToken} disabled={mcpBusy}
                  className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 flex-shrink-0">
                  {mcpBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Generate
                </button>
              </div>

              {mcpTokens.length > 0 && (
                <div className="space-y-2">
                  {mcpTokens.map(token => (
                    <div key={token.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${token.status === 'active' ? 'bg-success' : 'bg-muted-foreground/40'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{token.token_label || 'Token'}</p>
                        <p className="text-xs text-muted-foreground">
                          {token.status} · expires {new Date(token.expires_at).toLocaleDateString()}
                          {token.last_used_at ? ` · last used ${new Date(token.last_used_at).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      <button onClick={() => onRevokeToken(token.id)}
                        disabled={mcpBusy || token.status !== 'active'}
                        className="h-7 px-3 text-xs border border-destructive/30 text-destructive rounded-md hover:bg-destructive/10 disabled:opacity-50 transition-colors flex-shrink-0">
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recent calls */}
      <div className="border-t border-border pt-4 space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent tool calls</h4>
        <McpCallsList calls={mcpCalls} />
      </div>
    </div>
  )
}

function ConfiguredMcpRow({ integration, expanded, onToggle, onRemove, removing }) {
  const isStdio = integration.type === 'stdio'
  return (
    <div className="border-b border-border last:border-b-0">
      <button type="button" onClick={onToggle} aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-secondary/40 transition-colors">
        <IntegrationBrandTile icon={integration.icon} name={integration.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{integration.name}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-secondary rounded px-1.5 py-0.5">
              {isStdio ? 'Local · stdio' : 'Remote · HTTP'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {isStdio ? 'Runs as a local process on the server' : integration.url}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-success" /> Configured
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 bg-secondary/20">
          <p className="text-xs text-muted-foreground">
            Added {new Date(integration.updated_at || integration.created_at).toLocaleDateString()}.
            This integration is injected into your agent runs automatically.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/orchestration/mcp"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-secondary transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> Manage in browser
            </Link>
            <button type="button" onClick={() => onRemove(integration.id)} disabled={removing}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-destructive/30 text-destructive rounded-lg hover:bg-destructive/10 disabled:opacity-50 transition-colors">
              {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function McpManager({ me, onTokenChange }) {
  const canUseMcp = me && ['pro', 'enterprise'].includes(me.ai_tier)

  const [expandedId, setExpandedId] = useState('habbo-mcp')
  const [mcpTokens, setMcpTokens] = useState([])
  const [mcpAuthSource, setMcpAuthSource] = useState(null)
  const [mcpEnvKeyConfigured, setMcpEnvKeyConfigured] = useState(false)
  const [mcpCalls, setMcpCalls] = useState([])
  const [mcpLoading, setMcpLoading] = useState(false)
  const [mcpBusy, setMcpBusy] = useState(false)
  const [mcpMsg, setMcpMsg] = useState(null)
  const [tokenLabel, setTokenLabel] = useState('')
  const [newMcpToken, setNewMcpToken] = useState(null)
  const [copiedToken, setCopiedToken] = useState(false)
  const [mcpHealth, setMcpHealth] = useState(null)

  const [myIntegrations, setMyIntegrations] = useState([])
  const [integrationsLoading, setIntegrationsLoading] = useState(true)
  const [removingId, setRemovingId] = useState(null)

  const loadMcp = useCallback(async () => {
    if (!canUseMcp) return
    setMcpLoading(true)
    try {
      const [tokenData, callData] = await Promise.all([
        api('/api/mcp/tokens'),
        api('/api/mcp/calls?limit=30'),
      ])
      setMcpTokens(tokenData.tokens || [])
      setMcpAuthSource(tokenData.auth_source || 'none')
      setMcpEnvKeyConfigured(!!tokenData.env_key_configured)
      setMcpCalls(callData.calls || [])
    } catch {
      // non-blocking
    } finally {
      setMcpLoading(false)
    }
  }, [canUseMcp])

  const loadIntegrations = useCallback(async () => {
    if (!canUseMcp) return
    setIntegrationsLoading(true)
    try {
      const data = await api('/api/my/integrations')
      setMyIntegrations(data.integrations || [])
    } catch {
      setMyIntegrations([])
    } finally {
      setIntegrationsLoading(false)
    }
  }, [canUseMcp])

  useEffect(() => { loadMcp() }, [loadMcp])
  useEffect(() => { loadIntegrations() }, [loadIntegrations])

  useEffect(() => {
    if (!canUseMcp) return
    let cancelled = false
    const fetchHealth = () => {
      api('/api/mcp/health')
        .then(d => { if (!cancelled) setMcpHealth(d) })
        .catch(() => { if (!cancelled) setMcpHealth({ reachable: false, ok: false, error: 'request failed' }) })
    }
    fetchHealth()
    const id = setInterval(fetchHealth, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [canUseMcp])

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

  async function handleStartBuilding() {
    setMcpBusy(true); setMcpMsg(null)
    try {
      const data = await api('/api/mcp/tokens', { method: 'POST', body: { label: 'Default token' } })
      setNewMcpToken(data.token?.value ?? null)
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

  async function handleRemoveIntegration(id) {
    if (!window.confirm('Remove this MCP integration?')) return
    setRemovingId(id)
    try {
      await api(`/api/my/integrations/${id}`, { method: 'DELETE' })
      setMyIntegrations(prev => prev.filter(i => i.id !== id))
    } catch (err) {
      setMcpMsg({ type: 'error', text: err.message })
    } finally {
      setRemovingId(null)
    }
  }

  const now = new Date()
  const habboConnected = (mcpTokens || []).some(t => t.status === 'active' && new Date(t.expires_at) > now)
    || mcpAuthSource === 'env_key'

  if (!canUseMcp) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
          <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0"><Network className="w-3.5 h-3.5" /></span>
          MCP Integrations
        </h2>
        <div className="bg-card border border-border rounded-xl p-6 text-center space-y-2">
          <p className="text-sm text-foreground font-medium">Available on Pro</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Connect your agents to the Habbo hotel and third-party MCP servers. Upgrade to Pro to generate MCP tokens and manage integrations.
          </p>
          <Link to="/app/settings?subtab=account" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-2">
            View plans <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
        <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0"><Network className="w-3.5 h-3.5" /></span>
        MCP Integrations
        <McpHealthBadge health={mcpHealth} />
      </h2>
      <p className="text-xs text-muted-foreground">
        MCP servers your agents can call. Habbo Hotel is built in; add third-party servers from the integration browser.
        All integrations are tied to your account.
      </p>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Habbo MCP — built-in */}
        <div className="border-b border-border">
          <button type="button" onClick={() => setExpandedId(id => id === 'habbo-mcp' ? null : 'habbo-mcp')}
            aria-expanded={expandedId === 'habbo-mcp'}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-secondary/40 transition-colors">
            <HabboBrandTile />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">Habbo Hotel</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-secondary rounded px-1.5 py-0.5">Hotel · Built-in</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                Official hotel MCP — rooms, bots, RCON, and in-world agent actions.
              </p>
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
            <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${expandedId === 'habbo-mcp' ? 'rotate-180' : ''}`} />
          </button>
          {expandedId === 'habbo-mcp' && (
            <div className="px-4 pb-4 pt-1 bg-secondary/20">
              <HabboMcpPanel
                mcpTokens={mcpTokens}
                mcpLoading={mcpLoading}
                mcpBusy={mcpBusy}
                mcpMsg={mcpMsg}
                mcpHealth={mcpHealth}
                mcpAuthSource={mcpAuthSource}
                mcpEnvKeyConfigured={mcpEnvKeyConfigured}
                mcpCalls={mcpCalls}
                newMcpToken={newMcpToken}
                tokenLabel={tokenLabel}
                copiedToken={copiedToken}
                onTokenLabelChange={setTokenLabel}
                onCreateToken={handleCreateToken}
                onStartBuilding={handleStartBuilding}
                onRevokeToken={handleRevokeToken}
                onCopyToken={copyMcpToken}
              />
            </div>
          )}
        </div>

        {/* User-configured MCP integrations */}
        {integrationsLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-6">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your integrations…
          </div>
        ) : myIntegrations.map(integration => (
          <ConfiguredMcpRow
            key={integration.id}
            integration={integration}
            expanded={expandedId === `int-${integration.id}`}
            onToggle={() => setExpandedId(id => id === `int-${integration.id}` ? null : `int-${integration.id}`)}
            onRemove={handleRemoveIntegration}
            removing={removingId === integration.id}
          />
        ))}
      </div>

      {/* Discover more */}
      <div className="bg-card border border-dashed border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Discover MCP integrations</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Browse Atlassian, Notion, Linear, and 800+ servers from the official MCP registry. Each connection is saved to your account.
          </p>
        </div>
        <Link to="/orchestration/mcp"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0">
          <Plus className="w-4 h-4" />
          Browse integrations
        </Link>
      </div>
    </section>
  )
}
