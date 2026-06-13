import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Bot, Check, CheckCircle, Edit, ExternalLink, Hotel, LayoutGrid,
  Loader2, Lock, Network, Plus, Search, Sparkles, Terminal, Trash2,
  Wifi, WifiOff, Wrench, X,
} from 'lucide-react'
import { api } from '../utils/api'
import { useToast } from '../ToastContext'
import { useHotel } from '../HotelContext'
import { useEscapeKey } from '../utils/useEscapeKey'
import { BotsTab } from './BotsTab'

const FALLBACK_FIGURE_TYPES = {
  'default-m':  { gender: 'M', figure: 'hd-180-1.ch-210-66.lg-270-110.sh-300-91' },
  'citizen-m':  { gender: 'M', figure: 'hd-180-1.ch-210-66.lg-270-110.sh-300-91.ha-1012-110.hr-828-61' },
  'agent-m':    { gender: 'M', figure: 'hd-3095-12.ch-255-64.lg-3235-96.sh-295-91.ha-3426-110.hr-3531-61.he-1601-0.ea-3169-0.fa-1211-1408.cp-3310-0.cc-3007-0.ca-1809-0.wa-2007-0' },
  'default-f':  { gender: 'F', figure: 'hd-620-1.ch-680-66.lg-715-110.sh-905-91' },
  'citizen-f':  { gender: 'F', figure: 'hd-620-1.ch-680-66.lg-715-110.sh-905-91.ha-1012-110.hr-828-61' },
  'agent-f':    { gender: 'F', figure: 'hd-620-12.ch-3005-64.lg-3006-96.sh-905-91.ha-3426-110.hr-3531-61.he-1601-0.ea-3169-0' },
}

// ── Integrations Tab ──────────────────────────────────────────────────────

// Skill-linked integrations (referenced by requires_integration in SKILL.md files)
const CURATED_INTEGRATIONS = [
  {
    slug: 'atlassian',
    name: 'Atlassian',
    title: 'Atlassian (Jira & Confluence)',
    description: 'Connect Jira for sprint planning, issue tracking, and Confluence knowledge bases.',
    icon: '/integrations/atlassian.svg',
    defaultUrl: 'https://mcp.atlassian.com/v1/mcp',
    headers: [{ name: 'Authorization', description: 'Service account API key (Bearer) — ask your Atlassian admin to create one at admin.atlassian.com. Personal API tokens use Basic auth and are not compatible here.', isRequired: true, isSecret: true }],
    docsUrl: 'https://support.atlassian.com/atlassian-rovo-mcp-server/docs/configuring-authentication-via-api-token/',
  },
  {
    slug: 'notion',
    name: 'Notion',
    title: 'Notion',
    description: 'Read and search pages, databases, and structured content in your Notion workspace. Uses a static integration token — no OAuth required.',
    icon: '/integrations/notion.svg',
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    envFields: [{ key: 'NOTION_TOKEN', description: 'Your internal integration token (starts with ntn_) — create one at notion.so/profile/integrations, then share target pages under the Access tab', isRequired: true, isSecret: true }],
    docsUrl: 'https://developers.notion.com/docs/mcp',
  },
  {
    slug: 'resend',
    name: 'Resend',
    title: 'Resend Email',
    description: 'Send transactional emails, manage contacts, domains and broadcasts via Resend\'s official MCP server. Free tier available.',
    icon: 'https://www.google.com/s2/favicons?domain=resend.com&sz=64',
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'resend-mcp'],
    envFields: [{ key: 'RESEND_API_KEY', description: 'Your Resend API key (starts with re_) — sign up free at resend.com', isRequired: true, isSecret: true }],
    docsUrl: 'https://resend.com/docs/mcp-server',
  },
]

