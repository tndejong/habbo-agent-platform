import { useState, useEffect, useCallback } from 'react'
import { HabboFigure } from './HabboFigure'
import {
  Users, Bot, Zap, Play, Square, Plus, Edit, Trash2,
  ChevronRight, RefreshCw, ArrowUp, ArrowDown,
  Check, X, Loader2, AlertCircle, Radio
} from 'lucide-react'

// ── API helper ────────────────────────────────────────────────────────────

async function api(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

// ── Main Dashboard Component ───────────────────────────────────────────────

export function AgentDashboard({ me }) {
  const isDev = me?.is_developer
  const [tab, setTab] = useState('teams')

  const tabs = [
    { id: 'teams', label: 'Teams', icon: Users },
    ...(isDev ? [
      { id: 'personas', label: 'Personas', icon: Bot },
      { id: 'flows', label: 'Flows', icon: Zap },
    ] : []),
    { id: 'trigger', label: 'Control', icon: Radio },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-sm text-foreground">Agent Command Center</h1>
            <p className="text-xs text-muted-foreground">
              {isDev ? 'Developer Mode' : 'View Mode'}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {me?.figure && <HabboFigure figure={me.figure} size="sm" animate={false} />}
            <span className="text-sm text-muted-foreground">{me?.habbo_username}</span>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4 flex gap-1 pb-0">
          {tabs.map(({ id, label, icon: Icon }) => (
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
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {tab === 'teams' && <TeamsView isDev={isDev} />}
        {tab === 'personas' && isDev && <PersonasView />}
        {tab === 'flows' && isDev && <FlowsView />}
        {tab === 'trigger' && <ControlView isDev={isDev} />}
      </div>
    </div>
  )
}

// ── Teams View ────────────────────────────────────────────────────────────

function TeamsView({ isDev }) {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | team object
  const [personas, setPersonas] = useState([])
  const [flows, setFlows] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [td, pd, fd] = await Promise.all([
        api('/api/agents/teams'),
        api('/api/agents/personas'),
        api('/api/agents/flows'),
      ])
      setTeams(td.teams || [])
      setPersonas(pd.personas || [])
      setFlows(fd.flows || [])
    } catch(e) {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function loadTeamDetail(id) {
    try {
      const d = await api(`/api/agents/teams/${id}`)
      setSelected(d.team)
    } catch(e) {}
  }

  async function deleteTeam(id) {
    if (!confirm('Delete this team?')) return
    await api(`/api/agents/teams/${id}`, { method: 'DELETE' })
    setSelected(null)
    load()
  }

  async function addMember(teamId, personaId) {
    await api(`/api/agents/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ persona_id: personaId })
    })
    loadTeamDetail(teamId)
  }

  async function removeMember(teamId, memberId) {
    await api(`/api/agents/teams/${teamId}/members/${memberId}`, { method: 'DELETE' })
    loadTeamDetail(teamId)
  }

  async function addFlow(teamId, flowId) {
    await api(`/api/agents/teams/${teamId}/flows`, {
      method: 'POST',
      body: JSON.stringify({ flow_id: flowId })
    })
    loadTeamDetail(teamId)
  }

  async function removeFlow(teamId, flowId) {
    await api(`/api/agents/teams/${teamId}/flows/${flowId}`, { method: 'DELETE' })
    loadTeamDetail(teamId)
  }

  if (loading) return <LoadingState />

  if (editing !== null) {
    return (
      <TeamEditor
        team={editing === 'new' ? null : editing}
        onSave={async (data) => {
          const method = editing === 'new' ? 'POST' : 'PUT'
          const url = editing === 'new' ? '/api/agents/teams' : `/api/agents/teams/${editing.id}`
          await api(url, { method, body: JSON.stringify(data) })
          setEditing(null)
          load()
        }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Team list */}
      <div className="md:col-span-1 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Teams</h2>
          {isDev && (
            <button
              onClick={() => setEditing('new')}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          )}
        </div>

        {teams.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No teams yet"
            description={isDev ? "Create your first team to get started" : "No teams available"}
          />
        ) : (
          teams.map(team => (
            <div
              key={team.id}
              onClick={() => loadTeamDetail(team.id)}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selected?.id === team.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:border-border/80 hover:bg-card/80'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm text-foreground">{team.name}</p>
                  {team.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{team.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {team.member_count} {team.member_count === 1 ? 'agent' : 'agents'}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Team detail */}
      <div className="md:col-span-2">
        {selected ? (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-lg text-foreground">{selected.name}</h2>
                {selected.description && (
                  <p className="text-sm text-muted-foreground mt-1">{selected.description}</p>
                )}
              </div>
              {isDev && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(selected)}
                    className="flex items-center gap-1.5 text-xs border border-border px-3 py-1.5 rounded-md hover:bg-secondary transition-colors"
                  >
                    <Edit className="w-3 h-3" /> Edit
                  </button>
                  <button
                    onClick={() => deleteTeam(selected.id)}
                    className="flex items-center gap-1.5 text-xs border border-destructive/30 text-destructive px-3 py-1.5 rounded-md hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              )}
            </div>

            {/* Members */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-foreground">Agents</h3>
                {isDev && (
                  <PersonaSelector
                    personas={personas}
                    existingIds={(selected.members || []).map(m => m.persona_id)}
                    onSelect={(pId) => addMember(selected.id, pId)}
                  />
                )}
              </div>

              {(selected.members || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No agents in this team</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(selected.members || []).map(member => (
                    <MemberCard
                      key={member.id}
                      member={member}
                      isDev={isDev}
                      onRemove={() => removeMember(selected.id, member.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Flows */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-foreground">Linked Flows</h3>
                {isDev && (
                  <FlowSelector
                    flows={flows}
                    existingIds={(selected.flows || []).map(f => f.id)}
                    onSelect={(fId) => addFlow(selected.id, fId)}
                  />
                )}
              </div>
              {(selected.flows || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No flows linked</p>
              ) : (
                <div className="space-y-2">
                  {(selected.flows || []).map(flow => (
                    <div key={flow.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50">
                      <div>
                        <p className="text-sm font-medium">{flow.name}</p>
                        {flow.description && <p className="text-xs text-muted-foreground">{flow.description}</p>}
                      </div>
                      {isDev && (
                        <button onClick={() => removeFlow(selected.id, flow.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="Select a team"
            description="Click a team on the left to view details"
          />
        )}
      </div>
    </div>
  )
}

// ── Member Card ───────────────────────────────────────────────────────────

function MemberCard({ member, isDev, onRemove }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
      <HabboFigure figure={null} size="sm" animate={true} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
        {member.bot_name && (
          <p className="text-xs text-muted-foreground">Bot: {member.bot_name}</p>
        )}
        {member.role && (
          <span className="inline-block mt-1 text-xs bg-accent/10 text-accent-foreground px-2 py-0.5 rounded-full">
            {member.role}
          </span>
        )}
      </div>
      {isDev && (
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

// ── Team Editor ───────────────────────────────────────────────────────────

function TeamEditor({ team, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: team?.name || '',
    description: team?.description || '',
    orchestrator_prompt: team?.orchestrator_prompt || DEFAULT_ORCHESTRATOR_PROMPT,
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-5 h-5" />
        </button>
        <h2 className="font-semibold text-lg">{team ? 'Edit Team' : 'New Team'}</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Team Name</label>
          <input
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="e.g. Sprint Team, Marketing Crew"
            required
            value={form.name}
            onChange={e => setForm(f => ({...f, name: e.target.value}))}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Description</label>
          <input
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="What does this team do?"
            value={form.description}
            onChange={e => setForm(f => ({...f, description: e.target.value}))}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Orchestrator Prompt</label>
          <p className="text-xs text-muted-foreground">
            Use {`{{ROOM_ID}}`}, {`{{TRIGGERED_BY}}`}, and {`{{PERSONA_NAME_PERSONA}}`} as placeholders
          </p>
          <textarea
            className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            value={form.orchestrator_prompt}
            onChange={e => setForm(f => ({...f, orchestrator_prompt: e.target.value}))}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-9 rounded-md border border-input text-sm hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {team ? 'Update Team' : 'Create Team'}
          </button>
        </div>
      </form>
    </div>
  )
}

const DEFAULT_ORCHESTRATOR_PROMPT = `You are the orchestrator for a Habbo Hotel agent team.
Target room: {{ROOM_ID}}
Triggered by: {{TRIGGERED_BY}}

Use the Agent tool to launch all agents CONCURRENTLY in a single message.

{{PERSONAS}}

Launch all agents simultaneously now.`

// ── Personas View ─────────────────────────────────────────────────────────

function PersonasView() {
  const [personas, setPersonas] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [figureTypes, setFigureTypes] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pd, fd] = await Promise.all([
        api('/api/agents/personas'),
        api('/api/figure-types').catch(() => ({ figureTypes: [] }))
      ])
      setPersonas(pd.personas || [])
      setFigureTypes(fd.figureTypes || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function deletePersona(id) {
    if (!confirm('Delete this persona?')) return
    await api(`/api/agents/personas/${id}`, { method: 'DELETE' })
    load()
  }

  if (loading) return <LoadingState />

  if (editing !== null) {
    return (
      <PersonaEditor
        persona={editing === 'new' ? null : editing}
        figureTypes={figureTypes}
        onSave={async (data) => {
          const method = editing === 'new' ? 'POST' : 'PUT'
          const url = editing === 'new' ? '/api/agents/personas' : `/api/agents/personas/${editing.id}`
          await api(url, { method, body: JSON.stringify(data) })
          setEditing(null)
          load()
        }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Agent Personas</h2>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3 h-3" /> New Persona
        </button>
      </div>

      {personas.length === 0 ? (
        <EmptyState icon={Bot} title="No personas yet" description="Create your first agent persona" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {personas.map(persona => (
            <div key={persona.id} className="p-4 rounded-xl border border-border bg-card space-y-3">
              <div className="flex items-start gap-3">
                <HabboFigure figure={null} size="sm" animate={true} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{persona.name}</p>
                  {persona.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{persona.description}</p>
                  )}
                  {persona.bot_name && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="text-cyan-400">Bot:</span> {persona.bot_name}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(persona)}
                  className="flex-1 flex items-center justify-center gap-1.5 h-7 text-xs border border-border rounded-md hover:bg-secondary transition-colors"
                >
                  <Edit className="w-3 h-3" /> Edit
                </button>
                <button
                  onClick={() => deletePersona(persona.id)}
                  className="flex items-center justify-center h-7 w-7 border border-destructive/30 text-destructive rounded-md hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Persona Editor ────────────────────────────────────────────────────────

function PersonaEditor({ persona, figureTypes, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: persona?.name || '',
    description: persona?.description || '',
    prompt: persona?.prompt || '',
    figure_type: persona?.figure_type || 'agent-m',
    bot_name: persona?.bot_name || '',
  })
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
        <h2 className="font-semibold text-lg">{persona ? 'Edit Persona' : 'New Persona'}</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <input
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="e.g. Tom, Sander"
              required
              value={form.name}
              onChange={e => setForm(f => ({...f, name: e.target.value}))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Hotel Bot Name</label>
            <input
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Name of bot in hotel"
              value={form.bot_name}
              onChange={e => setForm(f => ({...f, bot_name: e.target.value}))}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Description</label>
          <input
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Short description of this agent"
            value={form.description}
            onChange={e => setForm(f => ({...f, description: e.target.value}))}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Figure Type</label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={form.figure_type}
            onChange={e => setForm(f => ({...f, figure_type: e.target.value}))}
          >
            {(figureTypes.length ? figureTypes : DEFAULT_FIGURE_TYPES).map(ft => (
              <option key={ft.type || ft} value={ft.type || ft}>{ft.type || ft}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Persona Prompt</label>
            <button
              type="button"
              onClick={() => setPreview(p => !p)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>
          {preview ? (
            <pre className="min-h-[200px] w-full rounded-md border border-border bg-muted p-3 text-xs font-mono overflow-auto whitespace-pre-wrap">
              {form.prompt || '(empty)'}
            </pre>
          ) : (
            <textarea
              className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Describe the agent's personality, goals, and behavior..."
              value={form.prompt}
              onChange={e => setForm(f => ({...f, prompt: e.target.value}))}
            />
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onCancel}
            className="flex-1 h-9 rounded-md border border-input text-sm hover:bg-secondary transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {persona ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}

const DEFAULT_FIGURE_TYPES = ['agent-m', 'agent-f', 'citizen-m', 'citizen-f', 'bouncer', 'employee-m', 'employee-f']

// ── Flows View ────────────────────────────────────────────────────────────

function FlowsView() {
  const [flows, setFlows] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api('/api/agents/flows')
      setFlows(d.flows || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingState />

  if (editing !== null) {
    return (
      <FlowEditor
        flow={editing === 'new' ? null : editing}
        onSave={async (data) => {
          const method = editing === 'new' ? 'POST' : 'PUT'
          const url = editing === 'new' ? '/api/agents/flows' : `/api/agents/flows/${editing.id}`
          await api(url, { method, body: JSON.stringify(data) })
          setEditing(null)
          load()
        }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Flows</h2>
        <button onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90">
          <Plus className="w-3 h-3" /> New Flow
        </button>
      </div>

      {flows.length === 0 ? (
        <EmptyState icon={Zap} title="No flows yet" description="Create task flows to assign to teams" />
      ) : (
        <div className="space-y-3">
          {flows.map(flow => {
            const tasks = safeJson(flow.tasks_json, [])
            return (
              <div key={flow.id} className="p-4 rounded-xl border border-border bg-card">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{flow.name}</p>
                    {flow.description && <p className="text-xs text-muted-foreground mt-0.5">{flow.description}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{tasks.length} tasks</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(flow)}
                      className="h-7 px-3 text-xs border border-border rounded-md hover:bg-secondary transition-colors">
                      Edit
                    </button>
                    <button onClick={async () => {
                      if (!confirm('Delete flow?')) return
                      await api(`/api/agents/flows/${flow.id}`, { method: 'DELETE' })
                      load()
                    }}
                      className="h-7 w-7 flex items-center justify-center border border-destructive/30 text-destructive rounded-md hover:bg-destructive/10">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Flow Editor ───────────────────────────────────────────────────────────

function FlowEditor({ flow, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: flow?.name || '',
    description: flow?.description || '',
    tasks_json: safeJson(flow?.tasks_json, []),
  })
  const [saving, setSaving] = useState(false)

  function addTask() {
    setForm(f => ({ ...f, tasks_json: [...f.tasks_json, { id: Date.now(), title: '', description: '' }] }))
  }

  function updateTask(index, updates) {
    setForm(f => {
      const tasks = [...f.tasks_json]
      tasks[index] = { ...tasks[index], ...updates }
      return { ...f, tasks_json: tasks }
    })
  }

  function removeTask(index) {
    setForm(f => ({ ...f, tasks_json: f.tasks_json.filter((_, i) => i !== index) }))
  }

  function moveTask(index, dir) {
    setForm(f => {
      const tasks = [...f.tasks_json]
      const newIndex = index + dir
      if (newIndex < 0 || newIndex >= tasks.length) return f;
      [tasks[index], tasks[newIndex]] = [tasks[newIndex], tasks[index]]
      return { ...f, tasks_json: tasks }
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        <h2 className="font-semibold text-lg">{flow ? 'Edit Flow' : 'New Flow'}</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Flow Name</label>
            <input className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="e.g. Sprint Review, Marketing Analyse"
              required value={form.name}
              onChange={e => setForm(f => ({...f, name: e.target.value}))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <input className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="What is this flow for?"
              value={form.description}
              onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          </div>
        </div>

        {/* Tasks */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Tasks</label>
            <button type="button" onClick={addTask}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
              <Plus className="w-3 h-3" /> Add task
            </button>
          </div>

          {form.tasks_json.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-border rounded-lg">
              <p className="text-xs text-muted-foreground">No tasks yet. Add your first task.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {form.tasks_json.map((task, i) => (
                <div key={task.id || i} className="flex gap-2 p-3 rounded-lg border border-border bg-card/50">
                  <div className="flex flex-col gap-1">
                    <button type="button" onClick={() => moveTask(i, -1)} disabled={i === 0}
                      className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <span className="text-xs text-muted-foreground text-center">{i+1}</span>
                    <button type="button" onClick={() => moveTask(i, 1)} disabled={i === form.tasks_json.length - 1}
                      className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex-1 space-y-2">
                    <input className="flex h-7 w-full rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="Task title"
                      value={task.title}
                      onChange={e => updateTask(i, { title: e.target.value })} />
                    <textarea className="flex min-h-[50px] w-full rounded border border-input bg-transparent px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="Description (optional)"
                      value={task.description}
                      onChange={e => updateTask(i, { description: e.target.value })} />
                  </div>
                  <button type="button" onClick={() => removeTask(i)}
                    className="text-muted-foreground hover:text-destructive self-start mt-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onCancel}
            className="flex-1 h-9 rounded-md border border-input text-sm hover:bg-secondary transition-colors">Cancel</button>
          <button type="submit" disabled={saving}
            className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {flow ? 'Update Flow' : 'Create Flow'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Control View ──────────────────────────────────────────────────────────

function ControlView({ isDev }) {
  const [teams, setTeams] = useState([])
  const [flows, setFlows] = useState([])
  const [bots, setBots] = useState([])
  const [status, setStatus] = useState(null)
  const [form, setForm] = useState({ team_id: '', flow_id: '', room_id: '202' })
  const [triggering, setTriggering] = useState(false)
  const [msg, setMsg] = useState(null)

  const loadStatus = useCallback(async () => {
    try {
      const d = await api('/api/agents/status')
      setStatus(d.trigger)
      setBots(d.bots || [])
    } catch(e) {}
  }, [])

  useEffect(() => {
    api('/api/agents/teams').then(d => setTeams(d.teams || [])).catch(() => {})
    api('/api/agents/flows').then(d => setFlows(d.flows || [])).catch(() => {})
    loadStatus()
    const id = setInterval(loadStatus, 5000)
    return () => clearInterval(id)
  }, [loadStatus])

  async function handleTrigger(e) {
    e.preventDefault()
    setTriggering(true)
    setMsg(null)
    try {
      await api(`/api/agents/teams/${form.team_id}/trigger`, {
        method: 'POST',
        body: JSON.stringify({ flow_id: form.flow_id || null, room_id: Number(form.room_id) })
      })
      setMsg({ type: 'success', text: 'Team launched! Check the hotel.' })
      loadStatus()
    } catch(err) {
      setMsg({ type: 'error', text: err.message })
    } finally { setTriggering(false) }
  }

  async function handleStop() {
    try {
      await api('/api/agents/stop', { method: 'POST' })
      setMsg({ type: 'success', text: 'Stop signal sent.' })
      setTimeout(loadStatus, 1000)
    } catch(err) {
      setMsg({ type: 'error', text: err.message })
    }
  }

  const isActive = status?.activeTeam != null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Trigger panel */}
      <div className="space-y-4">
        <h2 className="font-semibold">Launch Team</h2>

        {/* Status indicator */}
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${isActive ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-card'}`}>
          <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
          <div>
            <p className="text-sm font-medium">
              {isActive ? `Team active in room ${status.activeTeam.roomId}` : 'No active team'}
            </p>
            {isActive && (
              <p className="text-xs text-muted-foreground">
                Started by {status.activeTeam.from}
              </p>
            )}
          </div>
          {isActive && (
            <button onClick={handleStop}
              className="ml-auto flex items-center gap-1.5 h-7 px-3 text-xs bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90">
              <Square className="w-3 h-3" /> Stop
            </button>
          )}
        </div>

        {msg && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${msg.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
            {msg.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {msg.text}
          </div>
        )}

        <form onSubmit={handleTrigger} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Team</label>
            <select required value={form.team_id}
              onChange={e => setForm(f => ({...f, team_id: e.target.value}))}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">Select a team...</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Flow <span className="text-muted-foreground">(optional)</span></label>
            <select value={form.flow_id}
              onChange={e => setForm(f => ({...f, flow_id: e.target.value}))}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">No specific flow</option>
              {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Room ID</label>
            <input className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              type="number" value={form.room_id}
              onChange={e => setForm(f => ({...f, room_id: e.target.value}))} />
          </div>

          <button type="submit" disabled={triggering || isActive}
            className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
            {triggering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {triggering ? 'Launching...' : 'Launch Team'}
          </button>
        </form>
      </div>

      {/* Live bots */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Hotel Bots</h2>
          <button onClick={loadStatus} className="text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {bots.length === 0 ? (
          <EmptyState icon={Bot} title="No bots active" description="Bots will appear here when deployed" />
        ) : (
          <div className="space-y-2">
            {bots.map(bot => (
              <div key={bot.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
                <HabboFigure figure={bot.figure} size="sm" animate={bot.room_id > 0} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{bot.name}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${bot.room_id > 0 ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground'}`}>
                      {bot.room_id > 0 ? `Room ${bot.room_id}` : 'Offline'}
                    </span>
                  </div>
                  {bot.motto && <p className="text-xs text-muted-foreground truncate">{bot.motto}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helper components ─────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  )
}

function PersonaSelector({ personas, existingIds, onSelect }) {
  const available = personas.filter(p => !existingIds.includes(p.id))
  if (available.length === 0) return null
  return (
    <select onChange={e => { if (e.target.value) { onSelect(Number(e.target.value)); e.target.value = '' }}}
      className="h-7 text-xs rounded border border-input bg-card px-2 focus:outline-none focus:ring-1 focus:ring-ring">
      <option value="">+ Add agent</option>
      {available.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  )
}

function FlowSelector({ flows, existingIds, onSelect }) {
  const available = flows.filter(f => !existingIds.includes(f.id))
  if (available.length === 0) return null
  return (
    <select onChange={e => { if (e.target.value) { onSelect(Number(e.target.value)); e.target.value = '' }}}
      className="h-7 text-xs rounded border border-input bg-card px-2 focus:outline-none focus:ring-1 focus:ring-ring">
      <option value="">+ Link flow</option>
      {available.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
    </select>
  )
}

function safeJson(str, fallback = []) {
  try { return typeof str === 'string' ? JSON.parse(str) : (str || fallback) }
  catch { return fallback }
}
