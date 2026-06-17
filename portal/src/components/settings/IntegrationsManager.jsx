import { useState } from 'react'
import { api } from '../../utils/api'
import { Check, Loader2, AlertCircle, Trash2, Eye, EyeOff, Plug, ChevronDown, ExternalLink } from 'lucide-react'

/**
 * Unified management surface for third-party API integrations (Anthropic, OpenAI,
 * ElevenLabs). Each integration is a row in a clean, table-style list with its
 * brand logo, a connection status pill, and an inline editor for its key(s).
 *
 * All keys are stored in portal_user_api_keys (AES-256-GCM encrypted) via the
 * /api/account/api-keys endpoints — this component is purely the presentation
 * and edit surface for those providers.
 */

// Brand logos as simple-icons paths (rendered in white over an accent tile).
const INTEGRATIONS = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    category: 'AI · Chat',
    description: 'Claude powers agent reasoning and in-hotel bot conversations. Your key overrides the server default so usage is billed to your own account.',
    accent: '#D97757',
    logo: 'M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z',
    docsUrl: 'https://console.anthropic.com',
    fields: [
      { provider: 'anthropic', label: 'API Key', kind: 'secret', placeholder: 'sk-ant-api03-…' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'Voice · Speech-to-Text',
    description: 'Whisper transcribes your spoken input in the Voice Chat tab.',
    accent: '#10A37F',
    logo: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z',
    docsUrl: 'https://platform.openai.com/api-keys',
    fields: [
      { provider: 'openai', label: 'API Key', kind: 'secret', placeholder: 'sk-…' },
    ],
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    category: 'Voice · Text-to-Speech',
    description: 'Speaks agent and bot replies aloud with lifelike voices. Add an optional narrator voice ID for the default assistant voice.',
    accent: '#000000',
    logo: 'M4.6035 0v24h4.9317V0zm9.8613 0v24h4.9317V0z',
    docsUrl: 'https://elevenlabs.io/app/settings/api-keys',
    fields: [
      { provider: 'elevenlabs', label: 'API Key', kind: 'secret', placeholder: 'el-…' },
      { provider: 'elevenlabs_voice', label: 'Narrator Voice ID', kind: 'text', placeholder: 'EXAVITQu4vr4xnSDxMaL', optional: true, helpUrl: 'https://elevenlabs.io/app/voice-library' },
    ],
  },
]

function BrandTile({ accent, logo, name }) {
  return (
    <span
      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ring-1 ring-black/10 dark:ring-white/10"
      style={{ backgroundColor: accent }}
    >
      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="#ffffff" role="img" aria-label={name}>
        <path d={logo} />
      </svg>
    </span>
  )
}

function FieldEditor({ field, existing, onChanged }) {
  const [input, setInput] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [msg, setMsg] = useState(null) // { type, text }

  const isSecret = field.kind === 'secret'

  async function save() {
    if (!input.trim()) return
    setSaving(true); setMsg(null)
    try {
      await api('/api/account/api-keys', { method: 'POST', body: { provider: field.provider, api_key: input.trim() } })
      setInput('')
      setMsg({ type: 'success', text: 'Saved.' })
      await onChanged?.()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${field.label}?`)) return
    setRemoving(true); setMsg(null)
    try {
      await api(`/api/account/api-keys/${field.provider}`, { method: 'DELETE' })
      setMsg({ type: 'success', text: 'Removed.' })
      await onChanged?.()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
          {field.label}
          {field.optional && <span className="text-[10px] text-muted-foreground font-normal">(optional)</span>}
        </label>
        {existing && <span className="text-xs text-muted-foreground font-mono">{existing.masked}</span>}
      </div>

      {msg && (
        <div className={`text-xs rounded px-2 py-1 flex items-center gap-1.5 ${msg.type === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
          {msg.type === 'success' ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
          {msg.text}
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={isSecret && !show ? 'password' : 'text'}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={existing ? '(replace current value)' : field.placeholder}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10"
            onKeyDown={e => e.key === 'Enter' && save()}
          />
          {isSecret && (
            <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide value' : 'Show value'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
        <button onClick={save} disabled={saving || !input.trim()}
          className="flex items-center gap-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
        </button>
        {existing && (
          <button onClick={remove} disabled={removing} aria-label={`Remove ${field.label}`}
            className="flex items-center gap-1 px-3 py-2 border border-destructive/30 text-destructive rounded-lg text-xs hover:bg-destructive/10 disabled:opacity-50 transition-colors">
            {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {field.helpUrl && (
        <a href={field.helpUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          Browse voice library <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  )
}

function IntegrationRow({ integration, keys, onChanged, expanded, onToggle }) {
  const primary = integration.fields[0]
  const connected = keys.some(k => k.provider === primary.provider)

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-secondary/40 transition-colors"
      >
        <BrandTile accent={integration.accent} logo={integration.logo} name={integration.name} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{integration.name}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-secondary rounded px-1.5 py-0.5">{integration.category}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{integration.description}</p>
        </div>

        {connected ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-success" /> Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" /> Not connected
          </span>
        )}

        <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-4 bg-secondary/20">
          <p className="text-xs text-muted-foreground">{integration.description}</p>
          {integration.fields.map(field => (
            <FieldEditor
              key={field.provider}
              field={field}
              existing={keys.find(k => k.provider === field.provider) || null}
              onChanged={onChanged}
            />
          ))}
          <a href={integration.docsUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            Get your {integration.name} key <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  )
}

export function IntegrationsManager({ keys = [], loading = false, onChanged }) {
  const [expandedId, setExpandedId] = useState(null)

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
        <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0"><Plug className="w-3.5 h-3.5" /></span>
        Integrations
      </h2>
      <p className="text-xs text-muted-foreground">
        Connect your own provider keys. Each key is stored AES-256-GCM encrypted — never in plain text — and is used across the portal and hotel.
      </p>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-6">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading integrations…
          </div>
        ) : (
          INTEGRATIONS.map(integration => (
            <IntegrationRow
              key={integration.id}
              integration={integration}
              keys={keys}
              onChanged={onChanged}
              expanded={expandedId === integration.id}
              onToggle={() => setExpandedId(id => (id === integration.id ? null : integration.id))}
            />
          ))
        )}
      </div>
    </section>
  )
}
