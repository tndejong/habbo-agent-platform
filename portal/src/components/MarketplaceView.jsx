import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import { HabboFigure } from './HabboFigure'
import { api } from '../utils/api'
import { friendlyFetchError } from '../utils/fetchError'
import { useToast } from '../ToastContext'
import { parseSkills, parseSkillSlugs } from '../utils/parseSkills'
import { useSkillsCatalog } from '../utils/useSkillsCatalog'
import { useEscapeKey } from '../utils/useEscapeKey'
import { can } from '../utils/permissions'
import {
  Package, Users, User, Check, Loader2, AlertCircle, Download,
  Sparkles, BookOpen, ListTodo, MessageSquare, Workflow, LayoutGrid,
  Plus, Upload, Pencil, Trash2, FileJson, X, Save, ChevronRight, ArrowLeft,
  Zap, Code2, Bot, Tag, Wrench, ExternalLink,
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────

/** @deprecated use parseSkills from utils/parseSkills */
function parseCapabilityList(cap) {
  return parseSkills(cap)
}

function normalizeTeamTasks(raw) {
  if (raw == null || raw === '') return []
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw
    const list = Array.isArray(j) ? j : j && typeof j === 'object' ? [j] : []
    return list.map((item, idx) => {
      if (typeof item === 'string') return { key: `t-${idx}`, title: item, description: '', id: null }
      if (item && typeof item === 'object') {
        return {
          key: item.id != null ? `id-${item.id}` : `t-${idx}`,
          id: item.id != null ? String(item.id) : null,
          title: String(item.title || item.name || item.label || `Task ${idx + 1}`),
          description: String(item.description ?? item.detail ?? item.body ?? ''),
        }
      }
      return { key: `t-${idx}`, title: String(item), description: '', id: null }
    })
  } catch { return [] }
}

function SectionLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {Icon && <Icon className="w-3.5 h-3.5 opacity-80 shrink-0" aria-hidden />}
      {children}
    </div>
  )
}

// ── Persona editor (for create/edit forms) ───────────────────────────────────

const BLANK_PERSONA = { name: '', role: '', description: '', capabilities: '[]', prompt: '', figure_type: 'agent-m', figure: '', member_role: '' }
const BLANK_TEAM = { name: '', description: '', execution_mode: 'shared', language: 'en', orchestrator_prompt: '', tasks_json: '[]' }

