// Integrated view: the main "My Agents" tab content.
// Wraps team list + team form + persona list + persona editor in one module
// because they share state and helpers (parseTeamTasksJson,
// detectRequiredIntegrations, the INTEGRATION_KEYWORDS map).
//
// Extracted as a single file because IntegratedView / IntegratedTeamCard /
// IntegratedTeamForm / PersonaCard / PersonaEditor have internal coupling:
// IntegratedView renders both team and persona sub-views, IntegratedTeamForm
// uses PersonaEditor inline, and they share the same skill catalog + bot
// list state. Splitting them further would force prop-drilling that hurts
// readability more than file size.
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  AlertCircle, AlertTriangle, Bot, Check, ChevronLeft, Edit, Edit2, ExternalLink,
  FileText, Hotel, LinkIcon, Loader2, Plus, Settings, Sparkles, Trash2,
  Users, Volume2, Workflow, X, Zap,
} from 'lucide-react'
import { api } from '../../utils/api'
import { friendlyFetchError } from '../../utils/fetchError'
import { useToast } from '../../ToastContext'
import { useHotel } from '../../HotelContext'
import { useEscapeKey } from '../../utils/useEscapeKey'
import { useSkillsCatalog } from '../../utils/useSkillsCatalog'
import { parseSkills, parseSkillSlugs } from '../../utils/parseSkills'
import { can } from '../../utils/permissions'
import { HabboFigure } from '../HabboFigure'
import { SkillChip } from '../SkillChip'
import { MarkdownEditor } from '../editor/MarkdownEditor'
import { LoadingState, ErrorBanner, EmptyState } from './states'
import { DeployGoalModal } from './DeployGoalModal'
import { SkillBrowser, SkillDetailModal } from './SkillBrowser'
import { RunReportsSection } from './RunReports'
import { parseTeamTasksJson, detectRequiredIntegrations } from '../../../shared/teams.js'

export function IntegratedView({ me, onAfterTrigger, liveBots = [], mcpTokenVersion = 0, activeSection = 'teams', onSubpageChange }) {
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
  // deployModal: null | { team, roomId }
  const [deployModal, setDeployModal] = useState(null)

  useEscapeKey(() => {
    if (deployModal) { setDeployModal(null); return }
    if (personaPage) { setPersonaPage(null); return }
    if (confirmModal) setConfirmModal(null)
  }, !!(deployModal || personaPage || confirmModal))

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


  async function deployTeam(team, roomId, options = {}) {
    setDeployingIds(prev => new Set([...prev, team.id]))
    try {
      const body = { room_id: roomId }
      if (options.task_mode) body.task_mode = options.task_mode
      if (options.session_goal) body.session_goal = options.session_goal
      await api(`/api/my/teams/${team.id}/trigger`, { method: 'POST', body: JSON.stringify(body) })
      showToast(`Team "${team.name}" deployed!`)
      onAfterTrigger?.()
      setTimeout(() => onAfterTrigger?.(), 2000)
      setTimeout(() => onAfterTrigger?.(), 4000)
      return null // success — no error
    } catch (e) {
      showToast(`Deploy failed: ${e.message}`, 'error')
      onAfterTrigger?.()
      return e.message // return error so modal can display it inline
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
                onDeploy={(roomId) => setDeployModal({ team, roomId })}
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
                personas={personas}
                onEdit={canManagePersonas ? () => setPersonaPage({ persona }) : undefined}
                onDelete={canManagePersonas ? () => deletePersona(persona) : undefined}
                onLinkBot={canLinkBot ? linkPersonaBot : undefined}
              />
            ))}
          </div>
        )}
      </section>}

      {activeSection === 'reports' && <RunReportsSection me={me} />}

      {/* Deploy goal modal */}
      {deployModal && (
        <DeployGoalModal
          team={deployModal.team}
          roomId={deployModal.roomId}
          deploying={deployingIds.has(deployModal.team.id)}
          onClose={() => setDeployModal(null)}
          onConfirm={(options) => deployTeam(deployModal.team, deployModal.roomId, options)}
        />
      )}

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

