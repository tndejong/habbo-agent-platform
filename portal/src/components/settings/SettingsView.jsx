import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertCircle, Check, Copy, Eye, EyeOff, Key, Loader2, Phone,
  ServerCog, Shield, Terminal, Trash2, User, Wifi, WifiOff,
} from 'lucide-react'
import { api } from '../../utils/api'
import { can } from '../../utils/permissions'
import { HabboFigure } from '../HabboFigure'
import { McpHealthBadge } from '../dashboard/McpHealthBadge'
import { VoiceAudioSettings } from './VoiceAudioSettings'

export function SettingsView({ me, onKeyUpdated, onTokenChange }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlTab = searchParams.get('subtab')
  const validTabs = ['account', 'auth']
  const initialTab = validTabs.includes(urlTab) ? urlTab : 'account'
  
  const [settingsTab, setSettingsTab] = useState(initialTab) // 'account' | 'auth'

  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [newKey, setNewKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState(null) // { type: 'success'|'error', text }

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null) // { type: 'success'|'error', text }

  const [phone, setPhone] = useState(null)       // current saved number or null
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneSaving, setPhoneSaving] = useState(false)
  const [phoneDeleting, setPhoneDeleting] = useState(false)
  const [phoneMsg, setPhoneMsg] = useState(null) // { type: 'success'|'error', text }

  // Update URL when tab changes
  const handleTabChange = (newTab) => {
    setSettingsTab(newTab)
    const newParams = new URLSearchParams(searchParams)
    newParams.set('subtab', newTab)
    setSearchParams(newParams)
  }

  // Sync URL tab changes
  useEffect(() => {
    if (urlTab && validTabs.includes(urlTab) && urlTab !== settingsTab) {
      setSettingsTab(urlTab)
    }
  }, [urlTab])

  const [defaultTeamState, setDefaultTeamState] = useState({ loading: true, teamId: null, teams: [] })
  const [defaultTeamSaving, setDefaultTeamSaving] = useState(false)

  const canUseMcpTokens = me && ['pro', 'enterprise'].includes(me.ai_tier)

  // MCP tokens + Habbo MCP connection status — Pro+ (simple UI); full diagnostics for developers
  const [mcpTokens, setMcpTokens] = useState([])
  const [mcpAuthSource, setMcpAuthSource] = useState(null) // 'user_token' | 'env_key' | 'none'
  const [mcpEnvKeyConfigured, setMcpEnvKeyConfigured] = useState(false)
  const [mcpCalls, setMcpCalls] = useState([])
  const [mcpLoading, setMcpLoading] = useState(false)
  const [mcpBusy, setMcpBusy] = useState(false)
  const [mcpMsg, setMcpMsg] = useState(null) // { type: 'success'|'error', text }
  const [tokenLabel, setTokenLabel] = useState('')
  const [newMcpToken, setNewMcpToken] = useState(null) // revealed token value (shown once)
  const [copiedToken, setCopiedToken] = useState(false)
  const [habboMcpStatus, setHabboMcpStatus] = useState(null) // null = loading, object = result
  const [mcpHealth, setMcpHealth] = useState(null) // { reachable, ok, checks, error }

  // Fetch Habbo MCP status once on mount (dev only)
  useEffect(() => {
    if (!me?.is_developer) return
    fetch('/api/agents/status', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setHabboMcpStatus(d.mcp ?? { error: 'No MCP data returned' }))
      .catch(() => setHabboMcpStatus({ error: 'Could not reach agent-trigger' }))
  }, [me?.is_developer])

  // Poll habbo-mcp /healthz via portal proxy. Visible to anyone who can use MCP tokens.
  useEffect(() => {
    if (!canUseMcpTokens) return
    let cancelled = false
    const fetchHealth = () => {
      api('/api/mcp/health')
        .then(d => { if (!cancelled) setMcpHealth(d) })
        .catch(() => { if (!cancelled) setMcpHealth({ reachable: false, ok: false, error: 'request failed' }) })
    }
    fetchHealth()
    const id = setInterval(fetchHealth, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [canUseMcpTokens])

  const loadMcpTokens = useCallback(async () => {
    if (!canUseMcpTokens) return
    setMcpLoading(true)
    try {
      const tokenData = await api('/api/mcp/tokens')
      setMcpTokens(tokenData.tokens || [])
      setMcpAuthSource(tokenData.auth_source || 'none')
      setMcpEnvKeyConfigured(!!tokenData.env_key_configured)
      if (me?.is_developer) {
        const callData = await api('/api/mcp/calls?limit=30')
        setMcpCalls(callData.calls || [])
      } else {
        setMcpCalls([])
      }
    } catch {
      // non-blocking — tokens section will be empty
    } finally {
      setMcpLoading(false)
    }
  }, [canUseMcpTokens, me?.is_developer])

  useEffect(() => { loadMcpTokens() }, [loadMcpTokens])

  async function handleCreateToken() {
    setMcpBusy(true); setMcpMsg(null)
    try {
      const data = await api('/api/mcp/tokens', {
        method: 'POST',
        body: JSON.stringify({ label: tokenLabel }),
      })
      setNewMcpToken(data.token?.value ?? null)
      setTokenLabel('')
      setMcpMsg({ type: 'success', text: 'Token generated — copy it now, it is only shown once.' })
      await loadMcpTokens()
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
      const data = await api('/api/mcp/tokens', {
        method: 'POST',
        body: JSON.stringify({ label: 'Default token' }),
      })
      setNewMcpToken(data.token?.value ?? null)
      setMcpMsg({ type: 'success', text: 'Token generated — copy it now, it is only shown once.' })
      await loadMcpTokens()
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
      await loadMcpTokens()
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

  useEffect(() => {
    api('/api/account/phone').then(d => {
      setPhone(d.phone_number ?? null)
      setPhoneInput(d.phone_number ?? '')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    api('/api/account/default-team')
      .then(d => setDefaultTeamState({ loading: false, teamId: d.default_user_team_id ?? null, teams: d.teams || [] }))
      .catch(() => setDefaultTeamState(s => ({ ...s, loading: false })))
  }, [])

  async function handleDefaultTeamChange(teamIdVal) {
    setDefaultTeamSaving(true)
    try {
      const d = await api('/api/account/default-team', {
        method: 'PATCH',
        body: JSON.stringify({ default_user_team_id: teamIdVal }),
      })
      setDefaultTeamState(prev => ({ ...prev, teamId: d.default_user_team_id ?? null }))
      onKeyUpdated?.()
    } catch (e) {
      setPhoneMsg({ type: 'error', text: e.message || 'Could not update default team' })
    } finally {
      setDefaultTeamSaving(false)
    }
  }

  async function handleSavePhone() {
    setPhoneMsg(null)
    setPhoneSaving(true)
    try {
      const d = await api('/api/account/phone', { method: 'POST', body: JSON.stringify({ phone_number: phoneInput.trim() }) })
      setPhone(d.phone_number)
      setPhoneInput(d.phone_number)
      setPhoneMsg({ type: 'success', text: 'Phone number saved.' })
    } catch (e) {
      setPhoneMsg({ type: 'error', text: e.message })
    } finally {
      setPhoneSaving(false)
    }
  }

  async function handleDeletePhone() {
    if (!window.confirm('Remove your phone number?')) return
    setPhoneDeleting(true)
    setPhoneMsg(null)
    try {
      await api('/api/account/phone', { method: 'DELETE' })
      setPhone(null)
      setPhoneInput('')
      setPhoneMsg({ type: 'success', text: 'Phone number removed.' })
    } catch (e) {
      setPhoneMsg({ type: 'error', text: e.message })
    } finally {
      setPhoneDeleting(false)
    }
  }

  async function handleChangePassword() {
    setPwMsg(null)
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' })
      return
    }
    if (newPassword.length < 8) {
      setPwMsg({ type: 'error', text: 'New password must be at least 8 characters.' })
      return
    }
    setPwSaving(true)
    try {
      await api('/api/account/password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      setPwMsg({ type: 'success', text: 'Password updated successfully.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (e) {
      setPwMsg({ type: 'error', text: e.message })
    } finally {
      setPwSaving(false)
    }
  }

  const loadKeys = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api('/api/account/api-keys')
      setKeys(data.keys || [])
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadKeys() }, [loadKeys])

  const anthropicKey = keys.find(k => k.provider === 'anthropic')

  async function handleSave() {
    if (!newKey.trim()) return
    setSaving(true)
    setMsg(null)
    try {
      await api('/api/account/api-keys', { method: 'POST', body: JSON.stringify({ provider: 'anthropic', api_key: newKey.trim() }) })
      setNewKey('')
      setMsg({ type: 'success', text: 'API key saved and encrypted.' })
      await loadKeys()
      onKeyUpdated?.()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Remove your stored Anthropic API key?')) return
    setDeleting(true)
    setMsg(null)
    try {
      await api('/api/account/api-keys/anthropic', { method: 'DELETE' })
      setMsg({ type: 'success', text: 'API key removed.' })
      await loadKeys()
      onKeyUpdated?.()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setDeleting(false)
    }
  }

  // ── subtab helpers ──────────────────────────────────────────────────────────
  const SETTINGS_TABS = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'auth',    label: 'Authorization', icon: Shield },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Subtab bar */}
      <div className="flex items-center gap-1 border-b border-border pb-0">
        {SETTINGS_TABS.map(t => {
          const Icon = t.icon
          const active = settingsTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Account tab ─────────────────────────────────────────────────────── */}
      {settingsTab === 'account' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* Profile */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0"><User className="w-3.5 h-3.5" /></span>
              Profile
            </h2>
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-3">
                {me?.figure && <HabboFigure figure={me.figure} size="sm" animate={false} />}
                <div>
                  <p className="text-sm font-medium text-foreground">{me?.habbo_username}</p>
                  <p className="text-xs text-muted-foreground">{me?.email}</p>
                </div>
                {!!me?.is_developer && (
                  <span className="ml-auto text-xs bg-primary/10 text-primary border border-primary/20 rounded px-2 py-0.5">Developer</span>
                )}
              </div>
            </div>
          </section>

          {/* Phone Number */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0"><Phone className="w-3.5 h-3.5" /></span>
              Phone Number
            </h2>
            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Link your number to trigger agents by SMS or voice via Twilio. Use E.164 format, e.g. <span className="font-mono">+31612345678</span>.
              </p>
              {phoneMsg && (
                <div className={`text-xs rounded-lg px-3 py-2 flex items-center gap-2 ${phoneMsg.type === 'success' ? 'bg-success/10 text-success border border-success/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
                  {phoneMsg.type === 'success' ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                  {phoneMsg.text}
                </div>
              )}
              {phone && (
                <div className="flex items-center justify-between bg-background rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Current number</p>
                    <p className="text-sm font-mono text-foreground">{phone}</p>
                  </div>
                  <button onClick={handleDeletePhone} disabled={phoneDeleting}
                    className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/70 border border-destructive/30 hover:border-destructive/50 rounded px-2 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {phoneDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Remove
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input type="tel" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder="+31612345678"
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  onKeyDown={e => e.key === 'Enter' && handleSavePhone()} />
                <button onClick={handleSavePhone} disabled={phoneSaving || !phoneInput.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {phoneSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                </button>
              </div>
              <div className="border-t border-border pt-4 space-y-2">
                <p className="text-xs font-medium text-foreground">Default team for SMS &amp; voice</p>
                <p className="text-[11px] text-muted-foreground">
                  When you text or call in, this team&apos;s config is used first. The first team you fork is set automatically; change it here anytime.
                </p>
                {defaultTeamState.loading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading teams…</div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <select
                      value={defaultTeamState.teamId ?? ''}
                      onChange={e => handleDefaultTeamChange(e.target.value === '' ? null : Number(e.target.value))}
                      disabled={defaultTeamSaving || defaultTeamState.teams.length === 0}
                      className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                    >
                      <option value="">— No default (use first team) —</option>
                      {defaultTeamState.teams.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    {defaultTeamSaving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ── Authorization tab ────────────────────────────────────────────────── */}
      {settingsTab === 'auth' && (
        <div className="space-y-6">

          {/* Anthropic API Key + Change Password — side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

            {/* Anthropic API Key */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0"><Key className="w-3.5 h-3.5" /></span>
                Anthropic API Key
              </h2>
              <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Your personal key is used when you trigger agent teams. It overrides the server default so your usage is billed to your own Anthropic account.
                  Stored AES-256-GCM encrypted — never in plain text.
                </p>

                {msg && (
                  <div className={`text-xs rounded-lg px-3 py-2 flex items-center gap-2 ${msg.type === 'success' ? 'bg-success/10 text-success border border-success/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
                    {msg.type === 'success' ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                    {msg.text}
                  </div>
                )}

                {loading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
                ) : anthropicKey ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between bg-background rounded-lg border border-border px-3 py-2">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Current key</p>
                        <p className="text-sm font-mono text-foreground">{anthropicKey.masked}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Updated {new Date(anthropicKey.updated_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-1.5 ml-4">
                        <button onClick={handleDelete} disabled={deleting}
                          className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/70 border border-destructive/30 hover:border-destructive/50 rounded px-2 py-1 transition-colors disabled:opacity-50">
                          {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Remove
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">To replace, enter a new key below and save.</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertCircle className="w-3.5 h-3.5 text-warning" />
                    No personal key stored — server default key will be used.
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">{anthropicKey ? 'Replace key' : 'Add your key'}</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={newKey}
                        onChange={e => setNewKey(e.target.value)}
                        placeholder="sk-ant-api03-..."
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10"
                        onKeyDown={e => e.key === 'Enter' && handleSave()}
                      />
                      <button type="button" onClick={() => setShowKey(v => !v)}
                        aria-label={showKey ? 'Hide API key' : 'Show API key'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <button onClick={handleSave} disabled={saving || !newKey.trim()}
                      className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Get your key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">console.anthropic.com</a></p>
                </div>
              </div>
            </section>

            {/* Change Password */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0"><Shield className="w-3.5 h-3.5" /></span>
                Change Password
              </h2>
              <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                {pwMsg && (
                  <div className={`text-xs rounded-lg px-3 py-2 flex items-center gap-2 ${pwMsg.type === 'success' ? 'bg-success/10 text-success border border-success/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
                    {pwMsg.type === 'success' ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                    {pwMsg.text}
                  </div>
                )}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Current password</label>
                    <div className="relative">
                      <input type={showCurrentPw ? 'text' : 'password'} value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)} placeholder="••••••••"
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10" />
                      <button type="button" onClick={() => setShowCurrentPw(v => !v)}
                        aria-label={showCurrentPw ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showCurrentPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">New password</label>
                    <div className="relative">
                      <input type={showNewPw ? 'text' : 'password'} value={newPassword}
                        onChange={e => setNewPassword(e.target.value)} placeholder="Min. 8 characters"
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10" />
                      <button type="button" onClick={() => setShowNewPw(v => !v)}
                        aria-label={showNewPw ? 'Hide new password' : 'Show new password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showNewPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Confirm new password</label>
                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password" onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                  <button onClick={handleChangePassword}
                    disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword}
                    className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {pwSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Update password
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* MCP — Pro / Enterprise: one-click token (non-developers) */}
          {canUseMcpTokens && !me?.is_developer && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0"><Key className="w-3.5 h-3.5" /></span>
                Habbo MCP
                <McpHealthBadge health={mcpHealth} />
              </h2>
              {mcpMsg && (
                <div className={`text-xs rounded-lg px-3 py-2 flex items-center gap-2 ${mcpMsg.type === 'success' ? 'bg-success/10 text-success border border-success/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
                  {mcpMsg.type === 'success' ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                  {mcpMsg.text}
                </div>
              )}
              {newMcpToken && (
                <div className="bg-success/10 border border-success/20 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-medium text-success">Copy this token now — it is only shown once!</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-xs bg-background/50 border border-border rounded-lg px-3 py-2 break-all">
                      {newMcpToken}
                    </code>
                    <button type="button" onClick={() => copyMcpToken(newMcpToken)} aria-label="Copy token"
                      className="h-8 w-8 flex-shrink-0 flex items-center justify-center border border-border rounded-lg hover:bg-secondary transition-colors">
                      {copiedToken ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                {mcpLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                  </div>
                ) : (() => {
                  const now = new Date()
                  const hasActive = (mcpTokens || []).some(t => t.status === 'active' && new Date(t.expires_at) > now)
                  if (newMcpToken) {
                    return (
                      <p className="text-xs text-muted-foreground">
                        Paste this token into your MCP client if you use one outside the portal. Deploy teams from the Teams tab when you are ready.
                      </p>
                    )
                  }
                  if (hasActive) {
                    return (
                      <>
                        <p className="text-sm text-foreground">Your MCP token is active. You can deploy teams from the Teams tab.</p>
                        <ul className="space-y-2">
                          {mcpTokens.filter(t => t.status === 'active' && new Date(t.expires_at) > now).map(token => (
                            <li key={token.id} className="flex items-center justify-between gap-2 text-xs border border-border rounded-lg px-3 py-2 bg-background">
                              <span className="text-muted-foreground truncate">{token.token_label || 'Token'} · expires {new Date(token.expires_at).toLocaleDateString()}</span>
                              <button type="button" onClick={() => handleRevokeToken(token.id)}
                                disabled={mcpBusy}
                                className="h-7 px-2 text-xs border border-destructive/30 text-destructive rounded-md hover:bg-destructive/10 disabled:opacity-50 flex-shrink-0">
                                Revoke
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )
                  }
                  return (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Generate a token so your agents can talk to the hotel. You only need to do this once.
                      </p>
                      <button type="button" onClick={handleStartBuilding} disabled={mcpBusy}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        {mcpBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Start building!
                      </button>
                    </>
                  )
                })()}
              </div>
            </section>
          )}

          {/* MCP Tokens — developer (full diagnostics) */}
          {canUseMcpTokens && !!me?.is_developer && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0"><Key className="w-3.5 h-3.5" /></span>
                MCP Tokens
                <McpHealthBadge health={mcpHealth} />
                <span className="ml-auto text-[10px] bg-primary/10 text-primary border border-primary/20 rounded px-1.5 py-0.5">Developer</span>
              </h2>

              {mcpMsg && (
                <div className={`text-xs rounded-lg px-3 py-2 flex items-center gap-2 ${mcpMsg.type === 'success' ? 'bg-success/10 text-success border border-success/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
                  {mcpMsg.type === 'success' ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                  {mcpMsg.text}
                </div>
              )}

              {/* Habbo MCP connection + auth source */}
              {(() => {
                const loadingStatus = habboMcpStatus === null
                const habboServer = habboMcpStatus?.servers?.find(s =>
                  s.name?.toLowerCase().includes('hotel') ||
                  s.name?.toLowerCase().includes('habbo') ||
                  s.name?.toLowerCase().includes('mcp')
                ) ?? habboMcpStatus?.servers?.[0] ?? null
                return (
                  <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <ServerCog className="w-3.5 h-3.5" />
                      Habbo MCP Connection
                    </h3>
                    {loadingStatus ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span className="text-xs">Checking…</span>
                      </div>
                    ) : habboMcpStatus?.error ? (
                      <div className="flex items-center gap-2 text-warning">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="text-xs">{habboMcpStatus.error}</span>
                      </div>
                    ) : habboServer ? (
                      <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${habboServer.reachable ? 'bg-success' : 'bg-destructive'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{habboServer.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{habboServer.url}</p>
                        </div>
                        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border font-medium flex-shrink-0 ${
                          habboServer.reachable
                            ? 'text-success border-success/30 bg-success/10'
                            : 'text-destructive border-destructive/30 bg-destructive/10'
                        }`}>
                          {habboServer.reachable
                            ? <><Wifi className="w-3 h-3 mr-1" />Connected</>
                            : <><WifiOff className="w-3 h-3 mr-1" />Unreachable</>
                          }
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No Habbo MCP server detected. Configure it in agent-trigger.</p>
                    )}

                    {mcpAuthSource !== null && (
                      <div className="pt-2 mt-2 border-t border-border flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Auth source:</span>
                        {mcpAuthSource === 'user_token' && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                            <Key className="w-3 h-3" /> User-generated token
                          </span>
                        )}
                        {mcpAuthSource === 'env_key' && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">
                            <Key className="w-3 h-3" /> .env MCP_API_KEY (fallback)
                          </span>
                        )}
                        {mcpAuthSource === 'none' && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                            <AlertCircle className="w-3 h-3" /> No key configured
                          </span>
                        )}
                        {mcpAuthSource === 'env_key' && (
                          <span className="text-xs text-muted-foreground ml-auto">Generate a token below to use user auth instead</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Revealed new token (shown once) */}
              {newMcpToken && (
                <div className="bg-success/10 border border-success/20 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-medium text-success">Copy this token now — it is only shown once!</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-xs bg-background/50 border border-border rounded-lg px-3 py-2 break-all">
                      {newMcpToken}
                    </code>
                    <button onClick={() => copyMcpToken(newMcpToken)} aria-label="Copy token"
                      className="h-8 w-8 flex-shrink-0 flex items-center justify-center border border-border rounded-lg hover:bg-secondary transition-colors">
                      {copiedToken ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Generate token + token list — side by side on large screens */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Generate Token</h3>
                  <p className="text-xs text-muted-foreground">
                    Tokens authenticate your Habbo hotel MCP server. Required before deploying agent teams.
                    Endpoint: <code className="font-mono bg-muted px-1 py-0.5 rounded">/mcp</code> on your hosted <code className="font-mono bg-muted px-1 py-0.5 rounded">hotel-mcp</code> domain.
                  </p>
                  <div className="flex gap-2">
                    <input placeholder="Token label (optional)" value={tokenLabel}
                      onChange={e => setTokenLabel(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateToken()}
                      className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                    <button onClick={handleCreateToken} disabled={mcpBusy}
                      className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 flex-shrink-0">
                      {mcpBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Generate
                    </button>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Tokens</h3>
                  {mcpLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                    </div>
                  ) : mcpTokens.length === 0 ? (
                    <div className="flex flex-col items-center gap-1.5 py-4 text-center">
                      <Key className="w-5 h-5 text-muted-foreground/40" />
                      <p className="text-xs font-medium text-foreground">No tokens yet</p>
                      <p className="text-xs text-muted-foreground">Generate a token above to connect via MCP.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {mcpTokens.map(token => (
                        <div key={token.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${token.status === 'active' ? 'bg-success' : 'bg-muted-foreground/40'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">#{token.id} {token.token_label || '(no label)'}</p>
                            <p className="text-xs text-muted-foreground">
                              {token.status} · expires {new Date(token.expires_at).toLocaleDateString()} · last used {token.last_used_at ? new Date(token.last_used_at).toLocaleDateString() : 'never'}
                            </p>
                          </div>
                          <button onClick={() => handleRevokeToken(token.id)}
                            disabled={mcpBusy || token.status !== 'active'}
                            className="h-7 px-3 text-xs border border-destructive/30 text-destructive rounded-md hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0">
                            Revoke
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent MCP calls */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent MCP Calls</h3>
                {mcpCalls.length === 0 ? (
                  <div className="flex flex-col items-center gap-1.5 py-4 text-center">
                    <Terminal className="w-5 h-5 text-muted-foreground/40" />
                    <p className="text-xs font-medium text-foreground">No calls yet</p>
                    <p className="text-xs text-muted-foreground">Tool calls from your agents will appear here.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {mcpCalls.map(call => (
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
                )}
              </div>
            </section>
          )}

          {/* Voice & Audio */}
          <VoiceAudioSettings keys={keys} loadKeys={loadKeys} />

        </div>
      )}
    </div>
  )
}
