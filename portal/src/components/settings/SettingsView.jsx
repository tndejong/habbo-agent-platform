import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertCircle, Check, CreditCard, Eye, EyeOff, Hotel, Loader2, Network,
  Phone, Plug, Shield, Trash2, User,
} from 'lucide-react'
import { api } from '../../utils/api'
import { HabboFigure } from '../HabboFigure'
import { IntegrationsManager } from './IntegrationsManager'
import { McpSettingsView } from './McpSettingsView'
import { TiersSection } from '../../tabs/TiersTab'

const SETTINGS_TABS = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'hotel', label: 'Hotel', icon: Hotel },
  { id: 'plan', label: 'Plan', icon: CreditCard },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'mcp', label: 'MCP', icon: Network },
]

const VALID_TABS = SETTINGS_TABS.map(t => t.id)

function resolveSettingsTab(urlTab) {
  if (urlTab === 'auth') return 'integrations'
  return VALID_TABS.includes(urlTab) ? urlTab : 'account'
}

export function SettingsView({ me, onKeyUpdated }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlTab = searchParams.get('subtab')
  const [settingsTab, setSettingsTab] = useState(() => resolveSettingsTab(urlTab))

  const [keys, setKeys] = useState([])
  const [keysLoading, setKeysLoading] = useState(true)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  const [phone, setPhone] = useState(null)
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneSaving, setPhoneSaving] = useState(false)
  const [phoneDeleting, setPhoneDeleting] = useState(false)
  const [phoneMsg, setPhoneMsg] = useState(null)

  const [defaultTeamState, setDefaultTeamState] = useState({ loading: true, teamId: null, teams: [] })
  const [defaultTeamSaving, setDefaultTeamSaving] = useState(false)

  const [hotelEnabled, setHotelEnabled] = useState(me?.habboConnected ?? false)
  const [hotelToggling, setHotelToggling] = useState(false)
  const [joinBusy, setJoinBusy] = useState(false)
  const [joinErr, setJoinErr] = useState(null)

  const handleTabChange = (newTab) => {
    setSettingsTab(newTab)
    const newParams = new URLSearchParams(searchParams)
    newParams.set('subtab', newTab)
    setSearchParams(newParams)
  }

  useEffect(() => {
    const resolved = resolveSettingsTab(urlTab)
    if (resolved !== settingsTab) setSettingsTab(resolved)
    if (urlTab === 'auth') {
      const newParams = new URLSearchParams(searchParams)
      newParams.set('subtab', 'integrations')
      setSearchParams(newParams, { replace: true })
    }
  }, [urlTab])

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

  const loadKeys = useCallback(async () => {
    setKeysLoading(true)
    try {
      const data = await api('/api/account/api-keys')
      setKeys(data.keys || [])
    } catch {
      // non-blocking
    } finally {
      setKeysLoading(false)
    }
  }, [])

  useEffect(() => { loadKeys() }, [loadKeys])

  const handleKeysChanged = useCallback(async () => {
    await loadKeys()
    onKeyUpdated?.()
  }, [loadKeys, onKeyUpdated])

  async function handleDefaultTeamChange(teamIdVal) {
    setDefaultTeamSaving(true)
    try {
      const d = await api('/api/account/default-team', {
        method: 'PATCH',
        body: { default_user_team_id: teamIdVal },
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
      const d = await api('/api/account/phone', { method: 'POST', body: { phone_number: phoneInput.trim() } })
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

  async function joinHotel() {
    setJoinErr(null)
    setJoinBusy(true)
    try {
      const data = await api('/api/hotel/join', { method: 'POST' })
      window.open(data.login_url, '_blank')
    } catch (e) {
      setJoinErr(e.message || 'Could not join hotel.')
    } finally {
      setJoinBusy(false)
    }
  }

  async function handleHotelToggle() {
    setHotelToggling(true)
    try {
      await api('/api/my/hotel-enabled', {
        method: 'PATCH',
        body: { hotel_enabled: !hotelEnabled },
      })
      setHotelEnabled(v => !v)
      onKeyUpdated?.()
    } catch (e) {
      setPhoneMsg({ type: 'error', text: e.message || 'Could not update hotel setting.' })
    } finally {
      setHotelToggling(false)
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
        body: { current_password: currentPassword, new_password: newPassword },
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

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

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

      {/* Account */}
      {settingsTab === 'account' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
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
                    When you text or call in, this team&apos;s config is used first.
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

        </div>
      )}

      {/* Hotel */}
      {settingsTab === 'hotel' && (
        <div className="space-y-6">
          <section className="space-y-3 max-w-2xl">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                <Hotel className="w-3.5 h-3.5" />
              </span>
              Hotel
            </h2>
            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">Hotel visualisation</p>
                  <p className="text-xs text-muted-foreground">Give your agents Habbo avatars and let them operate in virtual hotel rooms.</p>
                </div>
                <button
                  role="switch"
                  aria-checked={hotelEnabled}
                  onClick={handleHotelToggle}
                  disabled={hotelToggling}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed ${
                    hotelEnabled ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                    hotelEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {hotelEnabled && (
                <div className="border-t border-border pt-4 space-y-2">
                  <button
                    onClick={joinHotel}
                    disabled={joinBusy}
                    className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-border rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
                  >
                    {joinBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Hotel className="w-3 h-3" />}
                    Join Hotel
                  </button>
                  {joinErr && (
                    <p className="text-xs text-destructive flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      {joinErr}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Security */}
      {settingsTab === 'security' && (
        <div className="space-y-6">
          <section className="space-y-3 max-w-lg">
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
                    <button type="button" onClick={() => setShowCurrentPw(v => !v)} aria-label={showCurrentPw ? 'Hide password' : 'Show password'}
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
                    <button type="button" onClick={() => setShowNewPw(v => !v)} aria-label={showNewPw ? 'Hide new password' : 'Show new password'}
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
      )}

      {/* Plan & Billing */}
      {settingsTab === 'plan' && (
        <TiersSection me={me} />
      )}

      {/* API provider keys */}
      {settingsTab === 'integrations' && (
        <IntegrationsManager keys={keys} loading={keysLoading} onChanged={handleKeysChanged} />
      )}

      {/* MCP integrations */}
      {settingsTab === 'mcp' && (
        <McpSettingsView me={me} onTokenChange={handleKeysChanged} />
      )}

    </div>
  )
}