function IntegratedTeamCard({ team, canManage = false, bots = [], liveBots = [], rooms = [], deploying, hasApiKey = true, hasMcpToken = true, integrations = [], onDeploy, onRoomChange, onEdit, onDelete }) {
  const { habboConnected } = useHotel()
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

  const hasUnlinked = useMemo(() => habboConnected && members !== null && members.some(m => !m.bot_name?.trim()), [habboConnected, members])
  const noKey = !hasApiKey
  const noMcpToken = !hasMcpToken

  // Members whose bot_name is set but no longer exists in the hotel bot list
  const missingBots = useMemo(() => {
    if (!habboConnected || !members || !bots) return []
    return members
      .filter(m => m.bot_name?.trim() && !bots.some(b => b.name?.toLowerCase() === m.bot_name.toLowerCase()))
      .map(m => m.bot_name)
  }, [habboConnected, members, bots])

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
            : noMcpToken ? 'Open Account and use Start building! to create your MCP token'
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
            {team.source_team_id != null && team.marketplace_install_kind && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Forked from {team.source_marketplace_team_name ? `"${team.source_marketplace_team_name}"` : 'marketplace'}
                {' · '}
                {team.marketplace_install_kind === 'full' ? 'full team' : 'single-agent team'}
              </p>
            )}
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

        {/* Footer: room (hotel only) + deploy */}
        <div className="flex items-center gap-2 pt-3 border-t border-border">
          {habboConnected && (
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
          )}
          {!habboConnected && <div className="flex-1" />}
          <button
            onClick={() => onDeploy(selectedRoomId)}
            disabled={deploying || blocked}
            title={
              noKey ? 'Add an Anthropic API key in Settings'
              : noMcpToken ? 'Open Account and use Start building! to create your MCP token'
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

function IntegratedTeamForm({ team, personas, rooms = [], isDev, onSave, onCancel, onViewPersona }) {
  const { habboConnected } = useHotel()
  const [name, setName] = useState(team?.name || '')
  const [description, setDescription] = useState(team?.description || '')
  const [orchestratorPrompt, setOrchestratorPrompt] = useState(team?.orchestrator_prompt || '')
  const [executionMode, setExecutionMode] = useState(team?.execution_mode || 'shared')
  const [language, setLanguage] = useState(team?.language || 'en')
  const [defaultRoomId, setDefaultRoomId] = useState(team?.default_room_id || '')
  const parsedTasks = parseTeamTasksJson(team)
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

            {/* Default room — hotel integration only */}
            {habboConnected && (
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
            )}
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
                  { tag: '{{ROOM_ID}}',       desc: 'Hotel room number (e.g. 201)' },
                  { tag: '{{TRIGGERED_BY}}', desc: 'Who triggered the run (Habbo username)' },
                  { tag: '{{TASKS}}',        desc: 'Rendered task instructions (sequential steps or shared task list JSON)' },
                  { tag: '{{PERSONAS}}',     desc: 'All team members — names, roles, bots & instructions' },
                  { tag: '{{SESSION_GOAL}}', desc: "User's custom goal for this session (portal user-team runs only)" },
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

// ── Persona Card ──────────────────────────────────────────────────────────

function PersonaCard({ persona, bots = [], personas = [], onEdit, onDelete, onLinkBot }) {
  const { habboConnected } = useHotel()
  const { showToast } = useToast()
  const { catalog } = useSkillsCatalog()
  const linkedBot = persona.bot_name
    ? bots.find(b => b.name?.toLowerCase() === persona.bot_name.toLowerCase())
    : null
  const botMissing = !!persona.bot_name && !linkedBot
  const figure = persona.figure || linkedBot?.figure || ''

  // Bot names already claimed by OTHER personas — exclude from the dropdown.
  const takenBotNames = useMemo(() =>
    new Set(
      personas
        .filter(p => p.id !== persona.id && p.bot_name)
        .map(p => p.bot_name.toLowerCase())
    ),
  [personas, persona.id])

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
            <span className={`mt-2 text-[10px] text-center font-medium leading-tight truncate w-full text-center ${botMissing ? 'text-destructive/80' : 'text-info'}`}>
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
              {persona.forked_from_template_name && (
                <p className="text-[10px] text-muted-foreground mt-0.5">Forked from marketplace · {persona.forked_from_template_name}</p>
              )}
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

          {/* Bot link footer — only when hotel integration is active */}
          {habboConnected && <div className="mt-auto pt-2 border-t border-border flex items-center gap-2" onClick={e => e.stopPropagation()}>
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
                  {bots.map(b => {
                    const taken = takenBotNames.has(b.name?.toLowerCase())
                    return (
                      <option key={b.id ?? b.name} value={b.name} disabled={taken}>
                        {b.name}{taken ? ' (linked to another agent)' : ''}
                      </option>
                    )
                  })}
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
                  botMissing ? (
                    <span className="inline-flex items-center gap-1.5 text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-full px-2.5 py-0.5" title="This bot no longer exists — link a new one">
                      <AlertTriangle className="w-3 h-3" /> {persona.bot_name} not found
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs bg-info/10 text-info border border-info/20 rounded-full px-2.5 py-0.5">
                      <Bot className="w-3 h-3" /> {persona.bot_name}
                    </span>
                  )
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
          </div>}
        </div>
      </div>
    </div>

    <SkillDetailModal slug={skillDetail} onClose={() => setSkillDetail(null)} />
    </>
  )
}


// ── Persona Editor ────────────────────────────────────────────────────────

function PersonaEditor({ persona, bots, onSave, onCancel }) {
  const { habboConnected } = useHotel()
  const [name, setName] = useState(persona?.name || '')
  const [role, setRole] = useState(persona?.role || '')
  const [description, setDescription] = useState(persona?.description || '')
  // Skills stored as JSON array of slugs; parse existing value on load
  const [skillSlugs, setSkillSlugs] = useState(() => parseSkillSlugs(persona?.capabilities || ''))
  const [prompt, setPrompt] = useState(persona?.prompt || '')
  const [botName, setBotName] = useState(persona?.bot_name || '')
  const [figure, setFigure] = useState(persona?.figure || '')
  const [elevenVoiceId, setElevenVoiceId] = useState(persona?.elevenlabs_voice_id || '')
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
        elevenlabs_voice_id: elevenVoiceId.trim() || null,
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

          {/* Habbo Hotel section — only shown when hotel integration is active */}
          {habboConnected && (
            <>
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

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Volume2 className="w-3 h-3" /> ElevenLabs Voice ID
                </label>
                <input
                  value={elevenVoiceId}
                  onChange={e => setElevenVoiceId(e.target.value)}
                  placeholder="e.g. EXAVITQu4vr4xnSDxMaL"
                  className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  This agent will speak in this voice in Voice Chat.{' '}
                  <a href="https://elevenlabs.io/app/voice-library" target="_blank" rel="noreferrer" className="text-primary hover:underline">Browse voices →</a>
                </p>
              </div>
            </>
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