// Popular integrations sourced from the official MCP Registry
const POPULAR_INTEGRATIONS = [
  {
    slug: 'airtable',
    name: 'Airtable',
    description: 'Access and manage your Airtable bases, tables, and records.',
    icon: 'https://www.airtable.com/images/favicon/baymax/apple-touch-icon.png',
    defaultUrl: 'https://waystation.ai/mcp',
    headers: [{ name: 'Authorization', description: 'Bearer token from waystation.ai — first connect your Airtable account at waystation.ai/dashboard (one-time OAuth setup), then copy your WayStation API key.', isRequired: true, isSecret: true }],
    docsUrl: 'https://waystation.ai',
  },
  {
    slug: 'gmail',
    name: 'Gmail',
    description: 'Manage Gmail messages, threads, labels, drafts, and send emails.',
    icon: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico',
    defaultUrl: 'https://server.smithery.ai/@faithk7/gmail-mcp/mcp',
    authType: 'oauth',
    oauthNote: 'Gmail requires Google OAuth to access mailbox data — no static API key path exists. Smithery\'s own bearer token is for their registry, not for Gmail access.',
    headers: [{ name: 'Authorization', description: 'Bearer token from smithery.ai — required for Smithery-hosted servers', isRequired: true, isSecret: true }],
    docsUrl: 'https://smithery.ai',
  },
  {
    slug: 'onedrive',
    name: 'OneDrive',
    description: 'Access OneDrive and SharePoint files via Microsoft\'s official MCP server.',
    icon: 'https://www.google.com/s2/favicons?domain=onedrive.live.com&sz=64',
    defaultUrl: 'https://agent365.svc.cloud.microsoft/agents/tenants/{tenant_id}/servers/mcp_ODSPRemoteServer',
    authType: 'oauth',
    oauthNote: 'Microsoft Entra tokens expire in ~1 hour and cannot be used as a static key. OneDrive MCP requires an OAuth flow with token refresh — not compatible with server-side agent runs.',
    headers: [{ name: 'Authorization', description: 'Replace {tenant_id} in the URL with your Azure tenant ID, then use a Microsoft Entra bearer token', isRequired: true, isSecret: true }],
    docsUrl: 'https://learn.microsoft.com/en-us/onedrive/',
  },
  {
    slug: 'supabase',
    name: 'Supabase',
    description: 'Query and manage your Supabase database, auth, and schemas.',
    icon: 'https://supabase.com/favicon/favicon-32x32.png',
    defaultUrl: 'https://waystation.ai/mcp',
    headers: [{ name: 'Authorization', description: 'Bearer token from waystation.ai — first connect your Supabase project at waystation.ai/dashboard (one-time OAuth setup), then copy your WayStation API key.', isRequired: true, isSecret: true }],
    docsUrl: 'https://supabase.com/docs',
  },
  {
    slug: 'lucid',
    name: 'Lucidchart',
    description: 'Create diagrams, search and share Lucidchart documents from your agents.',
    icon: 'https://corporate-assets.lucid.co/co/cab2c5c2-21ed-4272-8606-4ce6e117da17.png',
    defaultUrl: 'https://mcp.lucid.app/mcp',
    authType: 'oauth',
    oauthNote: 'mcp.lucid.app uses OAuth 2.1 with Dynamic Client Registration — static API keys only work with the self-hosted lucid-mcp-server npm package, not this endpoint.',
    headers: [{ name: 'Authorization', description: 'Bearer token from your Lucid developer settings', isRequired: true, isSecret: true }],
    docsUrl: 'https://developer.lucid.co/',
  },
  {
    slug: 'linear',
    name: 'Linear',
    description: 'Project management and issue tracking via Linear\'s official MCP server.',
    icon: 'https://linear.app/favicon.ico',
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@linear/mcp-server'],
    envFields: [{ key: 'LINEAR_API_KEY', description: 'Your personal API key — linear.app → Settings → API → Personal API keys (starts with lin_api_)', isRequired: true, isSecret: true }],
    docsUrl: 'https://developers.linear.app/docs',
  },
  {
    slug: 'telegram',
    name: 'Telegram',
    description: 'Send messages, manage groups, and post to Telegram channels via a bot. Create a bot with @BotFather to get a static token — no OAuth required.',
    icon: 'https://telegram.org/img/apple-touch-icon.png',
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'telegram-bot-mcp-server'],
    envFields: [{ key: 'TELEGRAM_BOT_API_TOKEN', description: 'Your bot token from @BotFather — message @BotFather on Telegram, send /newbot, and copy the token (format: 123456:ABCdef…)', isRequired: true, isSecret: true }],
    docsUrl: 'https://core.telegram.org/bots',
  },
  {
    slug: 'prince',
    name: 'Prince Cloud',
    description: 'Convert Markdown, HTML, and web pages to high-quality PDF documents.',
    icon: 'https://www.google.com/s2/favicons?domain=prince.cloud&sz=64',
    defaultUrl: 'https://prince.cloud/mcp',
    headers: [{ name: 'Authorization', description: 'Bearer token — get your API key after signing up at prince.cloud', isRequired: true, isSecret: true }],
    docsUrl: 'https://prince.cloud',
  },
  {
    slug: 'crabbitmq',
    name: 'CrabbitMQ',
    description: 'Async message queue for AI agents. Self-provision queues, push/poll messages.',
    icon: '',
    defaultUrl: 'https://crabbitmq.com/mcp',
    headers: [],
    docsUrl: 'https://crabbitmq.com',
  },
  {
    slug: 'mailjunky',
    name: 'MailJunky',
    description: 'Send and manage emails via the MailJunky API using Bearer token auth.',
    icon: 'https://mailjunky.ai/favicon.ico',
    defaultUrl: 'https://mcp.mailjunky.ai/sse',
    headers: [{ name: 'Authorization', description: 'Your MailJunky API key in Bearer format (e.g. Bearer mj_live_xxx) — get one at mailjunky.ai', isRequired: true, isSecret: true }],
    docsUrl: 'https://mailjunky.ai',
  },
  {
    slug: 'trends-mcp',
    name: 'Trends MCP',
    description: 'Live trend data from 12+ sources: Google, YouTube, TikTok, Reddit, Amazon, Wikipedia, news sentiment, and more.',
    icon: 'https://www.google.com/s2/favicons?domain=trendsmcp.com&sz=64',
    defaultUrl: 'https://api.trendsmcp.com/mcp',
    headers: [{ name: 'Authorization', description: 'Your Trends MCP API key — free tier included (100 req/day), get one at trendsmcp.com', isRequired: true, isSecret: true }],
    docsUrl: 'https://trendsmcp.com',
  },
  {
    slug: 'unulu',
    name: 'Unulu',
    description: 'AI-powered link-in-bio site builder. Create, update, and publish sites instantly via MCP — no auth needed.',
    icon: 'https://www.google.com/s2/favicons?domain=unulu.ai&sz=64',
    defaultUrl: 'https://mcp.unulu.ai',
    headers: [],
    docsUrl: 'https://unulu.ai',
  },
  {
    slug: 'slack',
    name: 'Slack',
    description: 'Send messages, manage channels, search conversations, and interact with Slack workspaces.',
    icon: 'https://a.slack-edge.com/80588/marketing/img/meta/favicon-32.png',
    defaultUrl: '',
    headers: [{ name: 'Authorization', description: 'Slack Bot Token (starts with xoxb-) — create a Slack app at api.slack.com and install it to your workspace', isRequired: true, isSecret: true }],
    docsUrl: 'https://api.slack.com/docs/mcp',
  },
  {
    slug: 'agentictotem',
    name: 'AgenticTotem Web Extractor',
    description: 'Send URLs + a JSON schema and get clean structured data back. Pay-per-use via x402/MPP — no API keys required.',
    icon: 'https://www.google.com/s2/favicons?domain=agentictotem.com&sz=64',
    defaultUrl: 'https://agentictotem.com/mcp',
    headers: [],
    docsUrl: 'https://agentictotem.com',
  },
]

