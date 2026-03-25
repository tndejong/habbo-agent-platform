import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { HabboFigure } from './HabboFigure'
import { api } from '../utils/api'
import { friendlyFetchError } from '../utils/fetchError'
import { useTheme } from '../ThemeContext'
import {
  Bot, Edit2, Trash2, Plus, X, Check,
  Loader2, AlertCircle, AlertTriangle, Users, Zap, ChevronDown, ChevronUp, ChevronLeft, Square,
  Shield, Wifi, WifiOff, Key, ServerCog, Terminal, RefreshCw, User, Eye, EyeOff,
  Sun, Moon, Phone, Copy,
  Bold, Italic, Code, Heading2, List, ListOrdered, Link, Minus,
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
  const { theme, toggleTheme } = useTheme()
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

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Row 1: Profile + Phone */}
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
              {me?.is_developer && (
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
                  className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/70 border border-destructive/30 hover:border-destructive/50 rounded px-2 py-1 transition-colors disabled:opacity-50">
                  {phoneDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Remove
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <input type="tel" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder="+31612345678"
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                onKeyDown={e => e.key === 'Enter' && handleSavePhone()} />
              <button onClick={handleSavePhone} disabled={phoneSaving || !phoneInput.trim()}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-80 disabled:opacity-50 transition-opacity">
                {phoneSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Row 2: API Key + Password */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

      {/* API Keys */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
          <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0"><Key className="w-3.5 h-3.5" /></span>
          Anthropic API Key
        </h2>
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Your personal key is used when you trigger agent teams. It overrides the server default so your usage is billed to your own Anthropic account.
            The key is stored AES-256-GCM encrypted — it is never stored in plain text.
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
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/70 border border-destructive/30 hover:border-destructive/50 rounded px-2 py-1 transition-colors disabled:opacity-50"
                  >
                    {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Remove
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

          {/* Add / replace key */}
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
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                onClick={handleSave}
                disabled={saving || !newKey.trim()}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save
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
            {/* Current password */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Current password</label>
              <div className="relative">
                <input
                  type={showCurrentPw ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10"
                />
                <button type="button" onClick={() => setShowCurrentPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showCurrentPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">New password</label>
              <div className="relative">
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10"
                />
                <button type="button" onClick={() => setShowNewPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showNewPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Confirm new password */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <button
              onClick={handleChangePassword}
              disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {pwSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Update password
            </button>
          </div>
        </div>
      </section>

      </div>{/* end Row 2 */}

      {/* Row 3: Appearance — full width */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
          <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0"><Sun className="w-3.5 h-3.5" /></span>
          Appearance
        </h2>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Theme</p>
              <p className="text-xs text-muted-foreground mt-0.5">Choose light or dark interface.</p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-secondary rounded-lg border border-border">
              <button onClick={() => theme === 'dark' && toggleTheme()}
                className={`flex items-center gap-1.5 h-7 px-3 text-xs rounded-md transition-colors ${theme === 'light' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                aria-pressed={theme === 'light'}>
                <Sun className="w-3.5 h-3.5" /> Light
              </button>
              <button onClick={() => theme === 'light' && toggleTheme()}
                className={`flex items-center gap-1.5 h-7 px-3 text-xs rounded-md transition-colors ${theme === 'dark' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                aria-pressed={theme === 'dark'}>
                <Moon className="w-3.5 h-3.5" /> Dark
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Row 4: MCP Tokens — developer only */}
      {me?.is_developer && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0"><Key className="w-3.5 h-3.5" /></span>
            MCP Tokens
            <span className="ml-auto text-[10px] bg-primary/10 text-primary border border-primary/20 rounded px-1.5 py-0.5">Developer</span>
          </h2>

          {/* Feedback message */}
          {mcpMsg && (
            <div className={`text-xs rounded-lg px-3 py-2 flex items-center gap-2 ${mcpMsg.type === 'success' ? 'bg-success/10 text-success border border-success/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
              {mcpMsg.type === 'success' ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
              {mcpMsg.text}
            </div>
          )}

          {/* Habbo MCP connection status */}
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
                <button onClick={() => copyMcpToken(newMcpToken)}
                  className="h-8 w-8 flex-shrink-0 flex items-center justify-center border border-border rounded-lg hover:bg-secondary transition-colors">
                  {copiedToken ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          {/* Generate token */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Tokens authenticate your Habbo hotel MCP server. Required before deploying agent teams.
              Endpoint: <code className="font-mono bg-muted px-1 py-0.5 rounded">/mcp</code> on your hosted <code className="font-mono bg-muted px-1 py-0.5 rounded">hotel-mcp</code> domain.
            </p>
            <div className="flex gap-2">
              <input
                placeholder="Token label (optional)"
                value={tokenLabel}
                onChange={e => setTokenLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateToken()}
                className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button onClick={handleCreateToken} disabled={mcpBusy}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 flex-shrink-0">
                {mcpBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Generate
              </button>
            </div>
          </div>

          {/* Token list */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Tokens</h3>
            {mcpLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </div>
            ) : mcpTokens.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tokens generated yet.</p>
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
                    <button
                      onClick={() => handleRevokeToken(token.id)}
                      disabled={mcpBusy || token.status !== 'active'}
                      className="h-7 px-3 text-xs border border-destructive/30 text-destructive rounded-md hover:bg-destructive/10 disabled:opacity-40 transition-colors flex-shrink-0">
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent MCP calls */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent MCP Calls</h3>
            {mcpCalls.length === 0 ? (
              <p className="text-xs text-muted-foreground">No MCP calls yet.</p>
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
  )
}

// ── Main Dashboard Component ───────────────────────────────────────────────

export function AgentDashboard({ me, onActiveTeamChange, onStopTeam, mcpTokenVersion }) {
  const [tab, setTab] = useState('teams')
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
      {/* Sub-tabs */}
      <div className="border-b border-border bg-card/30">
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
      </div>

      {/* Error banner */}
      {teamError && (
        <div className={`border-b px-4 py-3 flex items-center gap-3 ${
          teamError.type === 'billing'
            ? 'bg-warning/10 border-warning/30'
            : 'bg-destructive/10 border-red-500/30'
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
          <button onClick={() => setTeamError(null)} className="text-muted-foreground hover:text-foreground ml-auto flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* IntegratedView is always mounted so state (teams, personas, modals) persists across tab switches */}
        <IntegratedView me={me} onAfterTrigger={fetchLogs} liveBots={liveBots} mcpTokenVersion={mcpTokenVersion} activeSection={tab} />
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
  '[tool→]':    'text-info',
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

function logColor(line) {
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

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-card flex items-center gap-2">
        <Terminal className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">Agent Logs</span>
        <span className="text-xs text-muted-foreground ml-1">— live output from running team</span>
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
          return (
            <div key={i} className="flex gap-2 leading-5">
              <span className="text-muted-foreground/40 flex-shrink-0 select-none">{ts.slice(11, 23)}</span>
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

export function OnlineView({ me }) {
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
          <div className="rounded-xl border border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
            No agents deployed in any room.
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

function IntegratedView({ me, onAfterTrigger, liveBots = [], mcpTokenVersion = 0, activeSection = 'teams' }) {
  const [personas, setPersonas] = useState([])
  const [teams, setTeams] = useState([])
  const [bots, setBots] = useState([])
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // teamPage / personaPage: null = list view, { item: null } = new, { item: {...} } = edit
  const [teamPage, setTeamPage] = useState(null)
  const [personaPage, setPersonaPage] = useState(null)
  // confirmModal: null | { title, message, onConfirm }
  const [confirmModal, setConfirmModal] = useState(null)
  const [toast, setToast] = useState(null)
  const [deployingIds, setDeployingIds] = useState(new Set())
  const [hasApiKey, setHasApiKey] = useState(true)
  const [hasMcpToken, setHasMcpToken] = useState(true)

  const isBasic = me?.ai_tier === 'basic'
  const isDev = me?.is_developer

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pd, bd, td, rd, kd, md] = await Promise.all([
        api('/api/my/personas'),
        api('/api/agents/bots?mine=true'),
        api('/api/my/teams'),
        api('/api/hotel/rooms'),
        api('/api/account/api-keys'),
        api('/api/mcp/tokens'),
      ])
      setPersonas(pd.personas || [])
      setBots(bd.bots || [])
      setTeams(td.teams || [])
      const roomList = rd.rooms || []
      setRooms(roomList)
      setHasApiKey(!!(kd.keys || []).find(k => k.provider === 'anthropic'))
      const now = new Date()
      setHasMcpToken(!!(md.tokens || []).find(t => t.status === 'active' && new Date(t.expires_at) > now))
    } catch (e) {
      setError(friendlyFetchError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Re-load when mcpTokenVersion bumps (token generated/revoked in Settings while view is mounted)
  useEffect(() => { load() }, [load, mcpTokenVersion])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

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

  async function savePersona(data) {
    if (personaPage?.persona) {
      await api(`/api/my/personas/${personaPage.persona.id}`, { method: 'PUT', body: JSON.stringify(data) })
    } else {
      await api('/api/my/personas', { method: 'POST', body: JSON.stringify(data) })
    }
    setPersonaPage(null)
    load()
  }

  async function saveTeamRoomId(teamId, roomId) {
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, default_room_id: roomId } : t))
    try {
      const team = teams.find(t => t.id === teamId)
      if (team) {
        // tasks_json from the DB is already a string — unwrap all stringify layers
        // before sending so the PUT endpoint doesn't double-stringify it
        let parsedTasks = []
        try {
          let v = JSON.parse(team.tasks_json || '[]')
          let guard = 0
          while (typeof v === 'string' && guard++ < 5) { try { v = JSON.parse(v) } catch { break } }
          parsedTasks = Array.isArray(v) ? v : []
        } catch { /* keep [] */ }
        await api(`/api/my/teams/${teamId}`, { method: 'PUT', body: JSON.stringify({ ...team, tasks_json: parsedTasks, default_room_id: roomId }) })
      }
    } catch { /* non-fatal — local state already updated */ }
  }

  async function saveTeam(data) {
    let teamId = teamPage?.team?.id
    if (teamPage?.team) {
      await api(`/api/my/teams/${teamPage.team.id}`, { method: 'PUT', body: JSON.stringify(data) })
    } else {
      const r = await api('/api/my/teams', { method: 'POST', body: JSON.stringify(data) })
      teamId = r.id
    }
    setTeamPage(null)
    load()
    return { id: teamId }
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorBanner message={error} onRetry={load} />

  // ── Dedicated persona edit/new page ──────────────────────────────────────
  if (personaPage !== null) {
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
  if (teamPage !== null) {
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
          isDev={isDev}
          onSave={saveTeam}
          onCancel={() => setTeamPage(null)}
        />
      </div>
    )
  }

  if (isBasic && !isDev) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-warning mx-auto" />
        <h3 className="text-sm font-semibold text-foreground">Pro tier required</h3>
        <p className="text-xs text-muted-foreground">Upgrade to Pro to create and deploy agent teams. Browse available teams in the Marketplace.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
          toast.type === 'error'
            ? 'bg-destructive/10 border border-destructive/30 text-destructive'
            : 'bg-success/10 border border-success/30 text-success'
        }`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <Check className="w-4 h-4 flex-shrink-0" />}
          <span className="flex-1">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100 transition-opacity flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Teams or Personas — controlled by activeSection prop ── */}
      {activeSection === 'teams' && <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Teams</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Group agents into a deployable team</p>
          </div>
          <button
            onClick={() => setTeamPage({ team: null })}
            className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-80 transition-opacity"
          >
            <Plus className="w-3 h-3" /> New Team
          </button>
        </div>

        {teams.length === 0 ? (
          <EmptyState icon={Users} title="No teams yet" description="Create a team to group and deploy your integrated agents" />
        ) : (
          <div className="space-y-3 stagger-children">
            {teams.map(team => (
              <IntegratedTeamCard
                key={team.id}
                team={team}
                isDev={isDev}
                bots={bots}
                liveBots={liveBots}
                rooms={rooms}
                deploying={deployingIds.has(team.id)}
                hasApiKey={hasApiKey}
                hasMcpToken={hasMcpToken}
                onDeploy={(roomId) => deployTeam(team, roomId)}
                onRoomChange={(roomId) => saveTeamRoomId(team.id, roomId)}
                onEdit={() => setTeamPage({ team })}
                onDelete={() => deleteTeam(team)}
              />
            ))}
          </div>
        )}
      </section>}

      {activeSection === 'personas' && <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Personas</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Individual hotel agent personas</p>
          </div>
          <button
            onClick={() => setPersonaPage({ persona: null })}
            className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-80 transition-opacity"
          >
            <Plus className="w-3 h-3" /> Add Persona
          </button>
        </div>

        {personas.length === 0 ? (
          <EmptyState icon={Bot} title="No agents yet" description="Add your first hotel agent to get started" />
        ) : (
          <div className="space-y-3">
            {personas.map(persona => (
              <PersonaCard
                key={persona.id}
                persona={persona}
                bots={bots}
                onEdit={() => setPersonaPage({ persona })}
                onDelete={() => deletePersona(persona)}
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

function IntegratedTeamCard({ team, isDev, bots = [], liveBots = [], rooms = [], deploying, hasApiKey = true, hasMcpToken = true, onDeploy, onRoomChange, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const [members, setMembers] = useState(team.members || null) // null = still loading
  const [selectedRoomId, setSelectedRoomId] = useState(team.default_room_id || rooms[0]?.id || null)

  // Keep in sync if rooms load after mount
  useEffect(() => {
    if (!selectedRoomId && rooms.length > 0) setSelectedRoomId(team.default_room_id || rooms[0].id)
  }, [rooms, team.default_room_id])

  function handleRoomChange(roomId) {
    setSelectedRoomId(roomId)
    onRoomChange?.(roomId)
  }

  // Load members: list endpoint usually includes them; otherwise fetch single team (marketplace vs user-scoped)
  useEffect(() => {
    if (team.members) {
      setMembers(team.members)
      return
    }
    api(`/api/my/teams/${team.id}`)
      .then(d => setMembers(d.team?.members || []))
      .catch(() => setMembers([]))
  }, [team.id, team.members])

  const memberBotNames = useMemo(() => (members || []).map(m => m.bot_name).filter(Boolean), [members])

  // Compute room conflict: any bot already assigned to a DIFFERENT room than selected
  // Uses portal DB bots (reliable) not MCP liveBots (may miss DB-created bots)
  const roomConflict = useMemo(() => {
    if (members === null || !selectedRoomId || memberBotNames.length === 0) return null
    const conflicts = memberBotNames.flatMap(botName => {
      const bot = bots.find(b => b.name?.toLowerCase() === botName.toLowerCase())
      if (bot && bot.room_id > 0 && bot.room_id !== selectedRoomId) {
        return [{ name: botName, room_id: bot.room_id }]
      }
      return []
    })
    if (conflicts.length === 0) return null
    const conflictRoom = conflicts[0].room_id
    const names = conflicts.map(c => c.name).join(', ')
    return `${names} ${conflicts.length === 1 ? 'is' : 'are'} active in room ${conflictRoom} — team can't start in room ${selectedRoomId}`
  }, [members, memberBotNames, bots, selectedRoomId])

  // Unlinked: only block when members have loaded and some have no bot linked
  const hasUnlinked = useMemo(() => {
    if (members === null) return false
    return members.some(m => !m.bot_name?.trim())
  }, [members])

  const noKey = !hasApiKey
  const noMcpToken = !hasMcpToken
  const blocked = !!roomConflict || hasUnlinked || noKey || noMcpToken

  return (
    <div className={`rounded-xl border bg-card overflow-hidden card-lift ${roomConflict ? 'border-warning/40' : 'border-border'}`}>
      {/* Room conflict warning */}
      {roomConflict && (
        <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 border-b border-warning/20 text-xs text-warning">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {roomConflict}
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center gap-3 p-4">
        {/* Clickable left area — toggles member list */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground">{team.name}</p>
            {team.description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{team.description}</p>
            )}
          </div>
          <span className="text-xs text-muted-foreground flex-shrink-0">{team.member_count ?? (members || []).length} agent{(team.member_count ?? (members || []).length) !== 1 ? 's' : ''}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
        </button>
        <button onClick={onEdit} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0">
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDeploy(selectedRoomId)}
          disabled={deploying || blocked}
          title={noKey ? 'Add an Anthropic API key in Settings to deploy' : noMcpToken ? 'Generate an MCP token in Settings → MCP Tokens to deploy' : roomConflict || undefined}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors flex-shrink-0 ${
            blocked
              ? 'bg-warning/20 text-warning border border-warning/30 cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed'
          }`}
        >
          {deploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : blocked ? <AlertTriangle className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
          {deploying ? 'Deploying…' : noKey ? 'No API Key' : noMcpToken ? 'No MCP Token' : blocked ? 'Blocked' : 'Deploy'}
        </button>
      </div>

      {/* Room selector — always visible, saves default_room_id on change */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <span className="text-xs text-muted-foreground flex-shrink-0">Room</span>
        {rooms.length > 0 ? (
          <select
            value={selectedRoomId ?? ''}
            onChange={e => handleRoomChange(Number(e.target.value))}
            className="flex-1 bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {rooms.map(r => (
              <option key={r.id} value={r.id}>#{r.id} — {r.name}</option>
            ))}
          </select>
        ) : (
          <input
            type="number"
            min="1"
            value={selectedRoomId ?? ''}
            onChange={e => handleRoomChange(Number(e.target.value))}
            placeholder="Room ID"
            className="w-28 bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        )}
      </div>

      {/* Expanded members */}
      {expanded && (
        <IntegratedTeamMembers members={members} bots={bots} liveBots={liveBots} selectedRoomId={selectedRoomId} />
      )}
    </div>
  )
}

function IntegratedTeamMembers({ members, bots = [], liveBots = [], selectedRoomId }) {
  if (members === null) {
    return (
      <div className="border-t border-border px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading members…
      </div>
    )
  }

  if (!members?.length) {
    return (
      <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
        No members assigned yet.
      </div>
    )
  }

  return (
    <div className="border-t border-border divide-y divide-border">
      {members.map(m => {
        const figure = bots.find(b => b.name === m.bot_name)?.figure || null
        const liveBot = bots.find(b => b.name?.toLowerCase() === m.bot_name?.toLowerCase())
        const inWrongRoom = liveBot && liveBot.room_id > 0 && selectedRoomId && liveBot.room_id !== selectedRoomId
        const noBot = !m.bot_name?.trim()
        return (
          <div key={m.id ?? `${m.persona_id}-${m.name}`} className="flex items-center gap-3 px-4 py-2.5">
            <HabboFigure figure={figure} size="sm" animate={true} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{m.name}</p>
              {m.role && <p className="text-xs text-muted-foreground">{m.role}</p>}
            </div>
            {noBot && (
              <span className="text-xs bg-destructive/10 text-destructive border border-destructive/20 px-2 py-0.5 rounded-full flex-shrink-0">
                no bot linked
              </span>
            )}
            {m.bot_name && (
              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 border ${inWrongRoom ? 'bg-warning/10 text-warning border-warning/20' : 'bg-info/10 text-info border-info/20'}`}>
                {inWrongRoom ? `⚠ ${m.bot_name} (room ${liveBot.room_id})` : m.bot_name}
              </span>
            )}
          </div>
        )
      })}
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

function IntegratedTeamForm({ team, personas, rooms = [], isDev, onSave, onCancel }) {
  const [name, setName] = useState(team?.name || '')
  const [description, setDescription] = useState(team?.description || '')
  const [orchestratorPrompt, setOrchestratorPrompt] = useState(team?.orchestrator_prompt || '')
  const [executionMode, setExecutionMode] = useState(team?.execution_mode || 'shared')
  const [language, setLanguage] = useState(team?.language || 'en')
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
      const savedTeam = await onSave({ name: name.trim(), description: description.trim(), orchestrator_prompt: orchestratorPrompt.trim(), execution_mode: executionMode, tasks_json: tasks, language, default_room_id: defaultRoomId || undefined })
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

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="font-semibold text-sm text-foreground">{team ? 'Edit Team' : 'New Team'}</h3>

      {formError && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {formError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What does this team do?"
            className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Execution mode */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Execution Mode</label>
        <div className="flex gap-2 flex-wrap">
          {[
            { value: 'shared', label: 'Shared Task List', desc: 'Agents collaborate via a shared task file, claiming tasks as they go' },
            { value: 'concurrent', label: 'Concurrent', desc: 'All agents start at the same time, work independently' },
            { value: 'sequential', label: 'Sequential', desc: 'Tasks run one after another, each waits for the previous' },
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

      {/* Language selector */}
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
                  <input
                    value={task.assign_to || ''}
                    onChange={e => updateTask(idx, 'assign_to', e.target.value)}
                    placeholder="Assign to (optional)"
                    className="w-36 text-sm bg-background border border-border rounded px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <button type="button" onClick={() => removeTask(idx)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <textarea
                  value={task.description || ''}
                  onChange={e => updateTask(idx, 'description', e.target.value)}
                  placeholder="What should the agent do? What input does it need?"
                  rows={2}
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

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Orchestrator Prompt <span className="text-muted-foreground font-normal">(optional — auto-generated if empty)</span></label>
        <div className="flex flex-wrap gap-2 mb-1.5">
          {[
            { tag: '{{ROOM_ID}}', desc: 'Hotel room number (e.g. 201)' },
            { tag: '{{TRIGGERED_BY}}', desc: 'Who triggered the run (Habbo username)' },
            { tag: '{{TASKS}}', desc: 'Rendered task instructions (sequential steps or shared task list JSON)' },
            { tag: '{{PERSONAS}}', desc: 'All team members — names, roles, bots & instructions' },
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
          Variables are replaced by the system before Claude sees the prompt — they are not filled in by AI.
          <code className="text-primary/70 ml-1">{'{{PERSONAS}}'}</code> expands to all team members with their full instructions.
        </p>
      </div>

      {/* Member management */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-foreground">Team Members</label>
          <span className="text-muted-foreground font-normal text-xs">— agents that will be spawned in this team</span>
        </div>
        {members.length > 0 && (
          <div className="border border-border rounded-lg divide-y divide-border">
            <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/30 rounded-t-lg">
              <span className="text-xs text-muted-foreground flex-1">Agent</span>
              <div className="flex items-center gap-1 w-32">
                <span className="text-xs text-muted-foreground">Role in team</span>
                <div className="relative group">
                  <span className="w-3.5 h-3.5 rounded-full bg-muted-foreground/30 text-muted-foreground flex items-center justify-center text-[9px] font-bold cursor-help select-none">i</span>
                  <div className="absolute bottom-full right-0 mb-1.5 w-56 bg-popover border border-border rounded-md px-2.5 py-2 text-xs text-muted-foreground shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    <p className="font-medium text-foreground mb-0.5">Team role</p>
                    <p>This label is used by the orchestrator to assign tasks and describe what this agent does <em>in this team</em>. It overrides the agent's job title in the orchestration prompt.</p>
                  </div>
                </div>
              </div>
              <div className="w-3.5" />
            </div>
            {members.map((m, idx) => (
              <div key={idx} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground">{m.name}</span>
                  {personas.find(p => String(p.id) === String(m.persona_id))?.role && (
                    <span className="ml-2 text-xs text-muted-foreground/60 line-through">
                      {personas.find(p => String(p.id) === String(m.persona_id))?.role}
                    </span>
                  )}
                </div>
                <input
                  value={m.role}
                  onChange={e => setMembers(prev => prev.map((x, i) => i === idx ? { ...x, role: e.target.value } : x))}
                  placeholder="e.g. backend"
                  className="text-xs bg-background border border-border rounded px-2 py-1 text-foreground w-32 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button type="button" onClick={() => removeMember(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {personas.filter(p => !members.find(m => String(m.persona_id) === String(p.id))).length > 0 && (
          <div className="flex gap-2 items-center">
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
      </div>

      <div className="flex gap-2 pt-1">
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
  )
}

// ── Persona Card ──────────────────────────────────────────────────────────

function PersonaCard({ persona, bots = [], onEdit, onDelete }) {
  const figure = persona.figure || bots.find(b => b.name === persona.bot_name)?.figure || null
  return (
    <button
      onClick={onEdit}
      className="w-full rounded-xl border border-border bg-card card-lift text-left hover:border-primary/40 transition-colors"
    >
      <div className="flex items-center gap-4 p-4">
        <HabboFigure figure={figure} size="xl" animate={true} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground">{persona.name}</p>
          {persona.role && <p className="text-xs text-muted-foreground mt-0.5">{persona.role}</p>}
          {(persona.prompt || persona.description) && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {persona.prompt || persona.description}
            </p>
          )}
        </div>
        {persona.bot_name && (
          <span className="inline-flex items-center text-xs bg-info/10 text-info border border-info/20 px-2 py-0.5 rounded-full flex-shrink-0">
            {persona.bot_name}
          </span>
        )}
        <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Edit agent"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete agent"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </button>
  )
}

// ── Persona Editor ────────────────────────────────────────────────────────

function PersonaEditor({ persona, bots, onSave, onCancel }) {
  const [name, setName] = useState(persona?.name || '')
  const [role, setRole] = useState(persona?.role || '')
  const [capabilities, setCapabilities] = useState(persona?.capabilities || '')
  const [prompt, setPrompt] = useState(persona?.prompt || persona?.description || '')
  const [botName, setBotName] = useState(persona?.bot_name || '')
  const [figure, setFigure] = useState(persona?.figure || '')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  async function handleSave() {
    if (!name.trim()) { setFormError('Name is required'); return }
    setSaving(true)
    setFormError(null)
    try {
      await onSave({
        name: name.trim(),
        role: role.trim(),
        capabilities: capabilities.trim(),
        prompt: prompt.trim(),
        bot_name: botName,
        figure: figure.trim(),
      })
    } catch (e) {
      setFormError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {!persona && <h3 className="font-semibold text-sm text-foreground">New Agent</h3>}

      {formError && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {formError}
        </div>
      )}

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
            placeholder="e.g. Senior backend developer"
            className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">
          Capabilities
          <span className="ml-1.5 text-muted-foreground font-normal">— what work this agent can do (used by orchestrator to assign tasks)</span>
        </label>
        <textarea
          value={capabilities}
          onChange={e => setCapabilities(e.target.value)}
          placeholder={'- Backend API development (Node.js, TypeScript)\n- Database schema design and SQL queries\n- Code review and architecture decisions\n- Writing and running tests'}
          rows={5}
          className="w-full text-sm bg-background border border-border rounded-md px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono resize-y"
        />
        <p className="text-xs text-muted-foreground/60">Use bullet points. The orchestrator reads this to decide who gets which tasks.</p>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">
          Personality &amp; Hotel Setup
          <span className="ml-1.5 text-muted-foreground font-normal">— character, behaviour, bot setup instructions</span>
        </label>
        <MarkdownEditor
          value={prompt}
          onChange={setPrompt}
          placeholder="You are [Name], a ... at The Pixel Office. Personality: ...&#10;&#10;Setup:&#10;1. Call list_bots to find your bot&#10;2. Deploy to room {{ROOM_ID}}&#10;3. Use talk_bot to narrate your work"
          rows={14}
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

      {/* Preview figure */}
      {figure && (
        <div className="flex items-center gap-3">
          <HabboFigure figure={figure} size="md" animate={true} />
          <p className="text-xs text-muted-foreground">Figure preview</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="text-xs border border-border px-4 py-2 rounded-md hover:bg-secondary transition-colors"
        >
          Cancel
        </button>
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
