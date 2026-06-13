import { useState } from 'react'
import { api } from '../../utils/api'
import { Check, Loader2, AlertCircle, Trash2, Eye, EyeOff, Mic, Volume2 } from 'lucide-react'

function VoiceKeyInput({ label, provider, placeholder, helpText, helpLink, existingKey, onSaved }) {
  const [input, setInput] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [msg, setMsg] = useState(null)

  async function save() {
    if (!input.trim()) return
    setSaving(true); setMsg(null)
    try {
      await api('/api/account/api-keys', { method: 'POST', body: { provider, api_key: input.trim() } })
      setInput('')
      setMsg({ type: 'success', text: 'Saved.' })
      onSaved?.()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setSaving(false) }
  }

  async function remove() {
    if (!window.confirm(`Remove ${label}?`)) return
    setRemoving(true); setMsg(null)
    try {
      await api(`/api/account/api-keys/${provider}`, { method: 'DELETE' })
      setMsg({ type: 'success', text: 'Removed.' })
      onSaved?.()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setRemoving(false) }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-foreground">{label}</label>
        {existingKey && (
          <span className="text-xs text-muted-foreground font-mono">{existingKey.masked}</span>
        )}
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
            type={show ? 'text' : 'password'}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={existingKey ? '(replace)' : placeholder}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10"
            onKeyDown={e => e.key === 'Enter' && save()}
          />
          <button type="button" onClick={() => setShow(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        <button onClick={save} disabled={saving || !input.trim()}
          className="flex items-center gap-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
        </button>
        {existingKey && (
          <button onClick={remove} disabled={removing}
            className="flex items-center gap-1 px-3 py-2 border border-destructive/30 text-destructive rounded-lg text-xs hover:bg-destructive/10 disabled:opacity-50 transition-colors">
            {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {helpText}{' '}
        {helpLink && <a href={helpLink} target="_blank" rel="noreferrer" className="text-primary hover:underline">Get key →</a>}
      </p>
    </div>
  )
}

export function VoiceAudioSettings({ keys, loadKeys }) {
  const openaiKey = keys.find(k => k.provider === 'openai')
  const elevenKey = keys.find(k => k.provider === 'elevenlabs')
  const voiceKey  = keys.find(k => k.provider === 'elevenlabs_voice')

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
        <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
          <Mic className="w-3.5 h-3.5" />
        </span>
        Voice &amp; Audio
      </h2>
      <div className="bg-card border border-border rounded-xl p-4 space-y-5">
        <p className="text-xs text-muted-foreground">
          Configure speech recognition and text-to-speech for the{' '}
          <a href="/app/chat" className="text-primary hover:underline">Voice Chat</a> tab.
          Both keys are required to use voice features.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <VoiceKeyInput
            label="OpenAI API Key (Whisper STT)"
            provider="openai"
            placeholder="sk-..."
            helpText="Used for speech-to-text transcription."
            helpLink="https://platform.openai.com/api-keys"
            existingKey={openaiKey}
            onSaved={loadKeys}
          />
          <VoiceKeyInput
            label="ElevenLabs API Key (TTS)"
            provider="elevenlabs"
            placeholder="el-..."
            helpText="Used to speak responses aloud."
            helpLink="https://elevenlabs.io/app/settings/api-keys"
            existingKey={elevenKey}
            onSaved={loadKeys}
          />
        </div>

        <div className="border-t border-border pt-4">
          <VoiceKeyInput
            label="Narrator Voice ID"
            provider="elevenlabs_voice"
            placeholder="EXAVITQu4vr4xnSDxMaL"
            helpText="ElevenLabs voice ID for assistant responses. Find yours at elevenlabs.io/app/voice-library"
            existingKey={voiceKey}
            onSaved={loadKeys}
          />
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <Volume2 className="w-3 h-3" />
            Per-bot voices can be set in each persona's edit form.
          </p>
        </div>
      </div>
    </section>
  )
}
