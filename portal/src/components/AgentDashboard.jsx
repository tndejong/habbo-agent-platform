import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import { HabboFigure } from './HabboFigure'
import { SkillDetail } from './MarketplaceView'
import { SkillChip } from './SkillChip'
import { api } from '../utils/api'
import { friendlyFetchError } from '../utils/fetchError'
import { useToast } from '../ToastContext'
import { can } from '../utils/permissions'
import { parseSkillSlugs, parseSkills } from '../utils/parseSkills'
import { useSkillsCatalog } from '../utils/useSkillsCatalog'
import { useEscapeKey } from '../utils/useEscapeKey'
import {
  Bot, Edit2, Trash2, Plus, X, Check,
  Loader2, AlertCircle, AlertTriangle, Users, Zap, ChevronLeft, Square,
  Shield, Wifi, WifiOff, Key, ServerCog, Terminal, RefreshCw, User, Eye, EyeOff,
  Phone, Copy, Sparkles, LinkIcon,
  Bold, Italic, Code, Heading2, List, ListOrdered, Link, Minus,
  FileText, Building2, Workflow, ExternalLink,
} from 'lucide-react'

// ── Markdown Editor ───────────────────────────────────────────────────────

function MarkdownEditor({ value, onChange, placeholder, rows = 16 }) {
  const [mode, setMode] = useState('edit')
  const textareaRef = useRef(null)

  function insert({ before, after = '', placeholder: ph = '' }) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end) || ph
    const newValue = value.slice(0, start) + before + selected + after + value.slice(end)
    onChange(newValue)
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      el.focus()
      const cursor = selected === ph
        ? start + before.length + ph.length
        : start + before.length + selected.length + after.length
      el.setSelectionRange(
        start + before.length,
        start + before.length + selected.length,
      )
    })
  }

  function insertLine(prefix) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    // Find start of line
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const newValue = value.slice(0, lineStart) + prefix + value.slice(lineStart)
    onChange(newValue)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(lineStart + prefix.length, lineStart + prefix.length)
    })
  }

  const tools = [
    { icon: Bold,        title: 'Bold',           action: () => insert({ before: '**', after: '**', placeholder: 'bold text' }) },
    { icon: Italic,      title: 'Italic',         action: () => insert({ before: '_', after: '_', placeholder: 'italic text' }) },
    { icon: Code,        title: 'Inline code',    action: () => insert({ before: '`', after: '`', placeholder: 'code' }) },
    { icon: Heading2,    title: 'Heading',        action: () => insertLine('## ') },
    { icon: List,        title: 'Bullet list',    action: () => insertLine('- ') },
    { icon: ListOrdered, title: 'Numbered list',  action: () => insertLine('1. ') },
    { icon: Link,        title: 'Link',           action: () => insert({ before: '[', after: '](url)', placeholder: 'link text' }) },
    { icon: Minus,       title: 'Divider',        action: () => insert({ before: '\n---\n', placeholder: '' }) },
  ]

  return (
    <div className="rounded-md border border-border overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-border bg-muted/30">
        <button
          type="button"
          onClick={() => setMode('edit')}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'edit' ? 'text-foreground bg-background border-r border-border' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setMode('preview')}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'preview' ? 'text-foreground bg-background border-r border-border' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Preview
        </button>
        <span className="ml-auto px-3 text-xs text-muted-foreground/50">Markdown</span>
      </div>

      {/* Formatting toolbar — only in edit mode */}
      {mode === 'edit' && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/20">
          {tools.map(({ icon: Icon, title, action }) => (
            <button
              key={title}
              type="button"
              title={title}
              onMouseDown={e => { e.preventDefault(); action() }}
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      )}

      {/* Edit mode */}
      {mode === 'edit' && (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full text-sm bg-background px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none font-mono resize-y min-h-[200px]"
        />
      )}

      {/* Preview mode */}
      {mode === 'preview' && (
        <div className="px-4 py-3 min-h-[200px] bg-background prose prose-sm dark:prose-invert max-w-none
          [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-foreground [&_h1]:mb-2
          [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-4 [&_h2]:mb-1
          [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-3 [&_h3]:mb-1
          [&_p]:text-sm [&_p]:text-muted-foreground [&_p]:my-1
          [&_ul]:text-sm [&_ul]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1
          [&_ol]:text-sm [&_ol]:text-muted-foreground [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1
          [&_li]:my-0.5
          [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-primary
          [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto
          [&_strong]:text-foreground [&_strong]:font-semibold
          [&_hr]:border-border">
          {value ? <ReactMarkdown>{value}</ReactMarkdown> : <p className="text-muted-foreground/50 text-sm italic">Nothing to preview yet.</p>}
        </div>
      )}
    </div>
  )
}

// ── Account View ──────────────────────────────────────────────────────────

export function AccountView({ me, onKeyUpdated, onTokenChange }) {
  const [settingsTab, setSettingsTab] = useState('account') // 'account' | 'auth'

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

  // MCP tokens + Habbo MCP connection status — dev only
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

  // Fetch Habbo MCP status once on mount (dev only)
  useEffect(() => {
    if (!me?.is_developer) return
    fetch('/api/agents/status', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setHabboMcpStatus(d.mcp ?? { error: 'No MCP data returned' }))
      .catch(() => setHabboMcpStatus({ error: 'Could not reach agent-trigger' }))
  }, [me?.is_developer])

  const loadMcpTokens = useCallback(async () => {
    if (!me?.is_developer) return
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
      // non-blocking — tokens section will be empty
    } finally {
      setMcpLoading(false)
    }
  }, [me?.is_developer])

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
              onClick={() => setSettingsTab(t.id)}
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

          {/* MCP Tokens — developer only */}
          {!!me?.is_developer && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0"><Key className="w-3.5 h-3.5" /></span>
                MCP Tokens
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
        </div>
      )}
    </div>
  )
}

// ── Main Dashboard Component ───────────────────────────────────────────────

export function AgentDashboard({ me, onActiveTeamChange, onStopTeam, mcpTokenVersion }) {
  const [tab, setTab] = useState('teams')
  const [inSubpage, setInSubpage] = useState(false)
  const [activeTeam, setActiveTeam] = useState(null)  // my own active run
  const [stopping, setStopping] = useState(false)

  const [liveBots, setLiveBots] = useState([])
  const [logLines, setLogLines] = useState([])
  const [logPaused, setLogPaused] = useState(false)
  const [teamError, setTeamError] = useState(null)
  const prevActiveTeam = useRef(null)

  // Poll agent-trigger health every 5s — find this user's own run by matching username
  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch('/api/agents/status', { credentials: 'include' })
        const d = await res.json().catch(() => ({}))
        const runs = d.trigger?.activeRuns ?? []
        // Match the run that was triggered by this user (by Habbo username)
        const myRun = runs.find(r => r.from === me?.username) ?? null
        setActiveTeam(myRun)
        onActiveTeamChange?.(myRun)
        setLiveBots((d.bots || []).filter(b => b.room_id > 0))
      } catch { setActiveTeam(null) }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [me?.username])

  // Poll logs every 3s — filter to this user's room so they only see their own output
  const fetchLogs = useCallback(async () => {
    try {
      const roomParam = activeTeam?.roomId ? `&room_id=${activeTeam.roomId}` : ''
      const res = await fetch(`/api/agents/logs?lines=150${roomParam}`, { credentials: 'include' })
      const d = await res.json().catch(() => ({}))
      if (!d.lines) return d
      setLogLines(d.lines)

      // Detect errors by scanning the last 20 lines
      // Only show banner if there's no active team (crash) and we haven't already shown it
      const tail = d.lines.slice(-20).join('\n')
      const hasRecentError = /\[trigger\].*error:/i.test(tail)
      if (hasRecentError && !activeTeam) {
        if (/credit balance is too low/i.test(tail)) {
          setTeamError({ type: 'billing', message: 'Anthropic credit balance is too low — top up at console.anthropic.com' })
        } else {
          const errLine = d.lines.slice(-20).reverse().find(l => /\[trigger\].*error:/i.test(l))
          const detail = errLine ? errLine.split('error:')[1]?.trim() : null
          setTeamError({ type: 'error', message: detail || 'Team stopped with an error — check the log panel for details' })
        }
      }
      return d
    } catch { return {} }
  }, [activeTeam])

  useEffect(() => {
    fetchLogs()
    if (logPaused) return
    const id = setInterval(fetchLogs, 3000)
    return () => clearInterval(id)
  }, [logPaused, fetchLogs])

  async function stopTeam() {
    setStopping(true)
    try {
      // Pass room_id so only this user's room is stopped, not other users' runs
      await api('/api/agents/stop', {
        method: 'POST',
        body: JSON.stringify({ room_id: activeTeam?.roomId }),
      })
    } catch { /* ignore */ }
    finally { setStopping(false) }
  }

  const tabs = [
    { id: 'teams', label: 'Teams', icon: Users },
    { id: 'personas', label: 'Personas', icon: User },
  ]

  return (
    <div className="bg-background">
      {/* Sub-tabs — hidden when inside a team/persona detail page */}
      {!inSubpage && <div className="border-b border-border bg-card/30">
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          {tabs.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {badge && (
                <span className="w-4 h-4 rounded-full bg-success text-success-foreground text-[9px] font-bold flex items-center justify-center">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>}

      {/* Error banner */}
      {teamError && (
        <div className={`border-b px-4 py-3 flex items-center gap-3 ${
          teamError.type === 'billing'
            ? 'bg-warning/10 border-warning/30'
            : 'bg-destructive/10 border-destructive/30'
        }`}>
          <AlertCircle className={`w-4 h-4 flex-shrink-0 ${teamError.type === 'billing' ? 'text-warning' : 'text-destructive'}`} />
          <span className={`text-sm flex-1 ${teamError.type === 'billing' ? 'text-warning/80' : 'text-destructive/80'}`}>
            {teamError.type === 'billing' && <strong>Billing: </strong>}
            {teamError.message}
            {teamError.type === 'billing' && (
              <a href="https://console.anthropic.com" target="_blank" rel="noreferrer"
                className="ml-2 underline underline-offset-2 hover:text-warning/70">
                Add credits →
              </a>
            )}
          </span>
          <button onClick={() => setTeamError(null)} aria-label="Dismiss error" className="text-muted-foreground hover:text-foreground ml-auto flex-shrink-0 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* IntegratedView is always mounted so state (teams, personas, modals) persists across tab switches */}
        <IntegratedView me={me} onAfterTrigger={fetchLogs} liveBots={liveBots} mcpTokenVersion={mcpTokenVersion} activeSection={tab} onSubpageChange={setInSubpage} />
        {/* Live log panel — shown when a team is running */}
        {activeTeam && (
          <LogPanel lines={logLines} paused={logPaused} onTogglePause={() => setLogPaused(p => !p)} />
        )}
      </div>
    </div>
  )
}

// ── Log Panel ─────────────────────────────────────────────────────────────

const LOG_COLORS = {
  '[session]':  'text-violet-400 font-medium',
  '[mcp:ok]':   'text-emerald-400',
  '[mcp:err]':  'text-destructive',
  '[tool←]':    'text-emerald-400',
  '[think]':    'text-warning/80',
  '[done]':     'text-green-400 font-semibold',
  '[trigger]':  'text-purple-400',
  '[narrator]': 'text-pink-400',
  '[claude:err]': 'text-destructive',
  '[voice]':    'text-cyan-400',
  '[sms]':      'text-cyan-400',
  '[timeout]':  'text-destructive',
}

// Claude CLI emits MCP tools as mcp__<server-name>__<tool-name>
// Map server-name substrings → integration display key
const MCP_SERVER_INTEGRATION_MAP = [
  ['hotel',      'habbo'],
  ['habbo',      'habbo'],
  ['atlassian',  'atlassian'],
  ['jira',       'atlassian'],
  ['confluence', 'atlassian'],
  ['notion',     'notion'],
  ['resend',     'resend'],
  ['email',      'resend'],
  ['web',        'web'],
  ['browser',    'web'],
]

const INTEGRATION_DISPLAY = {
  habbo:     { label: 'Habbo MCP',      color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20',   toolColor: 'text-amber-300' },
  atlassian: { label: 'Jira/Confluence', color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20',     toolColor: 'text-blue-300' },
  notion:    { label: 'Notion',          color: 'text-neutral-300', bg: 'bg-neutral-500/10 border-neutral-500/20', toolColor: 'text-neutral-300' },
  resend:    { label: 'Email',           color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', toolColor: 'text-emerald-300' },
  web:       { label: 'Web',             color: 'text-sky-400',     bg: 'bg-sky-500/10 border-sky-500/20',       toolColor: 'text-sky-300' },
  mcp:       { label: 'MCP',            color: 'text-violet-400',   bg: 'bg-violet-500/10 border-violet-500/20', toolColor: 'text-violet-300' },
}

function extractToolName(line) {
  const m = line.match(/\[tool→\]\s+(\S+)/)
  return m ? m[1] : null
}

/**
 * Given a raw tool name from the log (e.g. "mcp__hotel-mcp__talk_bot" or "Read"),
 * returns the integration key or null for built-in tools.
 */
function toolToIntegrationKey(toolName) {
  if (!toolName) return null
  // Claude CLI prefixes MCP tools as mcp__<server-name>__<tool>
  const mcpMatch = toolName.match(/^mcp__(.+?)__/)
  if (mcpMatch) {
    const server = mcpMatch[1].toLowerCase()
    for (const [keyword, key] of MCP_SERVER_INTEGRATION_MAP) {
      if (server.includes(keyword)) return key
    }
    return 'mcp' // unknown MCP server — still colour it distinctly
  }
  return null // built-in tool (Read, Write, Bash, Agent…) — no integration
}

function logColor(line) {
  if (line.includes('[tool→]')) {
    const tool = extractToolName(line)
    const intKey = toolToIntegrationKey(tool)
    if (intKey) return INTEGRATION_DISPLAY[intKey].toolColor
    return 'text-info'
  }
  for (const [key, cls] of Object.entries(LOG_COLORS)) {
    if (line.includes(key)) return cls
  }
  return 'text-muted-foreground'
}

export function LogPanel({ lines, paused, onTogglePause }) {
  const bottomRef = useRef(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && !paused && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lines, autoScroll, paused])

  // Derive which MCP servers were configured at session start from [session] line
  const configuredServers = useMemo(() => {
    const sessionLine = lines.find(l => l.includes('[session]'))
    const match = sessionLine?.match(/configured:\s*(.+)/)
    if (!match) return []
    return match[1].split(',').map(s => s.trim()).filter(Boolean)
  }, [lines])

  // Derive which integrations appeared in this run from [tool→] lines
  const usedIntegrations = useMemo(() => {
    const seen = new Set()
    for (const line of lines) {
      if (!line.includes('[tool→]')) continue
      const intKey = toolToIntegrationKey(extractToolName(line))
      if (intKey) seen.add(intKey)
    }
    return [...seen]
  }, [lines])

  // Count tool calls per integration for tooltip
  const toolCallCounts = useMemo(() => {
    const counts = {}
    for (const line of lines) {
      if (!line.includes('[tool→]')) continue
      const intKey = toolToIntegrationKey(extractToolName(line))
      if (intKey) counts[intKey] = (counts[intKey] || 0) + 1
    }
    return counts
  }, [lines])

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-card flex items-center gap-2 flex-wrap">
        <Terminal className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-semibold text-foreground">Agent Logs</span>
        <span className="text-xs text-muted-foreground">— live output from running team</span>

        {/* Configured MCP server badges — shown as soon as session starts */}
        {configuredServers.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-violet-400/60 uppercase tracking-wider font-medium">MCP</span>
            {configuredServers.map(server => (
              <span
                key={server}
                className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border bg-violet-500/10 border-violet-500/20 text-violet-400"
              >
                {server}
              </span>
            ))}
          </div>
        )}

        {/* Integration call badges — appear as tools are called */}
        {usedIntegrations.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {usedIntegrations.map(key => {
              const meta = INTEGRATION_DISPLAY[key]
              const count = toolCallCounts[key] || 0
              return (
                <span
                  key={key}
                  title={`${count} ${key} tool call${count !== 1 ? 's' : ''}`}
                  className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${meta.bg} ${meta.color}`}
                >
                  {meta.label}
                  <span className="opacity-60">×{count}</span>
                </span>
              )
            })}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} className="w-3 h-3 accent-primary" />
            Auto-scroll
          </label>
          <button
            onClick={onTogglePause}
            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-colors ${paused ? 'text-warning border-warning/40 bg-warning/10' : 'text-muted-foreground border-border hover:text-foreground'}`}
          >
            <RefreshCw className={`w-3 h-3 ${paused ? '' : 'animate-spin'}`} />
            {paused ? 'Paused' : 'Live'}
          </button>
        </div>
      </div>
      <div className="h-72 overflow-y-auto font-mono text-xs px-4 py-3 space-y-0.5 bg-[#0d0d0d]">
        {lines.length === 0 && (
          <p className="text-muted-foreground/50 italic">No log entries yet — trigger a team to see output here.</p>
        )}
        {lines.map((line, i) => {
          const ts = line.slice(0, 24)
          const rest = line.slice(25)
          // For tool→ lines, annotate with a tiny integration tag
          const toolName = line.includes('[tool→]') ? extractToolName(line) : null
          const intKey = toolToIntegrationKey(toolName)
          const intMeta = intKey ? INTEGRATION_DISPLAY[intKey] : null
          return (
            <div key={i} className="flex gap-2 leading-5">
              <span className="text-muted-foreground/40 flex-shrink-0 select-none">{ts.slice(11, 23)}</span>
              {intMeta && (
                <span className={`flex-shrink-0 text-[9px] font-medium px-1 rounded border self-center ${intMeta.bg} ${intMeta.color}`}>
                  {intMeta.label}
                </span>
              )}
              <span className={logColor(line)}>{rest}</span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ── Online View ───────────────────────────────────────────────────────────

export function OnlineView() {
  const [personas, setPersonas] = useState([])
  const [liveBots, setLiveBots] = useState([])

  // Self-contained polling — works when mounted outside AgentDashboard
  useEffect(() => {
    async function poll() {
      try {
        const [pd, statusData] = await Promise.all([
          api('/api/my/personas'),
          fetch('/api/agents/status', { credentials: 'include' }).then(r => r.json().catch(() => ({}))),
        ])
        setPersonas(pd.personas || [])
        setLiveBots((statusData.bots || []).filter(b => b.room_id > 0))
      } catch { /* non-blocking */ }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [])

  const onlineAgentNames = new Set(liveBots.filter(b => b.is_agent).map(b => b.name?.toLowerCase()))

  const rooms = liveBots.reduce((acc, bot) => {
    if (!bot.is_agent) return acc // only show agent bots in room cards
    const key = bot.room_id
    if (!acc[key]) acc[key] = []
    acc[key].push(bot)
    return acc
  }, {})

  const offlinePersonas = personas.filter(p => !onlineAgentNames.has(p.name?.toLowerCase()))
  const roomCount = Object.keys(rooms).length
  const agentCount = liveBots.filter(b => b.is_agent).length

  return (
    <div className="space-y-6">
      {/* Online section */}
      <div className="space-y-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <h2 className="text-sm font-semibold text-foreground">Online</h2>
            <span className="text-xs text-muted-foreground">
              {agentCount} agent{agentCount !== 1 ? 's' : ''} in {roomCount} room{roomCount !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 ml-4">
            Only bots linked to a persona are shown here — unlinked hotel bots are not listed.
          </p>
        </div>

        {roomCount === 0 ? (
          <div className="rounded-xl border border-border bg-card/50 p-8 flex flex-col items-center gap-2 text-center">
            <WifiOff className="w-7 h-7 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No agents online</p>
            <p className="text-xs text-muted-foreground">Deploy a team to a hotel room to see agents here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(rooms).map(([roomId, bots]) => (
              <div key={roomId} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{bots[0]?.room_name || `Room ${roomId}`}</p>
                    <p className="text-xs text-muted-foreground">#{roomId}</p>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse flex-shrink-0" />
                </div>
                <div className="space-y-2">
                  {bots.map(bot => (
                    <div key={bot.id} className="flex items-center gap-3">
                      <HabboFigure figure={bot.figure || bot.persona_figure || null} size="sm" animate={true} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{bot.persona_name || bot.name}</p>
                        {bot.team_name && <p className="text-xs text-muted-foreground">{bot.team_name}</p>}
                      </div>
                      {(bot.x != null && bot.y != null) && (
                        <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums flex-shrink-0">
                          {bot.x},{bot.y}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Offline section */}
      {offlinePersonas.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
            <h2 className="text-sm font-semibold text-muted-foreground">Offline</h2>
            <span className="text-xs text-muted-foreground">{offlinePersonas.length} agent{offlinePersonas.length !== 1 ? 's' : ''} not deployed</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {offlinePersonas.map(p => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-card/30 px-4 py-3 opacity-50">
                <HabboFigure figure={p.figure || null} size="sm" animate={false} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  {p.role && <p className="text-xs text-muted-foreground">{p.role}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Integrated View ───────────────────────────────────────────────────────

function IntegratedView({ me, onAfterTrigger, liveBots = [], mcpTokenVersion = 0, activeSection = 'teams', onSubpageChange }) {
  const [personas, setPersonas] = useState([])
  const [teams, setTeams] = useState([])
  const [bots, setBots] = useState([])
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const { showToast } = useToast()
  const [error, setError] = useState(null)
  // teamPage / personaPage: null = list view, { item: null } = new, { item: {...} } = edit
  const [teamPage, setTeamPage] = useState(null)
  const [personaPage, setPersonaPage] = useState(null)

  // Tell the parent whether we're inside a subpage so it can hide the tab navbar
  useEffect(() => {
    onSubpageChange?.(teamPage !== null || personaPage !== null)
  }, [teamPage, personaPage, onSubpageChange])

  // confirmModal: null | { title, message, onConfirm }
  const [confirmModal, setConfirmModal] = useState(null)
  const [deployingIds, setDeployingIds] = useState(new Set())
  const [hasApiKey, setHasApiKey] = useState(true)
  const [hasMcpToken, setHasMcpToken] = useState(true)
  const [integrations, setIntegrations] = useState([])

  useEscapeKey(() => {
    if (personaPage) { setPersonaPage(null); return }
    if (confirmModal) setConfirmModal(null)
  }, !!(personaPage || confirmModal))

  // Permission shortcuts — derived from the canonical PERMISSIONS registry
  const canViewTeams      = can(me, 'teams.view')
  const canManageTeams    = can(me, 'teams.create')   // create implies edit/delete
  const canManagePersonas = can(me, 'personas.create')
  const canLinkBot        = can(me, 'personas.link_bot')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pd, bd, td, rd, kd, md, intd] = await Promise.all([
        api('/api/my/personas'),
        api('/api/agents/bots?mine=true'),
        api('/api/my/teams'),
        api('/api/hotel/rooms'),
        api('/api/account/api-keys'),
        api('/api/mcp/tokens'),
        api('/api/my/integrations'),
      ])
      setPersonas(pd.personas || [])
      setBots(bd.bots || [])
      setTeams(td.teams || [])
      const roomList = rd.rooms || []
      setRooms(roomList)
      setHasApiKey(!!(kd.keys || []).find(k => k.provider === 'anthropic'))
      const now = new Date()
      setHasMcpToken(!!(md.tokens || []).find(t => t.status === 'active' && new Date(t.expires_at) > now))
      setIntegrations(intd.integrations || [])
    } catch (e) {
      setError(friendlyFetchError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Re-load when mcpTokenVersion bumps (token generated/revoked in Settings while view is mounted)
  useEffect(() => { load() }, [load, mcpTokenVersion])


  async function deployTeam(team, roomId) {
    setDeployingIds(prev => new Set([...prev, team.id]))
    try {
      await api(`/api/my/teams/${team.id}/trigger`, { method: 'POST', body: JSON.stringify({ room_id: roomId }) })
      showToast(`Team "${team.name}" deployed!`)
      onAfterTrigger?.()
      setTimeout(() => onAfterTrigger?.(), 2000)
      setTimeout(() => onAfterTrigger?.(), 4000)
    } catch (e) {
      showToast(`Deploy failed: ${e.message}`, 'error')
      onAfterTrigger?.()
    } finally {
      setDeployingIds(prev => { const n = new Set(prev); n.delete(team.id); return n })
    }
  }

  function deleteTeam(team) {
    const memberPersonaIds = (team.members || []).map(m => m.persona_id).filter(Boolean)
    const memberNames = (team.members || []).map(m => m.name).filter(Boolean)
    const agentNote = memberPersonaIds.length > 0
      ? ` The linked agent${memberPersonaIds.length > 1 ? 's' : ''} (${memberNames.join(', ')}) will also be removed from your agents list.`
      : ''
    setConfirmModal({
      title: 'Delete team',
      message: `Delete "${team.name}"? This cannot be undone. You can reinstall it from the Marketplace.${agentNote}`,
      onConfirm: async () => {
        setTeams(prev => prev.filter(t => t.id !== team.id))
        if (memberPersonaIds.length > 0) {
          setPersonas(prev => prev.filter(p => !memberPersonaIds.includes(p.id)))
        }
        try {
          await api(`/api/my/teams/${team.id}`, { method: 'DELETE' })
          await Promise.all(memberPersonaIds.map(pid => api(`/api/my/personas/${pid}`, { method: 'DELETE' })))
        } catch { load() }
      },
    })
  }

  function deletePersona(persona) {
    setConfirmModal({
      title: 'Delete agent',
      message: `Delete "${persona.name}"? This cannot be undone.`,
      onConfirm: async () => {
        setPersonas(prev => prev.filter(p => p.id !== persona.id))
        try { await api(`/api/my/personas/${persona.id}`, { method: 'DELETE' }) }
        catch { load() }
      },
    })
  }

  async function linkPersonaBot(personaId, botName) {
    await api(`/api/my/personas/${personaId}/bot`, { method: 'PATCH', body: JSON.stringify({ bot_name: botName || null }) })
    setPersonas(prev => prev.map(p => p.id === personaId ? { ...p, bot_name: botName || null } : p))
  }

  async function savePersona(data) {
    const isEdit = !!personaPage?.persona
    if (isEdit) {
      await api(`/api/my/personas/${personaPage.persona.id}`, { method: 'PUT', body: JSON.stringify(data) })
    } else {
      await api('/api/my/personas', { method: 'POST', body: JSON.stringify(data) })
    }
    showToast(isEdit ? `Agent "${data.name}" updated` : `Agent "${data.name}" created`)
    setPersonaPage(null)
    load()
  }

  async function saveTeamRoomId(teamId, roomId) {
    // Optimistic local update
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, default_room_id: roomId } : t))
    try {
      // Use the dedicated PATCH endpoint so deploy-only (non-dev) pro users can
      // select a room without needing the full teams.edit permission.
      await api(`/api/my/teams/${teamId}/room`, { method: 'PATCH', body: JSON.stringify({ default_room_id: roomId }) })
    } catch { /* non-fatal — local state already updated */ }
  }

  async function saveTeam(data) {
    const isEdit = !!teamPage?.team
    let teamId = teamPage?.team?.id
    if (isEdit) {
      await api(`/api/my/teams/${teamPage.team.id}`, { method: 'PUT', body: JSON.stringify(data) })
    } else {
      const r = await api('/api/my/teams', { method: 'POST', body: JSON.stringify(data) })
      teamId = r.id
    }
    showToast(isEdit ? `Team "${data.name}" updated` : `Team "${data.name}" created`)
    setTeamPage(null)
    load()
    return { id: teamId }
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorBanner message={error} onRetry={load} />

  // ── Dedicated persona edit/new page ──────────────────────────────────────
  // Guard: only devs can reach the edit/create form (non-dev pros never set personaPage)
  if (personaPage !== null && canManagePersonas) {
    const isEditing = !!personaPage.persona
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPersonaPage(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            My Agents
          </button>
          <span className="text-muted-foreground/40 text-sm">/</span>
          <span className="text-sm text-foreground font-medium">
            {isEditing ? `Edit: ${personaPage.persona.name}` : 'New Agent'}
          </span>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <PersonaEditor
            persona={personaPage.persona}
            bots={bots}
            onSave={savePersona}
            onCancel={() => setPersonaPage(null)}
          />
        </div>
      </div>
    )
  }

  // ── Dedicated team edit/new page ──────────────────────────────────────────
  // Guard: only devs can reach the edit/create form (non-dev pros never set teamPage)
  if (teamPage !== null && canManageTeams) {
    const isEditing = !!teamPage.team
    return (
      <div className="space-y-6">
        {/* Breadcrumb / back header */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTeamPage(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            Teams
          </button>
          <span className="text-muted-foreground/40 text-sm">/</span>
          <span className="text-sm text-foreground font-medium">
            {isEditing ? `Edit: ${teamPage.team.name}` : 'New Team'}
          </span>
        </div>

        <IntegratedTeamForm
          team={teamPage.team}
          personas={personas}
          rooms={rooms}
          isDev={canManageTeams}
          onSave={saveTeam}
          onCancel={() => setTeamPage(null)}
          onViewPersona={canManagePersonas ? (persona) => { setTeamPage(null); setPersonaPage({ persona }) } : undefined}
        />
      </div>
    )
  }

  if (!canViewTeams) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-warning mx-auto" />
        <h3 className="text-sm font-semibold text-foreground">Pro tier required</h3>
        <p className="text-xs text-muted-foreground">Upgrade to Pro to deploy agent teams. Browse available teams in the Marketplace.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Teams or Personas — controlled by activeSection prop ── */}
      {activeSection === 'teams' && <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Teams</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {canManageTeams ? 'Create and deploy agent teams' : 'Deploy your assigned agent teams'}
            </p>
          </div>
          {canManageTeams && (
            <button
              onClick={() => setTeamPage({ team: null })}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3 h-3" /> New Team
            </button>
          )}
        </div>

        {teams.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No teams yet"
            description={canManageTeams
              ? 'Create a team to group and deploy your integrated agents'
              : 'No teams have been set up for your account yet. Contact your administrator.'}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger-children">
            {teams.map(team => (
              <IntegratedTeamCard
                key={team.id}
                team={team}
                canManage={canManageTeams}
                bots={bots}
                liveBots={liveBots}
                rooms={rooms}
                deploying={deployingIds.has(team.id)}
                hasApiKey={hasApiKey}
                hasMcpToken={hasMcpToken}
                integrations={integrations}
                onDeploy={(roomId) => deployTeam(team, roomId)}
                onRoomChange={(roomId) => saveTeamRoomId(team.id, roomId)}
                onEdit={canManageTeams ? () => setTeamPage({ team }) : undefined}
                onDelete={canManageTeams ? () => deleteTeam(team) : undefined}
              />
            ))}
          </div>
        )}
      </section>}

      {activeSection === 'personas' && <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Personas</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {canManagePersonas ? 'Individual hotel agent personas' : 'Your assigned hotel agent personas'}
            </p>
          </div>
          {canManagePersonas && (
            <button
              onClick={() => setPersonaPage({ persona: null })}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3 h-3" /> Add Persona
            </button>
          )}
        </div>

        {personas.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="No agents yet"
            description={canManagePersonas
              ? 'Add your first hotel agent to get started'
              : 'No agent personas have been set up for your account yet. Contact your administrator.'}
          />
        ) : (
          <div className="space-y-3">
            {personas.map(persona => (
              <PersonaCard
                key={persona.id}
                persona={persona}
                bots={bots}
                onEdit={canManagePersonas ? () => setPersonaPage({ persona }) : undefined}
                onDelete={canManagePersonas ? () => deletePersona(persona) : undefined}
                onLinkBot={canLinkBot ? linkPersonaBot : undefined}
              />
            ))}
          </div>
        )}
      </section>}

      {/* Confirm modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
          onClick={() => setConfirmModal(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{confirmModal.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{confirmModal.message}</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 h-9 rounded-lg border border-border text-sm hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { confirmModal.onConfirm(); setConfirmModal(null) }}
                className="flex-1 h-9 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Integrated Team Card ───────────────────────────────────────────────────

// Must match the server-side INTEGRATION_KEYWORDS map in portal/server.js
const INTEGRATION_KEYWORDS = {
  notion:    ['notion'],
  plane:     ['plane.so', 'plane mcp', 'planemcp'],
  linear:    ['linear.app', 'linear mcp'],
  atlassian: ['atlassian', 'jira', 'confluence'],
  airtable:  ['airtable'],
  supabase:  ['supabase'],
  resend:    ['resend'],
  github:    ['github'],
  slack:     ['slack mcp', 'slack integration'],
}

function detectRequiredIntegrations(team, members) {
  const texts = []
  try {
    const tasks = JSON.parse(team.tasks_json || '[]')
    texts.push(...tasks.map(t => `${t.title || ''} ${t.description || ''}`))
  } catch { /* skip */ }
  if (members) texts.push(...members.map(m => `${m.capabilities || ''} ${m.prompt || ''}`))
  if (team.orchestrator_prompt) texts.push(team.orchestrator_prompt)
  const combined = texts.join(' ').toLowerCase()
  return Object.entries(INTEGRATION_KEYWORDS)
    .filter(([, kws]) => kws.some(kw => combined.includes(kw)))
    .map(([name]) => name)
}

function IntegratedTeamCard({ team, canManage = false, bots = [], liveBots = [], rooms = [], deploying, hasApiKey = true, hasMcpToken = true, integrations = [], onDeploy, onRoomChange, onEdit, onDelete }) {
  const [members, setMembers] = useState(team.members || null)
  const [selectedRoomId, setSelectedRoomId] = useState(team.default_room_id || rooms[0]?.id || null)

  useEffect(() => {
    if (!selectedRoomId && rooms.length > 0) setSelectedRoomId(team.default_room_id || rooms[0].id)
  }, [rooms, team.default_room_id])

  function handleRoomChange(roomId) {
    setSelectedRoomId(roomId)
    onRoomChange?.(roomId)
  }

  useEffect(() => {
    if (team.members) { setMembers(team.members); return }
    api(`/api/my/teams/${team.id}`)
      .then(d => setMembers(d.team?.members || []))
      .catch(() => setMembers([]))
  }, [team.id, team.members])

  const memberBotNames = useMemo(() => (members || []).map(m => m.bot_name).filter(Boolean), [members])

  const roomConflict = useMemo(() => {
    if (members === null || !selectedRoomId || memberBotNames.length === 0) return null
    const conflicts = memberBotNames.flatMap(botName => {
      const bot = bots.find(b => b.name?.toLowerCase() === botName.toLowerCase())
      return (bot && bot.room_id > 0 && bot.room_id !== selectedRoomId)
        ? [{ name: botName, room_id: bot.room_id }] : []
    })
    if (conflicts.length === 0) return null
    return `${conflicts.map(c => c.name).join(', ')} ${conflicts.length === 1 ? 'is' : 'are'} active in room ${conflicts[0].room_id}`
  }, [members, memberBotNames, bots, selectedRoomId])

  const hasUnlinked = useMemo(() => members !== null && members.some(m => !m.bot_name?.trim()), [members])
  const noKey = !hasApiKey
  const noMcpToken = !hasMcpToken

  // Members whose bot_name is set but no longer exists in the hotel bot list
  const missingBots = useMemo(() => {
    if (!members || !bots) return []
    return members
      .filter(m => m.bot_name?.trim() && !bots.some(b => b.name?.toLowerCase() === m.bot_name.toLowerCase()))
      .map(m => m.bot_name)
  }, [members, bots])

  // Detect which integrations the team tasks/capabilities require and cross-check
  // against the user's connected integrations (by name substring match).
  const missingIntegrations = useMemo(() => {
    const required = detectRequiredIntegrations(team, members)
    const connectedNames = integrations.map(i => i.name?.toLowerCase() ?? '')
    return required.filter(svc => !connectedNames.some(n => n.includes(svc)))
  }, [team, members, integrations])

  const blocked = !!roomConflict || hasUnlinked || missingBots.length > 0 || noKey || noMcpToken || missingIntegrations.length > 0

  const memberCount = team.member_count ?? (members || []).length

  return (
    <div className={`rounded-xl border bg-card overflow-hidden card-lift flex flex-col ${roomConflict ? 'border-warning/40' : 'border-border'}`}>

      {/* Status banner */}
      {(roomConflict || hasUnlinked || missingBots.length > 0 || noKey || noMcpToken || missingIntegrations.length > 0) && (
        <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 border-b border-warning/20 text-xs text-warning">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {roomConflict
            ? `${roomConflict} — can't deploy to room ${selectedRoomId}`
            : hasUnlinked ? 'Some agents are missing a bot link'
            : missingBots.length > 0 ? `Bot${missingBots.length > 1 ? 's' : ''} deleted from hotel: ${missingBots.join(', ')} — reassign or recreate them`
            : noKey ? 'Add an Anthropic API key in Settings'
            : noMcpToken ? 'Generate an MCP token in Settings → MCP Tokens'
            : `Missing integrations: ${missingIntegrations.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')} — connect them in Settings → Integrations`}
        </div>
      )}

      {/* Card body */}
      <div className="p-4 flex flex-col gap-4 flex-1">

        {/* Header — clicking the header area navigates to edit */}
        <div
          className={`flex items-start gap-3 ${onEdit ? 'cursor-pointer group/header' : ''}`}
          onClick={onEdit}
          role={onEdit ? 'button' : undefined}
          tabIndex={onEdit ? 0 : undefined}
          onKeyDown={onEdit ? (e) => { if (e.key === 'Enter' || e.key === ' ') onEdit() } : undefined}
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm leading-tight transition-colors ${onEdit ? 'text-foreground group-hover/header:text-primary' : 'text-foreground'}`}>
              {team.name}
            </p>
            {team.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{team.description}</p>
            )}
          </div>
          {canManage && (
            <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
              <button onClick={onEdit} aria-label="Edit team"
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={onDelete} aria-label="Delete team"
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Members strip — also part of the clickable area */}
        <div className={`flex-1 ${onEdit ? 'cursor-pointer' : ''}`} onClick={onEdit}>
          {members === null ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading agents…
            </div>
          ) : members.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No agents assigned yet</p>
          ) : (
            <div className="flex items-end gap-3 flex-wrap">
              {members.map(m => {
                const figure = bots.find(b => b.name === m.bot_name)?.figure || null
                const liveBot = bots.find(b => b.name?.toLowerCase() === m.bot_name?.toLowerCase())
                const inWrongRoom = liveBot && liveBot.room_id > 0 && selectedRoomId && liveBot.room_id !== selectedRoomId
                const noBot = !m.bot_name?.trim()
                return (
                  <div key={m.id ?? `${m.persona_id}-${m.name}`} className="flex flex-col items-center gap-1 group/member">
                    <div className={`relative rounded-lg overflow-hidden border ${noBot ? 'border-destructive/40 bg-destructive/5' : inWrongRoom ? 'border-warning/40 bg-warning/5' : 'border-border bg-secondary/30'}`}>
                      <HabboFigure figure={figure} size="sm" animate={true} />
                      {(noBot || inWrongRoom) && (
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full flex items-center justify-center bg-background border border-border">
                          <AlertTriangle className="w-2 h-2 text-warning" />
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground text-center leading-tight max-w-[52px] truncate">{m.name}</span>
                    {m.role && <span className="text-[9px] text-muted-foreground/60 text-center leading-tight max-w-[52px] truncate">{m.role}</span>}
                  </div>
                )
              })}
              <span className="text-[10px] text-muted-foreground/60 self-center ml-auto">
                {memberCount} agent{memberCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Footer: room + deploy */}
        <div className="flex items-center gap-2 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="text-xs text-muted-foreground flex-shrink-0">Room</span>
            {rooms.length > 0 ? (
              <select
                value={selectedRoomId ?? ''}
                onChange={e => handleRoomChange(Number(e.target.value))}
                className="flex-1 min-w-0 bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {rooms.map(r => <option key={r.id} value={r.id}>#{r.id} — {r.name}</option>)}
              </select>
            ) : (
              <input
                type="number" min="1"
                value={selectedRoomId ?? ''}
                onChange={e => handleRoomChange(Number(e.target.value))}
                placeholder="Room ID"
                className="w-24 bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            )}
          </div>
          <button
            onClick={() => onDeploy(selectedRoomId)}
            disabled={deploying || blocked}
            title={
              noKey ? 'Add an Anthropic API key in Settings'
              : noMcpToken ? 'Generate an MCP token in Settings → MCP Tokens'
              : missingBots.length > 0 ? `Bots deleted from hotel: ${missingBots.join(', ')}`
              : missingIntegrations.length > 0 ? `Connect integrations first: ${missingIntegrations.join(', ')}`
              : roomConflict || undefined
            }
            className={`flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-md font-medium transition-colors flex-shrink-0 ${
              blocked
                ? 'bg-warning/20 text-warning border border-warning/30 cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            {deploying
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deploying…</>
              : blocked
                ? <><AlertTriangle className="w-3.5 h-3.5" /> Blocked</>
                : <><Zap className="w-3.5 h-3.5" /> Deploy</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Integrated Team Form ───────────────────────────────────────────────────

const TEAM_LANGUAGES = [
  { code: 'en', label: '🇬🇧 English' },
  { code: 'nl', label: '🇳🇱 Dutch' },
  { code: 'de', label: '🇩🇪 German' },
  { code: 'fr', label: '🇫🇷 French' },
  { code: 'es', label: '🇪🇸 Spanish' },
  { code: 'it', label: '🇮🇹 Italian' },
  { code: 'pt', label: '🇵🇹 Portuguese' },
  { code: 'pl', label: '🇵🇱 Polish' },
  { code: 'tr', label: '🇹🇷 Turkish' },
  { code: 'sv', label: '🇸🇪 Swedish' },
]

const VERBOSITY_LABELS = [
  { value: 3,  label: 'Minimal', desc: 'Start/finish announcements only. Very few mid-session updates.' },
  { value: 6,  label: 'Normal',  desc: 'Start/finish plus key actions narrated in the room.' },
  { value: 10, label: 'Verbose', desc: 'Everything narrated — every action reported in the room.' },
]

function IntegratedTeamForm({ team, personas, rooms = [], isDev, onSave, onCancel, onViewPersona }) {
  const [name, setName] = useState(team?.name || '')
  const [description, setDescription] = useState(team?.description || '')
  const [orchestratorPrompt, setOrchestratorPrompt] = useState(team?.orchestrator_prompt || '')
  const [executionMode, setExecutionMode] = useState(team?.execution_mode || 'shared')
  const [language, setLanguage] = useState(team?.language || 'en')
  const [narratorVerbosity, setNarratorVerbosity] = useState(
    typeof team?.narrator_verbosity === 'number' ? Math.max(3, team.narrator_verbosity) : 3
  )
  const [defaultRoomId, setDefaultRoomId] = useState(team?.default_room_id || '')
  const parsedTasks = (() => {
    try {
      let v = JSON.parse(team?.tasks_json || '[]')
      // Unwrap any number of extra stringify layers (e.g. from saveTeamRoomId corruption)
      let guard = 0
      while (typeof v === 'string' && guard++ < 5) { try { v = JSON.parse(v) } catch { break } }
      return Array.isArray(v) ? v : []
    } catch { return [] }
  })()
  const [tasks, setTasks] = useState(parsedTasks.length ? parsedTasks : [])
  const [members, setMembers] = useState([]) // { id (atm.id), persona_id, name, role }
  const [addPersonaId, setAddPersonaId] = useState('')
  const [addRole, setAddRole] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    if (!team?.id) return
    api(`/api/my/teams/${team.id}`).then(d => {
      setMembers((d.team?.members || []).map(m => ({ id: m.id, persona_id: m.persona_id, name: m.name, role: m.role || '' })))
    }).catch(() => {})
  }, [team?.id])

  function addTask() {
    const id = `t${tasks.length + 1}`
    setTasks(prev => [...prev, { id, title: '', description: '', assign_to: '', depends_on: [] }])
  }
  function updateTask(idx, field, value) {
    setTasks(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t))
  }
  function removeTask(idx) {
    setTasks(prev => prev.filter((_, i) => i !== idx).map((t, i) => ({ ...t, id: `t${i + 1}` })))
  }
  function toggleDepend(taskIdx, depId) {
    setTasks(prev => prev.map((t, i) => {
      if (i !== taskIdx) return t
      const deps = t.depends_on || []
      return { ...t, depends_on: deps.includes(depId) ? deps.filter(d => d !== depId) : [...deps, depId] }
    }))
  }

  async function handleSave() {
    if (!name.trim()) { setFormError('Name is required'); return }
    setSaving(true)
    setFormError(null)
    try {
      const savedTeam = await onSave({ name: name.trim(), description: description.trim(), orchestrator_prompt: orchestratorPrompt.trim(), execution_mode: executionMode, tasks_json: tasks, language, narrator_verbosity: narratorVerbosity, default_room_id: defaultRoomId || undefined })
      const teamId = savedTeam?.id || team?.id
      if (teamId) {
        // Sync members: fetch current from server, diff, add/remove
        const fresh = await api(`/api/my/teams/${teamId}`)
        const serverMembers = fresh.team?.members || []
        const serverIds = serverMembers.map(m => m.id)
        const localIds = members.filter(m => m.id).map(m => m.id)
        // Remove members that were deleted locally
        for (const sm of serverMembers) {
          if (!members.find(m => m.id === sm.id)) {
            await api(`/api/my/teams/${teamId}/members/${sm.id}`, { method: 'DELETE' })
          }
        }
        // Update role for existing members whose role changed
        for (const m of members) {
          if (m.id) {
            const server = serverMembers.find(s => s.id === m.id)
            if (server && server.role !== m.role) {
              await api(`/api/my/teams/${teamId}/members/${m.id}`, { method: 'PATCH', body: { role: m.role } })
            }
          }
        }
        // Add new members (those without an id yet)
        for (const m of members) {
          if (!m.id) {
            await api(`/api/my/teams/${teamId}/members`, { method: 'POST', body: { persona_id: m.persona_id, role: m.role } })
          }
        }
      }
      setSaving(false)
    } catch (e) {
      setFormError(e.message)
      setSaving(false)
    }
  }

  function addMember() {
    if (!addPersonaId) return
    const p = personas.find(p => String(p.id) === String(addPersonaId))
    if (!p) return
    if (members.find(m => String(m.persona_id) === String(addPersonaId))) return
    setMembers(prev => [...prev, { id: null, persona_id: p.id, name: p.name, role: addRole.trim() }])
    setAddPersonaId('')
    setAddRole('')
  }

  function removeMember(idx) {
    setMembers(prev => prev.filter((_, i) => i !== idx))
  }

  const [activeTab, setActiveTab] = useState('general')
  const [skillDetail, setSkillDetail] = useState(null)
  const { catalog } = useSkillsCatalog()

  const TABS = [
    { id: 'general',        label: 'General',       icon: FileText },
    { id: 'hotel',          label: 'Hotel',         icon: Building2 },
    { id: 'orchestration',  label: 'Orchestration', icon: Workflow },
    { id: 'members',        label: 'Members',       icon: Users },
  ]

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">

      {/* Tab bar */}
      <div className="flex border-b border-border bg-muted/20">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="p-5 space-y-4">

        {formError && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {formError}
          </div>
        )}

        {/* ── General ── */}
        {activeTab === 'general' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Team Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Sprint Team"
                className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What does this team do?"
                rows={3}
                className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
              />
            </div>
          </div>
        )}

        {/* ── Hotel ── */}
        {activeTab === 'hotel' && (
          <div className="space-y-4">
            {/* Language */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Hotel language
                <span className="ml-1.5 text-muted-foreground font-normal">— bots will speak this language in the room</span>
              </label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="w-full bg-muted/40 border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {TEAM_LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>

            {/* Bot narration verbosity */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">
                Bot narration
                <span className="ml-1.5 text-muted-foreground font-normal">— how much bots say in the room</span>
              </label>
              <input
                type="range"
                min="3"
                max="10"
                step="1"
                value={narratorVerbosity}
                onChange={e => setNarratorVerbosity(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                {VERBOSITY_LABELS.map(v => (
                  <span key={v.value} className={narratorVerbosity >= v.value && (v.value === VERBOSITY_LABELS[VERBOSITY_LABELS.length - 1].value || narratorVerbosity < VERBOSITY_LABELS[VERBOSITY_LABELS.indexOf(v) + 1]?.value) ? 'text-foreground font-medium' : ''}>
                    {v.label}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {VERBOSITY_LABELS.reduce((best, v) => narratorVerbosity >= v.value ? v : best, VERBOSITY_LABELS[0]).desc}
              </p>
            </div>

            {/* Default room */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Default room
                <span className="ml-1.5 text-muted-foreground font-normal">— used when triggered by phone or SMS</span>
              </label>
              {rooms.length > 0 ? (
                <select
                  value={defaultRoomId ?? ''}
                  onChange={e => setDefaultRoomId(Number(e.target.value))}
                  className="w-full bg-muted/40 border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">— pick a room —</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>#{r.id} — {r.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min="1"
                  value={defaultRoomId ?? ''}
                  onChange={e => setDefaultRoomId(Number(e.target.value) || '')}
                  placeholder="Room ID (e.g. 201)"
                  className="w-full bg-muted/40 border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}
            </div>
          </div>
        )}

        {/* ── Orchestration ── */}
        {activeTab === 'orchestration' && (
          <div className="space-y-4">
            {/* Execution mode */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Execution Mode</label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: 'shared',     label: 'Shared Task List', desc: 'Agents collaborate via a shared task file, claiming tasks as they go' },
                  { value: 'concurrent', label: 'Concurrent',       desc: 'All agents start at the same time, work independently' },
                  { value: 'sequential', label: 'Sequential',       desc: 'Tasks run one after another, each waits for the previous' },
                ].map(m => (
                  <button
                    key={m.value}
                    type="button"
                    title={m.desc}
                    onClick={() => setExecutionMode(m.value)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${executionMode === m.value ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/40 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/60">
                {executionMode === 'concurrent' && 'Each agent receives their full persona prompt and works independently. Best for parallel, independent tasks.'}
                {executionMode === 'sequential' && 'The orchestrator spawns one agent at a time and waits for each to finish before starting the next.'}
                {executionMode === 'shared' && 'The orchestrator writes a shared task JSON file. Agents read it, claim tasks matching their capabilities, and write results back. Best for team collaboration.'}
              </p>
            </div>

            {/* Orchestrator prompt */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Orchestrator Prompt <span className="text-muted-foreground font-normal">(optional — auto-generated if empty)</span></label>
              <div className="flex flex-wrap gap-2 mb-1.5">
                {[
                  { tag: '{{ROOM_ID}}',      desc: 'Hotel room number (e.g. 201)' },
                  { tag: '{{TRIGGERED_BY}}', desc: 'Who triggered the run (Habbo username)' },
                  { tag: '{{TASKS}}',        desc: 'Rendered task instructions (sequential steps or shared task list JSON)' },
                  { tag: '{{PERSONAS}}',     desc: 'All team members — names, roles, bots & instructions' },
                ].map(({ tag, desc }) => (
                  <button
                    key={tag}
                    type="button"
                    title={desc}
                    onClick={() => setOrchestratorPrompt(p => p + (p.endsWith('\n') || !p ? '' : '\n') + tag)}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/60 border border-border hover:border-primary/50 hover:bg-muted transition-colors group"
                  >
                    <code className="text-xs text-primary font-mono">{tag}</code>
                    <span className="text-xs text-muted-foreground group-hover:text-foreground/70 hidden sm:inline">{desc}</span>
                  </button>
                ))}
              </div>
              <MarkdownEditor
                value={orchestratorPrompt}
                onChange={setOrchestratorPrompt}
                placeholder="You are the orchestrator for this team. Launch all agents CONCURRENTLY…"
                rows={16}
              />
              <p className="text-xs text-muted-foreground/60 mt-1">
                Variables are replaced by the system before Claude sees the prompt.
                <code className="text-primary/70 ml-1">{'{{PERSONAS}}'}</code> expands to all team members with their full instructions.
              </p>
            </div>

            {/* Task editor — shown for sequential + shared modes */}
            {executionMode !== 'concurrent' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground">
                    Tasks
                    <span className="ml-1.5 text-muted-foreground font-normal">— define the work steps for this team run</span>
                  </label>
                  <button
                    type="button"
                    onClick={addTask}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add task
                  </button>
                </div>

                {tasks.length === 0 && (
                  <div className="text-xs text-muted-foreground/60 border border-dashed border-border rounded-lg px-4 py-3 text-center">
                    No tasks yet — click "Add task" to define what this team should do
                  </div>
                )}

                <div className="space-y-2">
                  {tasks.map((task, idx) => (
                    <div key={task.id} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground w-6 shrink-0">{task.id}</span>
                        <input
                          value={task.title}
                          onChange={e => updateTask(idx, 'title', e.target.value)}
                          placeholder="Task title…"
                          className="flex-1 text-sm bg-background border border-border rounded px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                        <select
                          value={task.assign_to || ''}
                          onChange={e => updateTask(idx, 'assign_to', e.target.value)}
                          className="w-36 text-sm bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                        >
                          <option value="">— auto assign —</option>
                          {members.map(m => (
                            <option key={m.persona_id} value={m.role || m.name}>
                              {m.name}{m.role ? ` (${m.role})` : ''}
                            </option>
                          ))}
                        </select>
                        <button type="button" onClick={() => removeTask(idx)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <textarea
                        value={task.description || ''}
                        onChange={e => updateTask(idx, 'description', e.target.value)}
                        placeholder="What should the agent do? What input does it need?"
                        rows={4}
                        className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 resize-y"
                      />
                      {idx > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">Depends on:</span>
                          {tasks.slice(0, idx).map(dep => (
                            <button
                              key={dep.id}
                              type="button"
                              onClick={() => toggleDepend(idx, dep.id)}
                              className={`text-xs px-2 py-0.5 rounded border transition-colors ${(task.depends_on || []).includes(dep.id) ? 'bg-primary/20 border-primary/50 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'}`}
                            >
                              {dep.id}: {dep.title || 'untitled'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {tasks.length > 0 && (
                  <p className="text-xs text-muted-foreground/60">
                    {executionMode === 'shared' && 'Use {{TASKS}} in the orchestrator prompt to inject the task file write instructions.'}
                    {executionMode === 'sequential' && 'Use {{TASKS}} in the orchestrator prompt to inject the ordered task list.'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Members ── */}
        {activeTab === 'members' && (
          <div className="space-y-4">
            {members.length > 0 && (
              <div className="space-y-3">
                {members.map((m, idx) => {
                  const persona = personas.find(p => String(p.id) === String(m.persona_id))
                  const figure = persona?.figure || ''
                  const slugs = parseSkillSlugs(persona?.capabilities)
                  const skillEntries = slugs.slice(0, 6).map(slug => {
                    const found = catalog.find(s => s.slug === slug)
                    return found ? { slug: found.slug, title: found.title } : { slug, title: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }
                  })
                  const requiredIntegrations = [...new Set(
                    slugs.map(slug => catalog.find(s => s.slug === slug)?.requires_integration).filter(Boolean)
                  )]

                  return (
                    <div key={idx} className="rounded-xl border border-border bg-muted/10 overflow-hidden flex gap-0">
                      {/* Figure — click to open persona edit */}
                      <div
                        className={`flex flex-col items-center justify-start pt-3 px-3 pb-3 bg-secondary/30 border-r border-border flex-shrink-0 w-20 ${onViewPersona && persona ? 'cursor-pointer hover:bg-secondary/60 transition-colors' : ''}`}
                        onClick={onViewPersona && persona ? () => onViewPersona(persona) : undefined}
                        title={onViewPersona && persona ? `Edit ${m.name}` : undefined}
                      >
                        <HabboFigure figure={figure} size="lg" animate={true} />
                        <span className={`mt-1.5 text-[10px] text-center leading-tight truncate w-full text-center ${onViewPersona && persona ? 'text-primary' : 'text-muted-foreground'}`}>
                          {m.name}
                        </span>
                        {onViewPersona && persona && (
                          <span className="text-[9px] text-primary/50 mt-0.5">Edit ↗</span>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              {persona?.role && (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
                                  {persona.role}
                                </span>
                              )}
                              {onViewPersona && persona && (
                                <button
                                  type="button"
                                  onClick={() => onViewPersona(persona)}
                                  className="text-[10px] text-muted-foreground/60 hover:text-primary transition-colors"
                                >
                                  Edit persona →
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium whitespace-nowrap">Team role</label>
                              <input
                                value={m.role}
                                onChange={e => setMembers(prev => prev.map((x, i) => i === idx ? { ...x, role: e.target.value } : x))}
                                placeholder="e.g. reviewer"
                                className="text-xs bg-background border border-border rounded px-2 py-0.5 text-foreground w-36 focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </div>
                          </div>
                          <button type="button" onClick={() => removeMember(idx)} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 mt-0.5">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {skillEntries.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium self-center">
                              <Sparkles className="w-2.5 h-2.5" /> Skills
                            </span>
                            {skillEntries.map((skill, i) => (
                              <SkillChip key={i} slug={skill.slug} title={skill.title} onViewFull={skill.slug ? setSkillDetail : undefined} />
                            ))}
                          </div>
                        )}

                        {requiredIntegrations.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
                              <ExternalLink className="w-2.5 h-2.5" /> Needs
                            </span>
                            {requiredIntegrations.map(int => (
                              <span key={int} className="inline-flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md px-1.5 py-0.5 capitalize">
                                {int.replace(/-/g, ' ')}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {personas.filter(p => !members.find(m => String(m.persona_id) === String(p.id))).length > 0 && (
              <div className="flex gap-2 items-center pt-1 border-t border-border">
                <select
                  value={addPersonaId}
                  onChange={e => setAddPersonaId(e.target.value)}
                  className="flex-1 bg-muted/40 border border-border rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">+ Add agent…</option>
                  {personas.filter(p => !members.find(m => String(m.persona_id) === String(p.id))).map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.role ? ` — ${p.role}` : ''}</option>
                  ))}
                </select>
                <input
                  value={addRole}
                  onChange={e => setAddRole(e.target.value)}
                  placeholder="team role"
                  className="w-28 text-xs bg-background border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={addMember}
                  disabled={!addPersonaId}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-40 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            )}

            {members.length === 0 && (
              <div className="text-xs text-muted-foreground/60 border border-dashed border-border rounded-lg px-4 py-6 text-center">
                No agents yet — use the selector above to add team members
              </div>
            )}
          </div>
        )}

        {/* Always-visible save/cancel */}
        <div className="flex gap-2 pt-2 border-t border-border">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onCancel} className="text-xs border border-border px-4 py-2 rounded-md hover:bg-secondary transition-colors">
            Cancel
          </button>
        </div>
      </div>

      <SkillDetailModal slug={skillDetail} onClose={() => setSkillDetail(null)} />
    </div>
  )
}

// ── Skill Detail Modal (AgentDashboard context) ───────────────────────────
// Opens the full SkillDetail page in a centered portal dialog.

function SkillDetailModal({ slug, onClose }) {
  const { catalog } = useSkillsCatalog()
  useEscapeKey(onClose, !!slug)
  if (!slug) return null
  const skill = catalog.find(s => s.slug === slug) || { slug, title: slug.replace(/-/g, ' ') }
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-background border border-border rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-end px-5 pt-4 flex-shrink-0">
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pb-6 overflow-y-auto">
          <SkillDetail skill={skill} onBack={onClose} />
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Persona Card ──────────────────────────────────────────────────────────

function PersonaCard({ persona, bots = [], onEdit, onDelete, onLinkBot }) {
  const { showToast } = useToast()
  const { catalog } = useSkillsCatalog()
  const figure = persona.figure || bots.find(b => b.name === persona.bot_name)?.figure || ''

  const [linking, setLinking] = useState(false)
  const [selectedBot, setSelectedBot] = useState(persona.bot_name || '')
  const [savingBot, setSavingBot] = useState(false)
  const [skillDetail, setSkillDetail] = useState(null)

  // Keep selectedBot in sync if persona.bot_name changes externally
  useEffect(() => { setSelectedBot(persona.bot_name || '') }, [persona.bot_name])

  // Resolve slugs to { slug, title } pairs so chips are clickable
  const skills = useMemo(() => {
    const slugs = parseSkillSlugs(persona.capabilities)
    if (slugs.length > 0) {
      return slugs.slice(0, 5).map(slug => {
        const found = catalog.find(s => s.slug === slug)
        return found ? { slug: found.slug, title: found.title } : { slug, title: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }
      })
    }
    // Legacy text capabilities — no slug, not clickable
    return parseSkills(persona.capabilities, catalog, { max: 5 }).map(title => ({ slug: null, title }))
  }, [persona.capabilities, catalog])

  async function handleLinkBot() {
    setSavingBot(true)
    try {
      await onLinkBot(persona.id, selectedBot)
      showToast(
        selectedBot
          ? `"${selectedBot}" linked to ${persona.name}`
          : `Bot unlinked from ${persona.name}`,
        'success'
      )
      setLinking(false)
    } catch (e) {
      showToast(e.message || 'Failed to link bot', 'error')
    } finally {
      setSavingBot(false)
    }
  }

  return (
    <>
    <div
      className={`rounded-xl border border-border bg-card overflow-hidden ${onEdit ? 'cursor-pointer group/pcard' : ''}`}
      onClick={onEdit}
    >
      <div className="flex gap-0">

        {/* Figure column */}
        <div className="flex flex-col items-center justify-start pt-4 px-4 pb-4 bg-secondary/30 border-r border-border flex-shrink-0 w-24">
          <HabboFigure figure={figure} figureType={persona.figure_type} size="xl" animate={true} />
          {persona.bot_name && !linking && (
            <span className="mt-2 text-[10px] text-center text-info font-medium leading-tight truncate w-full text-center">
              {persona.bot_name}
            </span>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 p-4 flex flex-col gap-2">

          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className={`font-semibold text-sm truncate transition-colors ${onEdit ? 'group-hover/pcard:text-primary' : ''} text-foreground`}>
                {persona.name}
              </p>
              {persona.role && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 mt-1">
                  {persona.role}
                </span>
              )}
            </div>
            {(onEdit || onDelete) && (
              <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                {onEdit && (
                  <button onClick={onEdit}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    title="Edit agent">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {onDelete && (
                  <button onClick={onDelete}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete agent">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          {(persona.prompt || persona.description) && (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {(persona.prompt || persona.description).replace(/^You are[^.]+\.\s*/i, '')}
            </p>
          )}

          {/* Skills */}
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5" onClick={e => e.stopPropagation()}>
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider mr-0.5 self-center">
                <Sparkles className="w-2.5 h-2.5" /> Skills
              </span>
              {skills.map((skill, i) => (
                <SkillChip
                  key={i}
                  slug={skill.slug}
                  title={skill.title}
                  onViewFull={skill.slug ? setSkillDetail : undefined}
                />
              ))}
            </div>
          )}

          {/* Bot link footer — only shown when caller has personas.link_bot permission */}
          <div className="mt-auto pt-2 border-t border-border flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {onLinkBot && linking ? (
              <>
                <Bot className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <select
                  value={selectedBot}
                  onChange={e => setSelectedBot(e.target.value)}
                  className="flex-1 h-7 text-xs bg-background border border-border rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground"
                  autoFocus
                >
                  <option value="">— No bot —</option>
                  {bots.map(b => (
                    <option key={b.id ?? b.name} value={b.name}>{b.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleLinkBot}
                  disabled={savingBot}
                  className="h-7 px-3 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1 flex-shrink-0"
                >
                  {savingBot ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  {savingBot ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => { setLinking(false); setSelectedBot(persona.bot_name || '') }}
                  className="h-7 w-7 flex items-center justify-center border border-border rounded-md hover:bg-secondary transition-colors flex-shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            ) : (
              <>
                {persona.bot_name ? (
                  <span className="inline-flex items-center gap-1.5 text-xs bg-info/10 text-info border border-info/20 rounded-full px-2.5 py-0.5">
                    <Bot className="w-3 h-3" /> {persona.bot_name}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground/50 italic">No bot linked</span>
                )}
                {onLinkBot && (
                  <button
                    onClick={() => setLinking(true)}
                    className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/40 rounded-md px-2.5 py-1 transition-colors flex-shrink-0"
                  >
                    <LinkIcon className="w-3 h-3" />
                    {persona.bot_name ? 'Change bot' : 'Link bot'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>

    <SkillDetailModal slug={skillDetail} onClose={() => setSkillDetail(null)} />
    </>
  )
}

// ── Skill Browser (used inside PersonaEditor) ─────────────────────────────

const CATEGORY_COLORS = {
  hotel:         'bg-blue-500/10 text-blue-400 border-blue-500/20',
  research:      'bg-violet-500/10 text-violet-400 border-violet-500/20',
  coordination:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  communication: 'bg-green-500/10 text-green-400 border-green-500/20',
  general:       'bg-secondary text-muted-foreground border-border',
}

function SkillBrowser({ selectedSlugs, onChange }) {
  const { catalog, loading } = useSkillsCatalog()
  const [activeCategory, setActiveCategory] = useState('all')
  const [openSkill, setOpenSkill] = useState(null) // slug for SkillDetailModal

  const categories = useMemo(() => {
    const cats = [...new Set(catalog.map(s => s.category))].sort()
    return ['all', ...cats]
  }, [catalog])

  const visible = activeCategory === 'all'
    ? catalog
    : catalog.filter(s => s.category === activeCategory)

  function toggle(slug) {
    onChange(
      selectedSlugs.includes(slug)
        ? selectedSlugs.filter(s => s !== slug)
        : [...selectedSlugs, slug]
    )
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading skills…
    </div>
  )

  if (catalog.length === 0) return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Zap className="w-6 h-6 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground">No skills available</p>
      <p className="text-xs text-muted-foreground">Add skill files to the agents/skills/ folder to get started.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Category filter */}
      <div className="flex flex-wrap gap-1.5">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`text-[11px] px-2.5 py-1 rounded-full border capitalize transition-colors ${
              activeCategory === cat
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Skill cards */}
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {visible.map(skill => {
          const selected = selectedSlugs.includes(skill.slug)
          const catColor = CATEGORY_COLORS[skill.category] || CATEGORY_COLORS.general
          return (
            <div
              key={skill.slug}
              onClick={() => toggle(skill.slug)}
              className={`rounded-lg border transition-colors cursor-pointer ${
                selected
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border bg-card hover:border-primary/20'
              }`}
            >
              <div className="flex items-start gap-3 p-3">
                {/* Select toggle */}
                <button
                  onClick={e => { e.stopPropagation(); toggle(skill.slug) }}
                  className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border transition-colors ${
                    selected
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border hover:border-primary/60'
                  }`}
                >
                  {selected && <Check className="w-3 h-3" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{skill.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${catColor}`}>
                      {skill.category}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      skill.difficulty === 'beginner'
                        ? 'border-success/20 bg-success/10 text-success'
                        : 'border-warning/20 bg-warning/10 text-warning'
                    }`}>
                      {skill.difficulty}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{skill.description}</p>
                  <button
                    onClick={e => { e.stopPropagation(); setOpenSkill(skill.slug) }}
                    className="text-[11px] text-primary hover:underline mt-1.5"
                  >
                    View full skill →
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <SkillDetailModal slug={openSkill} onClose={() => setOpenSkill(null)} />
    </div>
  )
}

// ── Persona Editor ────────────────────────────────────────────────────────

function PersonaEditor({ persona, bots, onSave, onCancel }) {
  const [name, setName] = useState(persona?.name || '')
  const [role, setRole] = useState(persona?.role || '')
  const [description, setDescription] = useState(persona?.description || '')
  // Skills stored as JSON array of slugs; parse existing value on load
  const [skillSlugs, setSkillSlugs] = useState(() => parseSkillSlugs(persona?.capabilities || ''))
  const [prompt, setPrompt] = useState(persona?.prompt || '')
  const [botName, setBotName] = useState(persona?.bot_name || '')
  const [figure, setFigure] = useState(persona?.figure || '')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [activeTab, setActiveTab] = useState('identity') // 'identity' | 'skills' | 'prompt'
  const [openSkill, setOpenSkill] = useState(null)

  async function handleSave() {
    if (!name.trim()) { setFormError('Name is required'); return }
    setSaving(true)
    setFormError(null)
    try {
      await onSave({
        name: name.trim(),
        role: role.trim(),
        description: description.trim(),
        capabilities: JSON.stringify(skillSlugs), // stored as JSON slug array
        prompt: prompt.trim(),
        bot_name: botName,
        figure: figure.trim(),
      })
    } catch (e) {
      setFormError(e.message)
      setSaving(false)
    }
  }

  const EDITOR_TABS = [
    { id: 'identity', label: 'Identity' },
    { id: 'skills',   label: `Skills${skillSlugs.length > 0 ? ` (${skillSlugs.length})` : ''}` },
    { id: 'prompt',   label: 'Prompt' },
  ]

  return (
    <div className="space-y-4">
      {!persona && <h3 className="font-semibold text-sm text-foreground">New Agent</h3>}

      {formError && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {formError}
        </div>
      )}

      {/* Section tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {EDITOR_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Identity tab ── */}
      {activeTab === 'identity' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Agent name"
                className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Job Title</label>
              <input
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder="e.g. Sprint Coordinator"
                className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Expertise summary</label>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              What this agent is good at — shown on marketplace cards and used by the orchestrator to assign tasks. Keep it to one sentence.
            </p>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. SEO Specialist — researches keywords and optimisation opportunities"
              className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Bot</label>
              <select
                value={botName}
                onChange={e => setBotName(e.target.value)}
                className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">Select bot…</option>
                {bots.map(b => (
                  <option key={b.id ?? b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Habbo Figure</label>
              <input
                value={figure}
                onChange={e => setFigure(e.target.value)}
                placeholder="hr-115-42.hd-180-1.ch-…"
                className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
              />
            </div>
          </div>

          {figure && (
            <div className="flex items-center gap-3">
              <HabboFigure figure={figure} size="md" animate={true} />
              <p className="text-xs text-muted-foreground">Figure preview</p>
            </div>
          )}
        </div>
      )}

      {/* ── Skills tab ── */}
      {activeTab === 'skills' && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Skills are procedural tool guides — e.g. how to set up a hotel bot, read Notion, or send emails. They are automatically injected into the agent's prompt at deploy time. To describe what the agent is good at, use the <strong>Expertise summary</strong> on the Identity tab.
              </p>
            </div>
          </div>

          {/* Selected skill chips */}
          {skillSlugs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-3 bg-secondary/50 rounded-lg border border-border">
              <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider self-center mr-1">Active:</span>
              {skillSlugs.map(slug => (
                <span key={slug} className="inline-flex items-center gap-0.5">
                  <SkillChip slug={slug} onViewFull={setOpenSkill} />
                  <button
                    onClick={() => setSkillSlugs(prev => prev.filter(s => s !== slug))}
                    className="text-muted-foreground hover:text-destructive ml-1 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <SkillBrowser selectedSlugs={skillSlugs} onChange={setSkillSlugs} />
          <SkillDetailModal slug={openSkill} onClose={() => setOpenSkill(null)} />
        </div>
      )}

      {/* ── Prompt tab ── */}
      {activeTab === 'prompt' && (
        <div className="space-y-2">
          <div>
            <p className="text-xs text-muted-foreground">
              Define the agent's personality, voice, and base behaviour. Skill instructions are appended automatically — you don't need to repeat them here.
            </p>
          </div>
          <MarkdownEditor
            value={prompt}
            onChange={setPrompt}
            placeholder="You are [Name], a ... at The Pixel Office. Personality: ...&#10;&#10;Tone: Direct, professional, max 120 chars per talk_bot message."
            rows={16}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-border">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : 'Save agent'}
        </button>
        <button
          onClick={onCancel}
          className="text-xs border border-border px-4 py-2 rounded-md hover:bg-secondary transition-colors"
        >
          Cancel
        </button>
        {skillSlugs.length > 0 && (
          <span className="ml-auto self-center text-xs text-muted-foreground">
            {skillSlugs.length} skill{skillSlugs.length !== 1 ? 's' : ''} selected
          </span>
        )}
      </div>
    </div>
  )
}

// ── Shared UI Primitives ──────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="w-6 h-6 animate-spin mr-2" />
      <span className="text-sm">Loading…</span>
    </div>
  )
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive">
      <AlertCircle className="w-5 h-5 flex-shrink-0" />
      <div className="flex-1 text-sm">{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs border border-destructive/40 px-3 py-1.5 rounded-md hover:bg-destructive/10 transition-colors flex-shrink-0"
        >
          Retry
        </button>
      )}
    </div>
  )
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-sm text-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>}
    </div>
  )
}