function PersonaEditor({ persona, onChange, onRemove, index }) {
  const [open, setOpen] = useState(index === 0)
  const { catalog } = useSkillsCatalog()

  // Parse current slug array from capabilities JSON
  const selectedSlugs = (() => {
    try { const a = JSON.parse(persona.capabilities); return Array.isArray(a) ? a : [] } catch { return [] }
  })()

  function toggleSkill(slug) {
    const next = selectedSlugs.includes(slug)
      ? selectedSlugs.filter(s => s !== slug)
      : [...selectedSlugs, slug]
    onChange('capabilities', JSON.stringify(next))
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center bg-muted/40 hover:bg-muted/60 transition-colors">
        <button type="button" onClick={() => setOpen(o => !o)} className="flex-1 flex items-center justify-between px-3 py-2 text-sm font-medium text-foreground text-left">
          <span className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 opacity-60" />
            {persona.name || `Agent ${index + 1}`}
            {persona.member_role && <span className="text-[10px] text-muted-foreground ml-1">({persona.member_role})</span>}
          </span>
          <span className="flex items-center gap-1 mr-2">
            {open ? <X className="w-3 h-3 opacity-40" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
        </button>
        <button type="button" onClick={onRemove} aria-label="Remove agent" className="text-destructive/60 hover:text-destructive p-1.5 mr-1 rounded transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && (
        <div className="p-3 space-y-3 bg-background">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Name *</label>
              <input className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1.5 text-foreground" value={persona.name} onChange={e => onChange('name', e.target.value)} placeholder="e.g. Sander" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Team role</label>
              <input className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1.5 text-foreground" value={persona.member_role} onChange={e => onChange('member_role', e.target.value)} placeholder="e.g. researcher" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Persona role</label>
              <input className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1.5 text-foreground" value={persona.role} onChange={e => onChange('role', e.target.value)} placeholder="e.g. Researcher" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Figure type</label>
              <input className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1.5 text-foreground" value={persona.figure_type} onChange={e => onChange('figure_type', e.target.value)} placeholder="agent-m" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Description</label>
            <input className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1.5 text-foreground" value={persona.description} onChange={e => onChange('description', e.target.value)} placeholder="Short description" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Skills</label>
            {catalog.length === 0 ? (
              <p className="text-xs text-muted-foreground">No skills available.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {catalog.map(s => {
                  const active = selectedSlugs.includes(s.slug)
                  return (
                    <button key={s.slug} type="button" onClick={() => toggleSkill(s.slug)}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                        active
                          ? 'bg-primary/20 border-primary/40 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
                      }`}>
                      {active && <span className="mr-1">✓</span>}{s.title}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Prompt / Instructions</label>
            <textarea rows={6} className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1.5 text-foreground font-mono resize-y" value={persona.prompt} onChange={e => onChange('prompt', e.target.value)} placeholder="You are..." />
          </div>
        </div>
      )}
    </div>
  )
}

function TeamForm({ initial, onSave, onCancel, saving }) {
  const [team, setTeam] = useState(initial?.team || BLANK_TEAM)
  const [personas, setPersonas] = useState(initial?.personas || [{ ...BLANK_PERSONA }])
  const [tasksError, setTasksError] = useState(null)

  function setTeamField(k, v) { setTeam(t => ({ ...t, [k]: v })) }
  function validateTasksJson(v) { try { JSON.parse(v); setTasksError(null) } catch (e) { setTasksError(e.message) } }
  function addPersona() { setPersonas(p => [...p, { ...BLANK_PERSONA }]) }
  function removePersona(i) { setPersonas(p => p.filter((_, idx) => idx !== i)) }
  function updatePersona(i, k, v) { setPersonas(p => p.map((x, idx) => idx === i ? { ...x, [k]: v } : x)) }

  function handleSubmit(e) {
    e.preventDefault()
    if (tasksError) return
    onSave({ team, personas })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block font-medium">Team name *</label>
            <input required className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1.5 text-foreground" value={team.name} onChange={e => setTeamField('name', e.target.value)} placeholder="e.g. Waitlist Team" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block font-medium">Execution mode</label>
            <select className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1.5 text-foreground" value={team.execution_mode} onChange={e => setTeamField('execution_mode', e.target.value)}>
              <option value="shared">shared</option>
              <option value="concurrent">concurrent</option>
              <option value="sequential">sequential</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block font-medium">Description</label>
          <input className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1.5 text-foreground" value={team.description} onChange={e => setTeamField('description', e.target.value)} placeholder="Short description" />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block font-medium">Orchestrator prompt</label>
          <textarea rows={5} className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1.5 text-foreground font-mono resize-y" value={team.orchestrator_prompt} onChange={e => setTeamField('orchestrator_prompt', e.target.value)} placeholder="Use {{PERSONAS}}, {{TASKS}}, {{ROOM_ID}}, {{TRIGGERED_BY}}" />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block font-medium">Tasks JSON {tasksError && <span className="ml-2 text-destructive/80">{tasksError}</span>}</label>
          <textarea rows={6} className={`w-full text-xs bg-muted/50 border rounded px-2 py-1.5 text-foreground font-mono resize-y ${tasksError ? 'border-destructive/60' : 'border-border'}`} value={team.tasks_json} onChange={e => { setTeamField('tasks_json', e.target.value); validateTasksJson(e.target.value) }} />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">Agents</span>
          <button type="button" onClick={addPersona} className="text-xs text-primary hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add agent</button>
        </div>
        <div className="space-y-2">
          {personas.map((p, i) => (
            <PersonaEditor key={i} persona={p} index={i} onChange={(k, v) => updatePersona(i, k, v)} onRemove={() => removePersona(i)} />
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <button type="button" onClick={onCancel} className="text-sm px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground">Cancel</button>
        <button type="submit" disabled={saving || !!tasksError} className="text-sm px-4 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : 'Save team'}
        </button>
      </div>
    </form>
  )
}

// ── Import modal ──────────────────────────────────────────────────────────────

function ImportModal({ onClose, onImported }) {
  const fileRef = useRef(null)
  const [json, setJson] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setJson(await file.text())
    setError(null)
  }

  async function handleImport() {
    setError(null)
    let bundle
    try { bundle = JSON.parse(json) } catch (e) { setError('Invalid JSON: ' + e.message); return }
    if (!bundle.team?.name) { setError('Bundle must have a team.name'); return }
    setLoading(true)
    try {
      await api('/api/dev/marketplace/teams/import', { method: 'POST', body: JSON.stringify(bundle) })
      onImported()
      onClose()
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2"><Upload className="w-4 h-4 text-primary" /><h3 className="text-sm font-semibold text-foreground">Import team bundle</h3></div>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <button type="button" onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-border rounded-xl py-6 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground flex flex-col items-center gap-2">
            <FileJson className="w-6 h-6 opacity-60" />Click to select a .json file
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFile} />
          <p className="text-[11px] text-muted-foreground text-center">— or paste JSON below —</p>
          <textarea rows={8} className="w-full text-xs bg-muted/50 border border-border rounded px-3 py-2 text-foreground font-mono resize-y" value={json} onChange={e => { setJson(e.target.value); setError(null) }} placeholder='{"version":"1.0","team":{...},"personas":[...]}' />
          {error && <p className="text-xs text-destructive/80 bg-destructive/10 rounded px-3 py-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground">Cancel</button>
          <button onClick={handleImport} disabled={!json.trim() || loading} className="text-sm px-4 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {loading ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit / Create modals ─────────────────────────────────────────────────────

function EditModal({ team, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const initial = {
    team: {
      name: team.name, description: team.description || '', execution_mode: team.execution_mode || 'shared',
      language: team.language || 'en', orchestrator_prompt: team.orchestrator_prompt || '',
      tasks_json: (() => { try { return JSON.stringify(typeof team.tasks_json === 'string' ? JSON.parse(team.tasks_json) : team.tasks_json, null, 2) } catch { return '[]' } })(),
    },
    personas: (team.members || []).map(m => {
      // Normalise capabilities to JSON slug array string
      let caps = m.capabilities || '[]'
      if (caps && !caps.trim().startsWith('[')) {
        // Legacy bullet/comma format — leave as empty array for clean edit
        caps = '[]'
      }
      return {
        name: m.name || '', role: m.persona_role || m.role || '', description: m.description || '',
        capabilities: caps, prompt: m.prompt || '', figure_type: m.figure_type || 'agent-m',
        figure: m.figure || '', member_role: m.role || m.team_role || '',
      }
    }),
  }
  async function handleSave({ team: t, personas }) {
    setSaving(true); setError(null)
    try {
      await api('/api/dev/marketplace/teams/import', { method: 'POST', body: JSON.stringify({ team: { ...t, tasks_json: (() => { try { return JSON.parse(t.tasks_json) } catch { return [] } })() }, personas }) })
      onSaved(); onClose()
    } catch (e) { setError(e.message); setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2"><Pencil className="w-4 h-4 text-primary" /><h3 className="text-sm font-semibold text-foreground">Edit: {team.name}</h3></div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          {error && <p className="text-xs text-destructive/80 bg-destructive/10 rounded px-3 py-2 mb-3">{error}</p>}
          <TeamForm initial={initial} onSave={handleSave} onCancel={onClose} saving={saving} />
        </div>
      </div>
    </div>
  )
}

function CreateModal({ onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  async function handleSave({ team: t, personas }) {
    setSaving(true); setError(null)
    try {
      await api('/api/dev/marketplace/teams/import', { method: 'POST', body: JSON.stringify({ team: { ...t, tasks_json: (() => { try { return JSON.parse(t.tasks_json) } catch { return [] } })() }, personas }) })
      onSaved(); onClose()
    } catch (e) { setError(e.message); setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /><h3 className="text-sm font-semibold text-foreground">New marketplace team</h3></div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          {error && <p className="text-xs text-destructive/80 bg-destructive/10 rounded px-3 py-2 mb-3">{error}</p>}
          <TeamForm onSave={handleSave} onCancel={onClose} saving={saving} />
        </div>
      </div>
    </div>
  )
}

// ── Compact team card (grid view) ─────────────────────────────────────────────

function TeamCard({ team, installed, installing, onInstall, onUninstall, disabled, isDev, onEdit, onDelete, onExport, onSelect }) {
  const members = team.members || []
  function handleCardClick(e) {
    // Don't navigate if user clicked a button inside the card
    if (e.target.closest('button')) return
    onSelect()
  }
  return (
    <div
      onClick={handleCardClick}
      className="bg-card border border-border rounded-xl overflow-hidden cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{team.name}</h3>
            {team.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{team.description}</p>}
          </div>
          <div className="flex-shrink-0 flex items-center gap-1.5">
            {isDev && (
              <>
                <button onClick={onExport} title="Export JSON" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><FileJson className="w-3.5 h-3.5" /></button>
                <button onClick={onEdit} title="Edit" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={onDelete} title="Delete" className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </>
            )}
            {installed ? (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-xs text-success bg-success/10 px-2.5 py-1.5 rounded-lg"><Check className="w-3 h-3" /> Installed</span>
                {onUninstall && (
                  <button onClick={e => { e.stopPropagation(); onUninstall() }} disabled={installing}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {installing ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Uninstall'}
                  </button>
                )}
              </div>
            ) : (
              <button onClick={onInstall} disabled={disabled || installing} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {installing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                {disabled ? 'Pro Required' : installing ? 'Installing…' : 'Install'}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2.5">
          <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{team.execution_mode || 'concurrent'}</span>
          <span className="text-[10px] text-muted-foreground"><Users className="w-3 h-3 inline mr-1" />{members.length} {members.length === 1 ? 'agent' : 'agents'}</span>
        </div>
        {members.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80 mr-2">Agents</span>
            {members.map(m => (m.name || '').trim()).filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Team detail page ──────────────────────────────────────────────────────────

function TeamDetail({ team, installed, installing, onInstall, onUninstall, disabled, isDev, onEdit, onExport, onBack }) {
  const members = team.members || []
  const teamTasks = normalizeTeamTasks(team.tasks_json)
  const flows = team.flows || []

  return (
    <div className="space-y-5">
      {/* Back + header */}
      <div>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Marketplace
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-foreground">{team.name}</h2>
            {team.description && <p className="text-sm text-muted-foreground mt-1">{team.description}</p>}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/80">Mode</span>
                <span className="capitalize">{team.execution_mode || 'concurrent'}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/80">Language</span>
                {(team.language || 'en').toUpperCase()}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-[11px] text-muted-foreground">
                <Users className="w-3 h-3" /> {members.length} {members.length === 1 ? 'agent' : 'agents'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isDev && (
              <>
                <button onClick={onExport} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><FileJson className="w-3.5 h-3.5" /> Export</button>
                <button onClick={onEdit} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Pencil className="w-3.5 h-3.5" /> Edit</button>
              </>
            )}
            {installed ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs text-success bg-success/10 px-3 py-1.5 rounded-lg"><Check className="w-3 h-3" /> Installed</span>
                {onUninstall && (
                  <button onClick={onUninstall} disabled={installing}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {installing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Uninstall'}
                  </button>
                )}
              </div>
            ) : (
              <button onClick={onInstall} disabled={disabled || installing} className="inline-flex items-center gap-1.5 text-xs font-medium px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {installing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                {disabled ? 'Pro Required' : installing ? 'Installing…' : 'Install'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Orchestrator prompt */}
      {team.orchestrator_prompt?.trim() && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <SectionLabel icon={MessageSquare}>Orchestrator prompt</SectionLabel>
          <div className="text-xs text-foreground/85 leading-relaxed mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono">{team.orchestrator_prompt}</div>
        </div>
      )}

      {/* Tasks */}
      {teamTasks.length > 0 && (
        <div>
          <SectionLabel icon={ListTodo}>Task pipeline</SectionLabel>
          <ul className="mt-3 space-y-2">
            {teamTasks.map((task) => (
              <li key={task.key} className="rounded-lg border border-border/70 bg-card p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground leading-snug">{task.title}</p>
                  {task.id && <span className="shrink-0 text-[10px] font-mono text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded">{task.id}</span>}
                </div>
                {task.description?.trim() && <p className="text-xs text-muted-foreground leading-relaxed mt-2 border-t border-border/40 pt-2">{task.description}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Flows */}
      {flows.length > 0 && (
        <div>
          <SectionLabel icon={Workflow}>Flows</SectionLabel>
          <ul className="mt-3 space-y-2">
            {flows.map((f, i) => (
              <li key={f.id ?? i} className="rounded-lg border border-border/70 bg-card px-3 py-2.5">
                <p className="text-sm font-medium text-foreground">{f.name}</p>
                {f.description?.trim() && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.description}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Agents */}
      {members.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary shrink-0" aria-hidden />
            <span className="text-sm font-semibold text-foreground">Agents</span>
            <span className="text-xs text-muted-foreground">({members.length})</span>
          </div>
          {members.map((m, i) => {
            const skills = parseCapabilityList(m.capabilities)
            return (
              <div key={m.id ?? m.persona_id ?? i} className="rounded-xl border border-border/80 bg-card shadow-sm p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted/60 overflow-hidden flex items-center justify-center flex-shrink-0 text-muted-foreground">
                    <HabboFigure figure={m.figure} figureType={m.figure_type} headOnly size={40} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{m.name}</p>
                    {m.description && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{m.description}</p>}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.role?.trim() && <span className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded">Team role: {m.role}</span>}
                      {m.persona_role?.trim() && <span className="text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground">Persona: {m.persona_role}</span>}
                    </div>
                  </div>
                </div>
                {skills.length > 0 && (
                  <div>
                    <SectionLabel icon={Sparkles}>Skills &amp; capabilities</SectionLabel>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {skills.map((s, j) => <span key={j} className="text-[11px] bg-primary/10 text-foreground/90 px-2.5 py-1 rounded-full border border-primary/15">{s}</span>)}
                    </div>
                  </div>
                )}
                {m.prompt?.trim() && (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <SectionLabel icon={BookOpen}>Behavior &amp; instructions</SectionLabel>
                    <div className="text-[11px] text-foreground/85 leading-relaxed mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">{m.prompt}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Skills Tab ────────────────────────────────────────────────────────────────

const CATEGORY_STYLE = {
  hotel:         'bg-sky-500/10 text-sky-400 border-sky-500/20',
  research:      'bg-violet-500/10 text-violet-400 border-violet-500/20',
  coordination:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  communication: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  general:       'bg-secondary text-muted-foreground border-border',
}

const INTEGRATION_META = {
  atlassian: { label: 'Atlassian', icon: '/integrations/atlassian.svg', color: 'bg-blue-600/10 border-blue-500/20' },
  notion:    { label: 'Notion',    icon: '/integrations/notion.svg',    color: 'bg-neutral-500/10 border-neutral-500/20' },
  resend:    { label: 'Resend',    icon: 'https://www.google.com/s2/favicons?domain=resend.com&sz=64', color: 'bg-emerald-500/10 border-emerald-500/20' },
}

function IntegrationBadge({ name, onNavigate }) {
  const meta = INTEGRATION_META[name?.toLowerCase()] || null
  const inner = meta ? (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium border rounded-md px-2 py-0.5 ${meta.color}`}>
      <img src={meta.icon} alt={meta.label} className="w-3 h-3 object-contain" />
      <span className="text-foreground/70">Requires</span>
      <span className="text-foreground/90">{meta.label}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-secondary border border-border rounded-md px-2 py-0.5">
      <AlertCircle className="w-3 h-3" /> Requires {name}
    </span>
  )
  if (!onNavigate) return inner
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onNavigate('integrations') }}
      className="inline-flex items-center gap-1.5 group/ibadge" title="Set up integration">
      {inner}
      <span className="text-[10px] text-primary/60 group-hover/ibadge:text-primary transition-colors hidden group-hover/ibadge:inline">
        Set up →
      </span>
    </button>
  )
}

// ── Skill Detail Page ─────────────────────────────────────────────────────────

export function SkillDetail({ skill, onBack, onNavigate }) {
  const [body, setBody] = useState(skill.body || null)
  const [loading, setLoading] = useState(!skill.body)
  useEscapeKey(onBack)

  useEffect(() => {
    if (skill.body) { setBody(skill.body); return }
    api(`/api/skills/${skill.slug}`)
      .then(d => setBody(d.skill?.body || ''))
      .catch(() => setBody('Could not load instructions.'))
      .finally(() => setLoading(false))
  }, [skill.slug, skill.body])

  const catStyle = CATEGORY_STYLE[skill.category] || CATEGORY_STYLE.general

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <button onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
        Skills
        <span className="text-muted-foreground/40 mx-0.5">/</span>
        <span className="text-foreground">{skill.title}</span>
      </button>

      {/* Hero */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border ${catStyle}`}>
            <Zap className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-foreground">{skill.title}</h2>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border capitalize font-medium ${catStyle}`}>
                {skill.category}
              </span>
              {skill.difficulty && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                  skill.difficulty === 'beginner'
                    ? 'bg-success/10 text-success border-success/20'
                    : 'bg-warning/10 text-warning border-warning/20'
                }`}>
                  {skill.difficulty}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{skill.description}</p>
          </div>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border">
          {/* Slug */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1 flex items-center gap-1"><Tag className="w-3 h-3" /> Slug</p>
            <code className="text-xs font-mono text-foreground/70 bg-secondary px-2 py-0.5 rounded">{skill.slug}</code>
          </div>

          {/* MCP tools */}
          {skill.mcp_tools?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1 flex items-center gap-1"><Wrench className="w-3 h-3" /> MCP Tools</p>
              <div className="flex flex-wrap gap-1">
                {skill.mcp_tools.map(t => (
                  <code key={t} className="text-[11px] font-mono bg-secondary border border-border rounded px-1.5 py-0.5 text-muted-foreground">{t}</code>
                ))}
              </div>
            </div>
          )}

          {/* Integration */}
          {skill.requires_integration && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1 flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Integration</p>
              <IntegrationBadge name={skill.requires_integration} onNavigate={onNavigate} />
            </div>
          )}
        </div>

        {/* Tags */}
        {skill.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {skill.tags.map(tag => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Instructions body */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Instructions</span>
          <span className="ml-auto text-[10px] text-muted-foreground/40 font-mono">SKILL.md</span>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none
              [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-foreground [&_h1]:mt-0 [&_h1]:mb-3
              [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:pb-1 [&_h2]:border-b [&_h2]:border-border
              [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-foreground/80 [&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:uppercase [&_h3]:tracking-wider
              [&_p]:text-sm [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_p]:my-2
              [&_ul]:my-2 [&_ul]:space-y-1 [&_ul>li]:text-sm [&_ul>li]:text-muted-foreground [&_ul>li]:pl-1
              [&_ol]:my-2 [&_ol]:space-y-1 [&_ol>li]:text-sm [&_ol>li]:text-muted-foreground [&_ol>li]:pl-1
              [&_code]:text-xs [&_code]:font-mono [&_code]:bg-secondary [&_code]:text-primary/80 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded
              [&_pre]:bg-background [&_pre]:border [&_pre]:border-border [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:my-3
              [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-muted-foreground [&_pre_code]:text-xs
              [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote]:italic [&_blockquote]:my-3
              [&_strong]:text-foreground [&_strong]:font-semibold
              [&_hr]:border-border [&_hr]:my-4">
              <ReactMarkdown>{body || ''}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Skills Tab (grid) ─────────────────────────────────────────────────────────

function SkillsTab({ onNavigate }) {
  const { catalog: skills, loading } = useSkillsCatalog()
  const [activeCategory, setActiveCategory] = useState('all')
  const [selectedSkill, setSelectedSkill] = useState(null)

  const categories = ['all', ...[...new Set(skills.map(s => s.category))].sort()]
  const visible = activeCategory === 'all' ? skills : skills.filter(s => s.category === activeCategory)

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  )

  if (selectedSkill) return (
    <SkillDetail skill={selectedSkill} onBack={() => setSelectedSkill(null)} onNavigate={onNavigate} />
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Skills</h2>
        <p className="text-sm text-muted-foreground">Reusable capability packages injected into agents at deploy time.</p>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5">
        {categories.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            className={`text-xs px-3 py-1 rounded-full border capitalize transition-colors ${
              activeCategory === cat
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
            }`}>
            {cat === 'all' ? `All (${skills.length})` : cat}
          </button>
        ))}
      </div>

      {skills.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <Zap className="w-7 h-7 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No skills found</p>
          <p className="text-xs text-muted-foreground mt-1">Add a <code className="font-mono">SKILL.md</code> folder under <code className="font-mono">agents/skills/</code>.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visible.map(skill => {
            const catStyle = CATEGORY_STYLE[skill.category] || CATEGORY_STYLE.general
            return (
              <button key={skill.slug} onClick={() => setSelectedSkill(skill)}
                className="group text-left bg-card border border-border rounded-xl transition-all hover:border-primary/40 hover:shadow-sm flex flex-col">
                <div className="p-4 flex flex-col gap-3 flex-1">
                  {/* Title row */}
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border ${catStyle}`}>
                      <Zap className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground leading-tight group-hover:text-primary transition-colors">
                          {skill.title}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize font-medium ${catStyle}`}>
                          {skill.category}
                        </span>
                        {skill.difficulty && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                            skill.difficulty === 'beginner'
                              ? 'bg-success/10 text-success border-success/20'
                              : 'bg-warning/10 text-warning border-warning/20'
                          }`}>
                            {skill.difficulty}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{skill.description}</p>
                    </div>
                  </div>

                  {/* Integration badge only — actions shown on detail page */}
                  {skill.requires_integration && (
                    <div>
                      <IntegrationBadge name={skill.requires_integration} onNavigate={onNavigate} />
                    </div>
                  )}
                </div>

                {/* Card footer */}
                <div className="px-4 pb-3 flex items-center justify-end">
                  <code className="text-[10px] font-mono text-muted-foreground/25">{skill.slug}</code>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/40 pt-1">
        Skills live in <code className="font-mono">agents/skills/*/SKILL.md</code> — drop a new folder to publish.
      </p>
    </div>
  )
}

// ── Persona Detail Page ───────────────────────────────────────────────────────

function PersonaDetail({ persona, onBack }) {
  const { catalog } = useSkillsCatalog()
  const [selectedSkill, setSelectedSkill] = useState(null)
  useEscapeKey(() => selectedSkill ? setSelectedSkill(null) : onBack(), true)

  const personaSkills = useMemo(() => {
    const slugs = parseSkillSlugs(persona.capabilities)
    if (slugs.length > 0) {
      return slugs.map(slug => {
        const found = catalog.find(s => s.slug === slug)
        return found || { slug, title: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }
      })
    }
    return parseSkills(persona.capabilities, catalog).map(title => ({ slug: null, title }))
  }, [persona.capabilities, catalog])

  const cleanPrompt = persona.prompt?.replace(/^## Skills[\s\S]*$/m, '').trim()

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <button onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
        Personas
        <span className="text-muted-foreground/40 mx-0.5">/</span>
        <span className="text-foreground">{persona.name}</span>
      </button>

      {/* Hero */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex gap-0">
          {/* Figure */}
          <div className="flex flex-col items-center justify-center px-8 py-6 bg-secondary/30 border-r border-border flex-shrink-0">
            <HabboFigure figure={persona.figure} figureType={persona.figure_type} size="xl" animate={true} />
          </div>
          {/* Meta */}
          <div className="flex-1 min-w-0 p-6 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-foreground">{persona.name}</h2>
              {persona.role && (
                <span className="text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5">
                  {persona.role}
                </span>
              )}
            </div>
            {persona.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{persona.description}</p>
            )}
            {/* Skills */}
            {personaSkills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wider self-center">
                  <Sparkles className="w-2.5 h-2.5" /> Skills
                </span>
                {personaSkills.map((s, i) => (
                  s.slug ? (
                    <button key={i}
                      onClick={() => setSelectedSkill(catalog.find(c => c.slug === s.slug) || s)}
                      className="text-[11px] bg-secondary text-muted-foreground border border-border rounded-md px-2 py-0.5 hover:border-primary/40 hover:text-foreground hover:bg-primary/5 transition-colors cursor-pointer">
                      {s.title}
                    </button>
                  ) : (
                    <span key={i} className="text-[11px] bg-secondary text-muted-foreground border border-border rounded-md px-2 py-0.5">
                      {s.title}
                    </span>
                  )
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Prompt / Instructions */}
      {cleanPrompt && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Identity &amp; Instructions</span>
          </div>
          <div className="p-5">
            <div className="prose prose-sm prose-invert max-w-none
              [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-foreground [&_h1]:mt-0 [&_h1]:mb-3
              [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:pb-1 [&_h2]:border-b [&_h2]:border-border
              [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-foreground/80 [&_h3]:mt-4 [&_h3]:mb-1.5
              [&_p]:text-sm [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_p]:my-2
              [&_ul]:my-2 [&_ul]:space-y-1 [&_ul>li]:text-sm [&_ul>li]:text-muted-foreground
              [&_ol]:my-2 [&_ol]:space-y-1 [&_ol>li]:text-sm [&_ol>li]:text-muted-foreground
              [&_code]:text-xs [&_code]:font-mono [&_code]:bg-secondary [&_code]:text-primary/80 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded
              [&_strong]:text-foreground [&_strong]:font-semibold
              [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote]:italic">
              <ReactMarkdown>{cleanPrompt}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {/* Skill detail modal */}
      {selectedSkill && createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={e => { if (e.target === e.currentTarget) setSelectedSkill(null) }}>
          <div className="bg-background border border-border rounded-2xl shadow-xl w-full max-w-4xl my-8">
            <div className="flex items-center justify-end px-5 pt-4">
              <button onClick={() => setSelectedSkill(null)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 pb-6">
              <SkillDetail skill={selectedSkill} onBack={() => setSelectedSkill(null)} />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ── Personas Tab ──────────────────────────────────────────────────────────────

function PersonasTab() {
  const { catalog: skills } = useSkillsCatalog()
  const [personas, setPersonas] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPersona, setSelectedPersona] = useState(null)

  useEffect(() => {
    api('/api/agents/personas')
      .then(pd => setPersonas(pd.personas || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  )

  if (selectedPersona) return (
    <PersonaDetail persona={selectedPersona} onBack={() => setSelectedPersona(null)} />
  )

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Personas</h2>
        <p className="text-sm text-muted-foreground">Shared agent personas available in the marketplace. Install a team to get its personas in My Agents.</p>
      </div>

      {personas.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <Bot className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No personas yet</p>
          <p className="text-xs text-muted-foreground mt-1">Personas appear here when teams are added to the marketplace.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {personas.map(persona => {
            const personaSkills = parseSkills(persona.capabilities, skills)
            return (
              <button key={persona.id} onClick={() => setSelectedPersona(persona)}
                className="group text-left bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-sm transition-all flex">
                {/* Figure column */}
                <div className="flex flex-col items-center justify-start pt-4 px-3 pb-4 bg-secondary/30 border-r border-border flex-shrink-0 w-20">
                  <HabboFigure figure={persona.figure} figureType={persona.figure_type} size="xl" animate={false} />
                </div>
                <div className="flex-1 min-w-0 p-3 space-y-2 flex flex-col">
                  <div>
                    <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{persona.name}</p>
                    {persona.role && (
                      <span className="inline-flex items-center text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 mt-1">
                        {persona.role}
                      </span>
                    )}
                  </div>

                  {persona.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{persona.description}</p>
                  )}

                  {/* Skills chips */}
                  {personaSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wider">
                        <Sparkles className="w-2.5 h-2.5" /> Skills
                      </span>
                      {personaSkills.map((s, i) => (
                        <span key={i} className="text-[11px] bg-secondary text-muted-foreground border border-border rounded-md px-2 py-0.5">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-[10px] text-primary/40 group-hover:text-primary/70 transition-colors mt-auto pt-1">View persona →</p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

const MARKETPLACE_TABS = [
  { id: 'teams',    label: 'Teams',    icon: Users },
  { id: 'personas', label: 'Personas', icon: Bot   },
  { id: 'skills',   label: 'Skills',   icon: Zap   },
]

function TeamsTab({ me, isDev }) {
  const { showToast } = useToast()
  const [teams, setTeams] = useState([])
  const [installedIds, setInstalledIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [installingId, setInstallingId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingTeam, setEditingTeam] = useState(null)
  const [selectedTeam, setSelectedTeam] = useState(null)
  const selectedTeamRef = useRef(null)

  const canInstall   = can(me, 'marketplace.install')
  const canUninstall = can(me, 'marketplace.uninstall')

  // Escape key: close active modal or deselect team
  useEscapeKey(() => {
    if (editingTeam) { setEditingTeam(null); return }
    if (showCreate)  { setShowCreate(false); return }
    if (showImport)  { setShowImport(false); return }
    if (selectedTeam) setSelectedTeam(null)
  }, !!(editingTeam || showCreate || showImport || selectedTeam))

  // Keep ref in sync so load() can read current value without stale closure
  useEffect(() => { selectedTeamRef.current = selectedTeam }, [selectedTeam])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [td, id] = await Promise.all([api('/api/agents/teams'), api('/api/my/installed-team-ids')])
      const teamsWithMembers = await Promise.all(
        (td.teams || []).map(async (t) => {
          try { const d = (await api(`/api/agents/teams/${t.id}`)).team || {}; return { ...t, ...d, members: d.members || [] } }
          catch { return { ...t, members: [] } }
        })
      )
      setTeams(teamsWithMembers)
      setInstalledIds(id.installed || [])
      const current = selectedTeamRef.current
      if (current) {
        const fresh = teamsWithMembers.find(t => t.id === current.id)
        setSelectedTeam(fresh || null)
      }
    } catch (e) { setError(friendlyFetchError(e)) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function installTeam(teamId) {
    setInstallingId(teamId)
    try { await api(`/api/marketplace/teams/${teamId}/install`, { method: 'POST' }); setInstalledIds(prev => [...prev, teamId]); showToast('Team installed! Go to My Agents to configure bots and deploy.') }
    catch (e) { showToast(e.message, 'error') } finally { setInstallingId(null) }
  }

  async function uninstallTeam(teamId) {
    setInstallingId(teamId)
    try {
      await api(`/api/marketplace/teams/${teamId}/uninstall`, { method: 'DELETE' })
      setInstalledIds(prev => prev.filter(id => id !== teamId))
      showToast('Team uninstalled.')
    } catch (e) { showToast(e.message || 'Uninstall failed', 'error') } finally { setInstallingId(null) }
  }

  async function deleteTeam(team) {
    if (!confirm(`Delete "${team.name}" from the marketplace? This cannot be undone.`)) return
    try { await api(`/api/agents/teams/${team.id}`, { method: 'DELETE' }); showToast(`"${team.name}" deleted.`); setSelectedTeam(null); load() }
    catch (e) { showToast(e.message, 'error') }
  }

  async function exportTeam(team) {
    try {
      const res = await fetch(`/api/dev/marketplace/teams/${team.id}/export`, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${team.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-team.json`
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('Team exported!')
    } catch (e) { showToast(e.message, 'error') }
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
  if (error) return <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-center"><AlertCircle className="w-5 h-5 text-destructive mx-auto mb-2" /><p className="text-sm text-destructive/80">{error}</p></div>

  return (
    <div className="space-y-4">
      {selectedTeam ? (
        <TeamDetail
          team={selectedTeam}
          installed={installedIds.includes(selectedTeam.id)}
          installing={installingId === selectedTeam.id}
          onInstall={canInstall ? () => installTeam(selectedTeam.id) : undefined}
          onUninstall={canUninstall ? () => uninstallTeam(selectedTeam.id) : undefined}
          disabled={!canInstall}
          isDev={isDev}
          onEdit={() => setEditingTeam(selectedTeam)}
          onExport={() => exportTeam(selectedTeam)}
          onBack={() => setSelectedTeam(null)}
        />
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Teams</h2>
              <p className="text-sm text-muted-foreground">Browse and install agent teams. After installing, configure bots in My Agents.</p>
            </div>
            {isDev && (
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Upload className="w-3.5 h-3.5" /> Import</button>
                <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"><Plus className="w-3.5 h-3.5" /> New team</button>
              </div>
            )}
          </div>

          {!canInstall && (
            <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-warning/80 font-medium">Pro tier required</p>
                <p className="text-xs text-warning/60 mt-0.5">Upgrade to Pro to install and deploy agent teams.</p>
              </div>
            </div>
          )}

          {teams.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-8 text-center">
              <Package className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No teams in marketplace yet</p>
              <p className="text-xs text-muted-foreground mt-1">{isDev ? 'Create a new team or import a bundle above.' : 'Developers can create teams from the Marketplace.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {teams.map(team => (
                <TeamCard
                  key={team.id} team={team}
                  installed={installedIds.includes(team.id)} installing={installingId === team.id}
                  onInstall={canInstall ? () => installTeam(team.id) : undefined}
                  onUninstall={canUninstall ? () => uninstallTeam(team.id) : undefined}
                  disabled={!canInstall} isDev={isDev}
                  onEdit={() => setEditingTeam(team)} onDelete={() => deleteTeam(team)}
                  onExport={() => exportTeam(team)} onSelect={() => setSelectedTeam(team)}
                />
              ))}
            </div>
          )}
        </>
      )}
      {showCreate && createPortal(<CreateModal onClose={() => setShowCreate(false)} onSaved={() => { showToast('Team created!'); load() }} />, document.body)}
      {showImport && createPortal(<ImportModal onClose={() => setShowImport(false)} onSaved={() => { showToast('Team imported!'); load() }} />, document.body)}
      {editingTeam && createPortal(<EditModal team={editingTeam} onClose={() => setEditingTeam(null)} onSaved={() => { showToast('Team updated!'); setEditingTeam(null); load() }} />, document.body)}
    </div>
  )
}

export function MarketplaceView({ me, onNavigate }) {
  const [activeTab, setActiveTab] = useState('teams')
  const isDev = !!me?.is_developer

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Marketplace</h2>
        <p className="text-sm text-muted-foreground">Browse teams, personas, and skills. Install teams to get started.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-secondary/50 border border-border rounded-xl w-fit">
        {MARKETPLACE_TABS.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                active
                  ? 'bg-background text-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'teams'    && <TeamsTab me={me} isDev={isDev} />}
      {activeTab === 'personas' && <PersonasTab />}
      {activeTab === 'skills'   && <SkillsTab onNavigate={onNavigate} />}
    </div>
  )
}
