import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Bot, Edit, Loader2, RefreshCw, Trash2, X } from 'lucide-react'
import { api } from '../utils/api'
import { useEscapeKey } from '../utils/useEscapeKey'
import { HabboFigure } from '../components/HabboFigure'

export function BotsTab({ figureTypes }) {
  const [bots, setBots] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [lastSynced, setLastSynced] = useState(null)
  const [editingBotId, setEditingBotId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [botBusy, setBotBusy] = useState({})
  const [botMsg, setBotMsg] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(null)
  useEscapeKey(() => { if (confirmDelete) { setConfirmDelete(null) } else { cancelEditBot() } }, !!(editingBotId || confirmDelete))
  const [botsMeta, setBotsMeta] = useState(null)

  const fetchBots = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setLoading(true)
    try {
      const d = await api('/api/hotel/bots')
      setBots(d.bots || [])
      setBotsMeta(d.meta || null)
    } catch {
      setBots([])
      setBotsMeta(null)
    }
    finally { if (showLoading) setLoading(false) }
  }, [])

  // Silent sync: keeps the list in sync with the hotel without touching the
  // Sync button UI state. Runs on mount and every 10 s while the page is open.
  const silentSync = useCallback(async ({ showLoading = false } = {}) => {
    try { await api('/api/hotel/bots/sync', { method: 'POST' }) } catch { /* ignore */ }
    await fetchBots({ showLoading })
    setLastSynced(new Date())
  }, [fetchBots])

  useEffect(() => {
    silentSync({ showLoading: true })
    const t = setInterval(silentSync, 10_000)
    return () => clearInterval(t)
  }, [silentSync])

  function startEditBot(bot) {
    setEditingBotId(bot.id)
    const figureType = Object.entries(figureTypes).find(([, v]) => v.figure === bot.figure)?.[0]
      || (bot.gender === 'F' ? 'default-f' : 'default-m')
    setEditForm({ name: bot.name, persona: bot.persona, motto: bot.motto || '', figureType, figure: bot.figure, gender: bot.gender })
  }

  function cancelEditBot() {
    setEditingBotId(null)
    setEditForm({})
  }

  function setBotMessage(botId, text, type = 'ok', ttl = 5000) {
    setBotMsg(prev => ({ ...prev, [botId]: { text, type } }))
    if (ttl) setTimeout(() => setBotMsg(prev => ({ ...prev, [botId]: null })), ttl)
  }

  async function saveBot(botId) {
    setBotBusy(prev => ({ ...prev, [botId]: true }))
    try {
      const d = await api(`/api/hotel/bots/${botId}`, { method: 'PUT', body: JSON.stringify(editForm) })
      setBots(prev => prev.map(b => b.id === botId ? { ...b, ...editForm } : b))
      setEditingBotId(null)
      const parts = ['Saved!']
      if (d.visualChanged) {
        if (d.liveUpdated) {
          parts.push('Applied live in hotel.')
        } else {
          parts.push(`Figure/name will update when the bot next enters the room — ${d.liveUpdateError || 'bot not active'}.`)
        }
      }
      if (d.personaUpdated) parts.push('Persona updated.')
      setBotMessage(botId, parts.join(' '), d.visualChanged && !d.liveUpdated ? 'warn' : 'ok', 7000)
    } catch (err) {
      setBotMessage(botId, err.message || 'Save failed.', 'err')
    }
    setBotBusy(prev => ({ ...prev, [botId]: false }))
  }

  async function deleteBot(botId) {
    if (confirmDelete !== botId) { setConfirmDelete(botId); return }
    setConfirmDelete(null)
    setBotBusy(prev => ({ ...prev, [botId]: true }))
    try {
      await api(`/api/hotel/bots/${botId}`, { method: 'DELETE' })
      setBots(prev => prev.filter(b => b.id !== botId))
    } catch (err) {
      setBotMessage(botId, err.message || 'Delete failed.', 'err')
      setBotBusy(prev => ({ ...prev, [botId]: false }))
    }
  }

  async function syncBots() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const d = await api('/api/hotel/bots/sync', { method: 'POST' })
      const parts = []
      if (d.removed > 0) parts.push(`Removed ${d.removed} stale entr${d.removed !== 1 ? 'ies' : 'y'}`)
      if (d.imported > 0) parts.push(`imported ${d.imported} bot${d.imported !== 1 ? 's' : ''}`)
      if (d.updated > 0) parts.push(`refreshed ${d.updated} appearance${d.updated !== 1 ? 's' : ''}`)
      setSyncMsg(
        parts.length > 0
          ? `${parts.join(' · ')}.`
          : `Up to date (${d.totalOwned ?? 0} in your hotel inventory).`
      )
      await fetchBots()
    } catch (err) {
      setSyncMsg(err.message || 'Sync failed.')
    }
    setSyncing(false)
    setTimeout(() => setSyncMsg(null), 4000)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-foreground">My Bots</h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-lg">
            These are your <span className="text-foreground">Habbo hotel bots</span> — physical avatars that walk around rooms in the hotel.
            Editing a bot updates it <span className="text-foreground">live in the hotel</span> (name, motto &amp; appearance change instantly).
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="flex items-center gap-2">
            {syncMsg && <span className="text-xs text-muted-foreground">{syncMsg}</span>}
            <button onClick={syncBots} disabled={syncing}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-secondary transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync bots'}
            </button>
          </div>
          {lastSynced && (
            <span className="text-[10px] text-muted-foreground/50">
              synced {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {botsMeta?.rcon && !botsMeta.rcon.verified && botsMeta.rcon.roomsRequested > 0 && (
        <div className="text-xs rounded-lg border border-warning/30 bg-warning/10 text-warning/90 px-3 py-2 space-y-1">
          <p className="font-medium">Live bot status is not verified against the emulator</p>
          <p className="opacity-90">
            RCON to <code className="text-[10px]">{botsMeta.rcon.host}:{botsMeta.rcon.port}</code> failed or the
            <code className="text-[10px]"> roomlivebots</code> command is missing — the portal falls back to MySQL/MCP only (same as before).
            Rebuild the <code className="text-[10px]">arcturus</code> image so RCON includes <code className="text-[10px]">RoomLiveBots</code>, set <code className="text-[10px]">HABBO_RCON_ALLOWED</code> for Docker networks, restart <code className="text-[10px]">agent-portal</code>, hard-refresh the browser.
          </p>
          {botsMeta.rcon.lastError && (
            <p className="text-[10px] opacity-80 font-mono break-all">Last error: {botsMeta.rcon.lastError}</p>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : bots.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <Bot className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No bots imported yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Use <span className="font-medium text-foreground">Sync bots</span> to import bots from your hotel inventory.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {bots.map(bot => {
            const isBusy = !!botBusy[bot.id]
            const msg = botMsg[bot.id]
            const ghost = !!bot.ghost_stale_db
            const live = !ghost && Number(bot.live_room_id) > 0
            const placed = !ghost && Number(bot.db_room_id) > 0
            let statusBadgeClass = 'bg-muted text-muted-foreground border border-border'
            let statusLabel = 'In inventory'
            if (ghost) {
              statusBadgeClass = 'bg-destructive/10 text-destructive border border-destructive/20'
              statusLabel = `Stale DB · room ${bot.stale_db_room_id || '?'}`
            } else if (live) {
              statusBadgeClass = 'bg-success/10 text-success border border-success/20'
              statusLabel = `Live · ${bot.live_room_name || `#${bot.live_room_id}`}`
            } else if (placed) {
              statusBadgeClass = 'bg-warning/10 text-warning border border-warning/20'
              statusLabel = `Placed · ${bot.db_room_name || `#${bot.db_room_id}`}`
            }
            return (
              <div key={bot.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                {/* Bot card header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card/50">
                  <span className="font-medium text-sm text-foreground flex-1 truncate">{bot.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full max-w-[min(200px,46vw)] truncate ${statusBadgeClass}`} title={statusLabel}>
                    {statusLabel}
                  </span>
                  <button onClick={() => startEditBot(bot)} disabled={isBusy}
                    className="h-7 px-2 text-xs border border-border rounded-md hover:bg-secondary transition-colors disabled:opacity-50 flex items-center gap-1">
                    <Edit className="w-3 h-3" />
                  </button>
                  <button onClick={() => confirmDelete === bot.id ? deleteBot(bot.id) : setConfirmDelete(bot.id)}
                    onBlur={() => setConfirmDelete(null)}
                    disabled={isBusy}
                    className={`h-7 px-2 text-xs border rounded-md transition-colors disabled:opacity-50 flex items-center gap-1 ${confirmDelete === bot.id ? 'border-destructive bg-destructive text-white' : 'border-destructive/30 text-destructive hover:bg-destructive/10'}`}>
                    {confirmDelete === bot.id ? 'Sure?' : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>

                {/* Bot card body */}
                <div className="flex items-center gap-4 px-4 py-4">
                  {bot.figure && (
                    <HabboFigure figure={bot.figure} size="md" animate={true} />
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {ghost ? (
                        <>
                          MySQL still has <span className="text-foreground">room_id = {bot.stale_db_room_id}</span> for this bot, but the emulator is not running it in that room (duplicate row, unload race, or old data).
                          <span className="block mt-0.5 opacity-90">Delete this portal entry or remove the extra <code className="text-[10px]">bots</code> row — only the live row should remain.</span>
                        </>
                      ) : live ? (
                        <>Currently in (loaded room): <span className="text-foreground">{bot.live_room_name || `#${bot.live_room_id}`}</span></>
                      ) : placed ? (
                        <>In hotel DB, placed in: <span className="text-foreground">{bot.db_room_name || `#${bot.db_room_id}`}</span>
                          <span className="block mt-0.5 opacity-80">Room may be unloaded — open it in the hotel to go &quot;Live&quot; here.</span></>
                      ) : Number(bot.config_room_id) > 0 ? (
                        <>Portal spawn target: <span className="text-foreground">{bot.room_name || `#${bot.config_room_id}`}</span>
                          <span className="block mt-0.5 opacity-80">Bot is still in your inventory (not placed in a room).</span></>
                      ) : (
                        <>In inventory — use <span className="text-foreground">Place in room</span> in the hotel client.</>
                      )}
                    </p>
                    {bot.motto && (
                      <p className="text-xs text-muted-foreground italic truncate">"{bot.motto}"</p>
                    )}
                    {msg && (
                      <p className={`text-xs ${msg.type === 'err' ? 'text-destructive' : msg.type === 'warn' ? 'text-warning' : 'text-success'}`}>
                        {msg.text}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {botsMeta && (
        <p className="text-[10px] text-muted-foreground">
          Build: portal v{botsMeta.portalVersion} · {botsMeta.distMainJs}
          {botsMeta.rcon?.roomsRequested > 0 && (
            <span>
              {' '}
              · RCON {botsMeta.rcon.verified ? 'ok' : 'failed'}{' '}
              ({botsMeta.rcon.roomsOk}/{botsMeta.rcon.roomsRequested} rooms)
            </span>
          )}
        </p>
      )}

      {/* Edit Bot Modal — rendered via portal so fixed positioning is never
          clipped by ancestor transforms, backdrop-filters, or stacking contexts */}
      {editingBotId !== null && (() => {
        const isBusy = !!botBusy[editingBotId]
        return createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
            onClick={cancelEditBot}>
            <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold">Edit Bot</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Changes to name, motto &amp; appearance apply <span className="text-foreground font-medium">live in the hotel</span> immediately after saving.
                  </p>
                </div>
                <button onClick={cancelEditBot} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors ml-4 flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-5">
                {editForm.figure && (
                  <div className="flex flex-col items-center gap-2 flex-shrink-0">
                    <HabboFigure figure={editForm.figure} size="md" animate={true} />
                    <span className="text-xs text-muted-foreground">{editForm.name}</span>
                  </div>
                )}
                <div className="flex-1 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Name</label>
                    <input maxLength={25} value={editForm.name}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Motto (shown in hotel)</label>
                    <input maxLength={100} value={editForm.motto}
                      onChange={e => setEditForm(f => ({ ...f, motto: e.target.value }))}
                      placeholder="e.g. Here to help!"
                      className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Persona</label>
                    <textarea rows={4} value={editForm.persona}
                      onChange={e => setEditForm(f => ({ ...f, persona: e.target.value }))}
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-vertical" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Figure type</label>
                    <select value={editForm.figureType}
                      onChange={e => {
                        const ft = figureTypes[e.target.value]
                        setEditForm(f => ({ ...f, figureType: e.target.value, figure: ft?.figure ?? f.figure, gender: ft?.gender ?? f.gender }))
                      }}
                      className="flex h-8 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                      {Object.entries(figureTypes).map(([t, v]) => (
                        <option key={t} value={t}>{t} ({v.gender})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4 justify-end">
                <button onClick={cancelEditBot} disabled={isBusy} type="button"
                  className="h-9 px-4 rounded-md border border-border text-sm hover:bg-secondary transition-colors">
                  Cancel
                </button>
                <button onClick={() => saveBot(editingBotId)} disabled={isBusy} type="button"
                  className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                  {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isBusy ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      })()}
    </div>
  )
}