const ALL_CURATED = [...CURATED_INTEGRATIONS, ...POPULAR_INTEGRATIONS]

export function IntegrationsTab({ me, hotelStatus, onHotelToggle, figureTypes }) {
  const { showToast } = useToast()
  const { habboConnected } = useHotel()
  const [hotelToggleBusy, setHotelToggleBusy] = useState(false)
  const [myIntegrations, setMyIntegrations] = useState([])
  const [loadingMy, setLoadingMy] = useState(true)
  const [setupTarget, setSetupTarget] = useState(null)
  const [pingStatus, setPingStatus] = useState({})
  const [integrationTools, setIntegrationTools] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [busy, setBusy] = useState(false)

  const [registryServers, setRegistryServers] = useState([])
  const [registryLoading, setRegistryLoading] = useState(false)
  const [registryNextCursor, setRegistryNextCursor] = useState(null)
  const [registryQuery, setRegistryQuery] = useState('')
  const [registryFetched, setRegistryFetched] = useState(false)

  useEscapeKey(() => {
    if (confirmDelete) setConfirmDelete(null)
    else if (setupTarget) setSetupTarget(null)
  }, !!(confirmDelete || setupTarget))

  const loadMy = useCallback(async () => {
    setLoadingMy(true)
    try {
      const data = await api('/api/my/integrations')
      setMyIntegrations(data.integrations || [])
    } catch (err) { showToast(err.message, 'error') }
    finally { setLoadingMy(false) }
  }, [showToast])

  useEffect(() => { loadMy() }, [loadMy])

  async function loadRegistry(cursor = null) {
    setRegistryLoading(true)
    try {
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=60` : '?limit=60'
      const data = await api(`/api/registry/servers${qs}`)
      const servers = (data.servers || []).map(s => s.server ?? s)
      setRegistryServers(prev => cursor ? [...prev, ...servers] : servers)
      setRegistryNextCursor(data.metadata?.nextCursor || null)
      setRegistryFetched(true)
    } catch (err) { showToast('Registry unavailable: ' + err.message, 'error') }
    finally { setRegistryLoading(false) }
  }

  function findCuratedMatch(integration) {
    const n = integration.name.toLowerCase()
    return ALL_CURATED.find(c => n.includes(c.slug) || c.slug.includes(n.split(/\s/)[0])) || null
  }

  function getCuratedStatus(curated) {
    return myIntegrations.find(i => {
      const n = i.name.toLowerCase()
      return n.includes(curated.slug) || curated.slug.includes(n.split(/\s/)[0])
    }) || null
  }

  function openCuratedSetup(curated, existingIntegration = null) {
    setSetupTarget({
      name: existingIntegration?.name ?? curated.name,
      title: curated.title,
      icon: curated.icon,
      defaultUrl: existingIntegration?.url ?? curated.defaultUrl,
      headers: curated.headers,
      docsUrl: curated.docsUrl,
      existingId: existingIntegration?.id ?? null,
      type: curated.type,
      command: curated.command,
      args: curated.args,
      envFields: curated.envFields,
    })
  }

  function openRegistrySetup(server) {
    const remote = server.remotes?.[0]
    const stdioPackage = server.packages?.find(p => p.transport?.type === 'stdio')
    const commonFields = {
      name: server.title || server.name?.split('/').pop() || server.name,
      title: server.title || server.name,
      icon: server.icons?.[0]?.src ?? null,
      docsUrl: server.websiteUrl ?? null,
      existingId: null,
    }

    if (!remote && stdioPackage) {
      const cmd = stdioPackage.runtimeHint
        ?? (stdioPackage.registryType === 'npm' ? 'npx'
          : stdioPackage.registryType === 'pypi' ? 'uvx'
          : null)
      const args = cmd === 'npx'
        ? ['-y', stdioPackage.identifier]
        : stdioPackage.identifier ? [stdioPackage.identifier] : []
      setSetupTarget({
        ...commonFields,
        type: 'stdio',
        command: cmd,
        args,
        envFields: (stdioPackage.environmentVariables ?? []).map(ev => ({
          key: ev.name,
          description: ev.description ?? '',
          isRequired: !!ev.isRequired,
          isSecret: !!ev.isSecret,
        })),
      })
      return
    }

    setSetupTarget({
      ...commonFields,
      defaultUrl: remote?.url ?? '',
      headers: remote?.headers ?? [],
    })
  }

  function openEditSetup(integration) {
    const curated = findCuratedMatch(integration)
    if (curated) { openCuratedSetup(curated, integration); return }
    if (integration.type === 'stdio') {
      setSetupTarget({
        name: integration.name, title: integration.name,
        icon: null, docsUrl: null, existingId: integration.id,
        type: 'stdio',
        command: integration.command ?? null,
        args: integration.args ?? [],
        envFields: [],
      })
      return
    }
    setSetupTarget({
      name: integration.name, title: integration.name,
      icon: null, defaultUrl: integration.url,
      headers: [], docsUrl: null, existingId: integration.id,
    })
  }

  async function pingIntegration(id) {
    setPingStatus(s => ({ ...s, [id]: 'checking' }))
    try {
      const data = await api(`/api/my/integrations/${id}/test`, { method: 'POST' })
      if (data.authenticated) {
        setPingStatus(s => ({ ...s, [id]: 'online' }))
        if (data.tools?.length) setIntegrationTools(s => ({ ...s, [id]: data.tools }))
      } else {
        setPingStatus(s => ({ ...s, [id]: data.online ? 'auth_fail' : 'offline' }))
      }
    } catch { setPingStatus(s => ({ ...s, [id]: 'offline' })) }
  }

  async function handleDelete(id) {
    if (confirmDelete !== id) { setConfirmDelete(id); return }
    setConfirmDelete(null)
    setBusy(true)
    try {
      await api(`/api/my/integrations/${id}`, { method: 'DELETE' })
      setMyIntegrations(prev => prev.filter(i => i.id !== id))
      showToast('Integration removed.')
    } catch (err) { showToast(err.message, 'error') }
    finally { setBusy(false) }
  }

  const deduped = useMemo(() => {
    const q = registryQuery.trim().toLowerCase()
    if (!q) return registryServers
    return registryServers.filter(s => {
      const name = (s.name || '').toLowerCase()
      const title = (s.title || '').toLowerCase()
      const desc = (s.description || '').toLowerCase()
      return name.includes(q) || title.includes(q) || desc.includes(q)
    })
  }, [registryServers, registryQuery])

  async function toggleHotelIntegration() {
    setHotelToggleBusy(true)
    try {
      await api('/api/my/hotel-enabled', { method: 'PATCH', body: JSON.stringify({ hotel_enabled: !habboConnected }) })
      onHotelToggle?.()
    } catch (err) { showToast(err.message, 'error') }
    finally { setHotelToggleBusy(false) }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
      <div>
        <h2 className="font-semibold text-foreground">Integrations</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Connect tools and services. Configured integrations are injected into your agent runs automatically.
        </p>
      </div>

      {/* Habbo Hotel integration card */}
      <section className="space-y-3">
        <IntSectionHeading icon={Hotel} label="Virtual Office" />
        <div className={`bg-card border rounded-xl p-4 transition-colors ${habboConnected ? 'border-primary/20' : 'border-border'}`}>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Hotel className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-foreground">Habbo Hotel</p>
                {habboConnected && (
                  <span className="flex items-center gap-1 text-[10px] text-success font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-success" />
                    {hotelStatus?.loading ? 'Connecting…' : hotelStatus?.socket_online ? 'Online' : 'Offline'}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {habboConnected
                  ? 'Your agents have Habbo avatars and operate in virtual hotel rooms.'
                  : 'Give your agents a physical presence — they get Habbo avatars and live in virtual hotel rooms.'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {habboConnected && hotelStatus?.socket_online && (
                <button
                  onClick={async () => {
                    try {
                      const data = await api('/api/hotel/join', { method: 'POST' })
                      window.open(data.login_url, '_blank')
                    } catch (err) { showToast(err.message, 'error') }
                  }}
                  className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-border rounded-lg hover:bg-secondary transition-colors"
                >
                  <Hotel className="w-3 h-3" />
                  Join Hotel
                </button>
              )}
              <button
                onClick={toggleHotelIntegration}
                disabled={hotelToggleBusy}
                className={`h-8 px-3 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                  habboConnected
                    ? 'border border-border text-muted-foreground hover:bg-secondary'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {hotelToggleBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : habboConnected ? 'Disable' : 'Enable virtual office'}
              </button>
            </div>
          </div>

          {/* Bots section — shown when hotel is connected */}
          {habboConnected && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <BotsTab figureTypes={figureTypes ?? FALLBACK_FIGURE_TYPES} compact />
            </div>
          )}
        </div>
      </section>

      {/* My Configured Integrations */}
      {!loadingMy && myIntegrations.length > 0 && (
        <section className="space-y-3">
          <IntSectionHeading icon={CheckCircle} label="Configured" />
          <div className="space-y-2">
            {myIntegrations.map(integration => {
              const ping = pingStatus[integration.id]
              const tools = integrationTools[integration.id] ?? []
              const curated = findCuratedMatch(integration)
              const isStdioInt = integration.type === 'stdio'
              const borderColor = isStdioInt ? 'border-success/20'
                : ping === 'auth_fail' ? 'border-amber-500/30'
                : ping === 'offline' ? 'border-destructive/20'
                : 'border-success/20'
              return (
                <div key={integration.id} className={`bg-card border rounded-xl p-3 transition-colors ${borderColor}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-secondary flex items-center justify-center overflow-hidden">
                      {curated
                        ? <img src={curated.icon} alt={curated.name} className="w-5 h-5 object-contain" onError={e => { e.currentTarget.style.display = 'none' }} />
                        : <Network className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{integration.name}</p>
                      {isStdioInt
                        ? <p className="text-xs text-muted-foreground">Local process (stdio)</p>
                        : <p className="text-xs text-muted-foreground truncate">{integration.url}</p>}
                    </div>
                    {isStdioInt && (
                      <span className="flex items-center gap-1 text-[10px] text-success font-medium flex-shrink-0">
                        <Terminal className="w-3 h-3" /> Configured
                      </span>
                    )}
                    {!isStdioInt && ping !== 'checking' && ping !== 'auth_fail' && ping !== 'offline' && (
                      <span className="flex items-center gap-1 text-[10px] text-success font-medium flex-shrink-0">
                        <Check className="w-3 h-3" /> {ping === 'online' ? 'Verified' : 'Saved'}
                      </span>
                    )}
                    {!isStdioInt && ping === 'auth_fail' && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-500 font-medium flex-shrink-0">
                        <Lock className="w-3 h-3" /> Auth failed
                      </span>
                    )}
                    {!isStdioInt && ping === 'offline' && (
                      <span className="flex items-center gap-1 text-[10px] text-destructive font-medium flex-shrink-0">
                        <WifiOff className="w-3 h-3" /> Offline
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!isStdioInt && (
                        <button onClick={() => pingIntegration(integration.id)} disabled={ping === 'checking'}
                          title="Test connection"
                          className="h-7 w-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40">
                          {ping === 'checking'
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : ping === 'online' ? <Wifi className="w-3.5 h-3.5 text-success" />
                            : ping === 'auth_fail' ? <Lock className="w-3.5 h-3.5 text-amber-500" />
                            : ping === 'offline' ? <WifiOff className="w-3.5 h-3.5 text-destructive" />
                            : <Wifi className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button onClick={() => openEditSetup(integration)} title="Edit"
                        className="h-7 w-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(integration.id)} disabled={busy}
                        title={confirmDelete === integration.id ? 'Click again to confirm' : 'Remove'}
                        className={`h-7 px-2 text-xs rounded-md border transition-colors disabled:opacity-40 flex items-center gap-1 ${
                          confirmDelete === integration.id
                            ? 'border-destructive bg-destructive text-white'
                            : 'border-destructive/30 text-destructive hover:bg-destructive/10'
                        }`}>
                        {confirmDelete === integration.id ? 'Sure?' : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  {tools.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-1">
                      {tools.map(t => (
                        <span key={t.name} title={t.description}
                          className="inline-flex items-center gap-1 text-[10px] bg-secondary text-muted-foreground rounded px-1.5 py-0.5 font-mono">
                          <Wrench className="w-2.5 h-2.5 flex-shrink-0" />{t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Skill-linked integrations */}
      <section className="space-y-3">
        <IntSectionHeading icon={Sparkles} label="Required by skills" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {CURATED_INTEGRATIONS.map(curated => {
            const configured = getCuratedStatus(curated)
            return (
              <CuratedIntCard key={curated.slug} curated={curated} configured={configured}
                onSetup={() => openCuratedSetup(curated, configured ?? undefined)} />
            )
          })}
        </div>
      </section>

      {/* Popular integrations */}
      <section className="space-y-3">
        <IntSectionHeading icon={LayoutGrid} label="Popular" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {POPULAR_INTEGRATIONS.map(curated => {
            const configured = getCuratedStatus(curated)
            return (
              <CuratedIntCard key={curated.slug} curated={curated} configured={configured}
                onSetup={() => openCuratedSetup(curated, configured ?? undefined)} />
            )
          })}
        </div>
      </section>

      {/* Browse MCP Registry */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <IntSectionHeading icon={LayoutGrid} label="Browse MCP Registry" />
          {registryFetched && registryServers.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{registryServers.length} servers loaded</span>
          )}
        </div>

        {/* Search — always visible since approved cards are always shown */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input type="text" placeholder="Search servers…" value={registryQuery}
            onChange={e => setRegistryQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        {/* Unified grid — approved cards always pinned first, registry streams in below */}
        {(() => {
          const q = registryQuery.trim().toLowerCase()
          const approvedVisible = ALL_CURATED.filter(c =>
            !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.slug.includes(q)
          )
          const registryVisible = deduped // already filtered by registryQuery via useMemo
          const hasResults = approvedVisible.length > 0 || registryVisible.length > 0

          return hasResults ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {approvedVisible.map(curated => {
                const configured = getCuratedStatus(curated)
                return (
                  <RegistryIntCard
                    key={`approved-${curated.slug}`}
                    server={{
                      name: curated.slug,
                      title: curated.name,
                      description: curated.description,
                      icons: curated.icon ? [{ src: curated.icon }] : [],
                      websiteUrl: curated.docsUrl,
                    }}
                    approved
                    configured={!!configured}
                    onAdd={() => openCuratedSetup(curated, configured ?? undefined)}
                  />
                )
              })}

              {registryFetched && registryVisible.map(server => (
                <RegistryIntCard key={server.name} server={server} onAdd={() => openRegistrySetup(server)} />
              ))}

              {registryFetched && registryNextCursor && !q && (
                <RegistryScrollSentinel loading={registryLoading} onVisible={() => loadRegistry(registryNextCursor)} />
              )}
            </div>
          ) : (
            <p className="text-center py-8 text-sm text-muted-foreground">No matching servers.</p>
          )
        })()}

        {/* Load full registry CTA */}
        {!registryFetched && !registryLoading && (
          <button onClick={() => loadRegistry()}
            className="w-full flex items-center justify-center gap-2 h-9 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Browse 800+ more servers from the official MCP Registry
          </button>
        )}
        {registryLoading && !registryFetched && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </section>

      {/* Setup modal */}
      {setupTarget && (
        <IntegrationSetupModal target={setupTarget} onClose={() => setSetupTarget(null)}
          onSaved={() => { setSetupTarget(null); loadMy() }} />
      )}
    </div>
  )
}

function RegistryScrollSentinel({ loading, onVisible }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !loading) onVisible() },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loading, onVisible])

  return (
    <div ref={ref} className="col-span-full flex justify-center py-4">
      {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
    </div>
  )
}

function IntSectionHeading({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="w-3.5 h-3.5 opacity-70" />
      {label}
    </div>
  )
}

function CuratedIntCard({ curated, configured, onSetup }) {
  const [imgError, setImgError] = useState(false)
  const isOAuth = curated.authType === 'oauth'
  return (
    <div className={`relative bg-card border rounded-xl p-4 flex flex-col gap-3 transition-colors ${isOAuth ? 'border-amber-500/20' : configured ? 'border-success/30' : 'border-border'}`}>
      {configured && !isOAuth && (
        <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] text-success font-medium">
          <Check className="w-3 h-3" /> Connected
        </span>
      )}
      {configured && isOAuth && (
        <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] text-amber-500 font-medium">
          <Lock className="w-3 h-3" /> Saved, not working
        </span>
      )}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
          {curated.icon && !imgError
            ? <img src={curated.icon} alt={curated.name} className="w-6 h-6 object-contain" onError={() => setImgError(true)} />
            : <span className="text-sm font-bold text-muted-foreground">{curated.name[0]?.toUpperCase() ?? '?'}</span>}
        </div>
        <p className="text-sm font-semibold text-foreground leading-tight">{curated.name}</p>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed flex-1">{curated.description}</p>
      {isOAuth && (
        <div className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-2">
          <Lock className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">{curated.oauthNote}</p>
        </div>
      )}
      {!isOAuth && curated.docsUrl && (
        <a href={curated.docsUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors"
          onClick={e => e.stopPropagation()}>
          <ExternalLink className="w-3 h-3" /> Docs
        </a>
      )}
      {isOAuth ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-amber-500/70 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Not available for automated agents
          </span>
          {curated.docsUrl && (
            <a href={curated.docsUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors flex-shrink-0"
              onClick={e => e.stopPropagation()}>
              <ExternalLink className="w-3 h-3" /> Docs
            </a>
          )}
        </div>
      ) : (
        <button onClick={onSetup}
          className={`w-full h-8 rounded-md text-xs font-medium transition-colors ${
            configured ? 'border border-border text-muted-foreground hover:bg-secondary' : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}>
          {configured ? 'Edit' : 'Connect'}
        </button>
      )}
    </div>
  )
}

function RegistryIntCard({ server, onAdd, approved = false, configured = false }) {
  const [imgError, setImgError] = useState(false)
  const icon = server.icons?.[0]?.src
  const title = server.title || server.name?.split('/').pop() || server.name
  const desc = server.description || ''
  const isStdioOnly = !server.remotes?.length && server.packages?.some(p => p.transport?.type === 'stdio')
  let hostname = null
  try { if (server.websiteUrl) hostname = new URL(server.websiteUrl).hostname } catch {}

  return (
    <div className={`relative bg-card border rounded-xl p-3 flex flex-col gap-2 ${approved ? 'border-primary/20' : 'border-border'}`}>
      {approved && (
        <span className="absolute top-2 right-2 flex items-center gap-0.5 text-[9px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5 leading-none">
          ★ verified
        </span>
      )}
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0 mt-0.5">
          {icon && !imgError
            ? <img src={icon} alt={title} className="w-5 h-5 object-contain" onError={() => setImgError(true)} />
            : <span className="text-xs font-bold text-muted-foreground">{title[0]?.toUpperCase() ?? '?'}</span>}
        </div>
        <div className="flex-1 min-w-0 pr-16">
          <p className="text-xs font-semibold text-foreground leading-tight truncate">{title}</p>
          {isStdioOnly ? (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
              <Terminal className="w-2.5 h-2.5" /> stdio
            </span>
          ) : hostname && (
            <a href={server.websiteUrl} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground hover:text-primary truncate block"
              onClick={e => e.stopPropagation()}>
              {hostname}
            </a>
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 flex-1">{desc}</p>
      <button onClick={onAdd}
        className={`w-full h-7 rounded-md text-xs font-medium transition-colors ${
          configured
            ? 'border border-success/30 text-success hover:bg-success/10'
            : approved
              ? 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20'
              : 'border border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
        }`}>
        {configured ? '✓ Configured' : 'Add'}
      </button>
    </div>
  )
}

function IntegrationSetupModal({ target, onClose, onSaved }) {
  const { showToast } = useToast()
  const isStdio = target.type === 'stdio'
  const [form, setForm] = useState({ name: target.name || '', url: target.defaultUrl || '', api_key: '' })
  const [envForm, setEnvForm] = useState(
    (target.envFields ?? []).reduce((acc, f) => ({ ...acc, [f.key]: '' }), {})
  )
  const [busy, setBusy] = useState(false)
  const [testResult, setTestResult] = useState(null)
  useEscapeKey(onClose)

  const header = target.headers?.[0] ?? null

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setTestResult(null)
    try {
      let integrationId = target.existingId

      if (isStdio) {
        // Build stdio_config from command/args/env — only include non-empty env values
        const env = Object.fromEntries(
          Object.entries(envForm).filter(([, v]) => v.trim() !== '')
        )
        const stdio_config = { command: target.command, args: target.args, env }
        const payload = { name: form.name, stdio_config }
        if (target.existingId) {
          await api(`/api/my/integrations/${target.existingId}`, { method: 'PUT', body: JSON.stringify(payload) })
        } else {
          const data = await api('/api/my/integrations', { method: 'POST', body: JSON.stringify(payload) })
          integrationId = data.integration?.id
        }
        showToast(`${target.name} configured.`)
        setTestResult({ online: true, authenticated: true, tools: [], stdio: true })
        onSaved()
        return
      }

      // HTTP integration (existing path)
      if (target.existingId) {
        await api(`/api/my/integrations/${target.existingId}`, { method: 'PUT', body: JSON.stringify(form) })
      } else {
        const data = await api('/api/my/integrations', { method: 'POST', body: JSON.stringify(form) })
        integrationId = data.integration?.id
      }

      if (integrationId) {
        try {
          const result = await api(`/api/my/integrations/${integrationId}/test`, { method: 'POST' })
          setTestResult(result)
          if (result.authenticated) {
            showToast(result.tools?.length ? `Connected — ${result.tools.length} tools found` : 'Connected successfully.')
          } else {
            showToast(result.error || 'Saved, but authentication test failed.', 'error')
          }
        } catch {
          showToast(target.existingId ? 'Integration updated.' : 'Integration connected.')
        }
      }
      onSaved()
    } catch (err) { showToast(err.message, 'error') }
    finally { setBusy(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
              {target.icon
                ? <img src={target.icon} alt={target.name} className="w-7 h-7 object-contain" onError={e => { e.currentTarget.style.display = 'none' }} />
                : <Network className="w-5 h-5 text-muted-foreground" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {target.existingId ? 'Edit' : 'Connect'} {target.name}
              </h2>
              {target.title && target.title !== target.name && (
                <p className="text-xs text-muted-foreground">{target.title}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors ml-4 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Name</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>

          {isStdio ? (
            <>
              <div className="flex items-start gap-1.5 rounded-lg bg-secondary px-2.5 py-2">
                <Terminal className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Runs as a local process: <code className="font-mono">{[target.command, ...(target.args ?? [])].filter(Boolean).join(' ')}</code>
                </p>
              </div>
              {(target.envFields ?? []).map(field => (
                <div key={field.key} className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground flex items-center gap-1">
                    {field.label}
                    {field.isRequired && <span className="text-destructive">*</span>}
                  </label>
                  {field.description && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{field.description}</p>
                  )}
                  <input
                    type={field.isSecret ? 'password' : 'text'}
                    required={field.isRequired && !target.existingId}
                    placeholder={target.existingId && field.isSecret ? '••••••• (leave blank to keep current)' : field.key}
                    value={envForm[field.key] ?? ''}
                    onChange={e => setEnvForm(f => ({ ...f, [field.key]: e.target.value }))}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Server URL</label>
                <input required type="url" placeholder="https://mcp.example.com" value={form.url}
                  onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground flex items-center gap-1">
                  {header ? header.name : 'API Key'}
                  {header?.isRequired && <span className="text-destructive">*</span>}
                  {header && !header.isRequired && <span className="text-muted-foreground font-normal">(optional)</span>}
                </label>
                {header?.description && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{header.description}</p>
                )}
                <input type="password"
                  placeholder={target.existingId ? '••••••• (leave blank to keep current)' : (header?.name ?? 'API key or bearer token')}
                  value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </>
          )}

          {target.docsUrl && (
            <a href={target.docsUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
              <ExternalLink className="w-3 h-3" /> Setup guide & docs
            </a>
          )}

          {testResult && (
            <div className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${
              testResult.authenticated
                ? 'bg-success/10 border-success/20'
                : 'bg-amber-500/10 border-amber-500/20'
            }`}>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${testResult.authenticated ? 'text-success' : 'text-amber-600 dark:text-amber-400'}`}>
                {testResult.stdio
                  ? <><Terminal className="w-3.5 h-3.5" /> Saved — runs as local process on the server</>
                  : testResult.authenticated
                  ? <><Check className="w-3.5 h-3.5" /> Connection verified</>
                  : <><Lock className="w-3.5 h-3.5" /> Authentication failed</>}
              </div>
              {testResult.error && !testResult.authenticated && !testResult.stdio && (
                <p className="text-[11px] text-muted-foreground">{testResult.error}</p>
              )}
              {testResult.authenticated && !testResult.stdio && testResult.tools?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {testResult.tools.map(t => (
                    <span key={t.name} title={t.description}
                      className="inline-flex items-center gap-1 text-[10px] bg-secondary text-muted-foreground rounded px-1.5 py-0.5 font-mono">
                      <Wrench className="w-2.5 h-2.5 flex-shrink-0" />{t.name}
                    </span>
                  ))}
                </div>
              )}
              {testResult.authenticated && !testResult.stdio && !testResult.tools?.length && (
                <p className="text-[11px] text-muted-foreground">No tools discovered (SSE transport or empty list).</p>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 rounded-lg border border-border text-sm hover:bg-secondary transition-colors">
              {testResult ? 'Close' : 'Cancel'}
            </button>
            <button type="submit" disabled={busy}
              className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy ? 'Testing…' : target.existingId ? 'Save changes' : 'Connect'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
