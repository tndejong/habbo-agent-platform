import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const PORT = parseInt(process.env.HABBO_AGENT_TRIGGER_PORT ?? "3004");
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? "";
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER ?? "";
const PUBLIC_WEBHOOK_URL = process.env.HABBO_PUBLIC_URL ?? "http://localhost:3004";
const PROJECT_DIR = (process.env.HABBO_PROJECT_DIR ?? "").trim() || join(import.meta.dir, "../..");
const ALLOWED_NUMBERS = (process.env.HABBO_ALLOWED_PHONE_NUMBERS ?? "")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);
const STOP_FILE = "/tmp/hotel-team-stop";
// Write logs to the mounted project dir so they survive container restarts
const LOG_FILE = existsSync(PROJECT_DIR) ? join(PROJECT_DIR, "hotel-team.log") : "/tmp/hotel-team.log";
const NARRATOR_BOTS_MAP = "/tmp/hotel-narrator-bots.json";

function writeNarratorBotsMap(knownBots: string[]): void {
  try {
    const existing = existsSync(NARRATOR_BOTS_MAP)
      ? JSON.parse(readFileSync(NARRATOR_BOTS_MAP, 'utf-8'))
      : {};
    writeFileSync(NARRATOR_BOTS_MAP, JSON.stringify({
      ...existing,
      known_bots: knownBots,
      sessions: existing.sessions ?? {},
      pending: existing.pending ?? [],
    }, null, 2));
  } catch { /* non-fatal */ }
}

// ── MCP helper (used by narrator) ────────────────────────────────────────────

const MCP_ENDPOINT = (() => {
  const raw = (process.env.HOTEL_MCP_URL ?? "http://habbo-mcp:3003/mcp").trim();
  return raw.endsWith("/mcp") ? raw : raw.replace(/\/+$/, "") + "/mcp";
})();
const MCP_API_KEY = process.env.MCP_API_KEY ?? "";

async function mcpCall<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (MCP_API_KEY) headers["authorization"] = `Bearer ${MCP_API_KEY}`;
  const res = await fetch(MCP_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `narrator-${Date.now()}`,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);
  const data = await res.json() as any;
  if (data.error) throw new Error(`MCP error: ${data.error.message}`);
  const text = data.result?.content?.[0]?.text;
  try { return JSON.parse(text) as T; } catch { return data.result as T; }
}

// Bot name → id cache (avoids calling list_bots every tool use)
const botIdCache = new Map<string, number>();

async function findBotIdByName(name: string): Promise<number | null> {
  if (botIdCache.has(name.toLowerCase())) return botIdCache.get(name.toLowerCase())!;
  try {
    const res = await mcpCall<{ bots?: Array<{ id: number; name: string }> } | Array<{ id: number; name: string }>>("list_bots", {});
    // list_bots returns { count, bots: [...] } — unwrap either shape
    const arr = Array.isArray(res) ? res : (res as any).bots ?? [];
    for (const b of arr) {
      if (b.name) botIdCache.set(b.name.toLowerCase(), b.id);
    }
    return botIdCache.get(name.toLowerCase()) ?? null;
  } catch {
    return null;
  }
}
const PORTAL_URL = (process.env.PORTAL_URL || process.env.portal_url || "http://agent-portal:3000").replace(/\/$/, "");
const PORTAL_INTERNAL_SECRET = process.env.PORTAL_INTERNAL_SECRET ?? "";

async function fetchUserAnthropicKey(portalUserId: number): Promise<string | null> {
  if (!portalUserId) return null;
  try {
    const res = await fetch(`${PORTAL_URL}/api/internal/user/${portalUserId}/api-key/anthropic`, {
      headers: { "X-Internal-Secret": PORTAL_INTERNAL_SECRET },
    });
    if (!res.ok) return null;
    const data = await res.json() as { ok: boolean; api_key: string | null };
    return data.api_key ?? null;
  } catch {
    return null;
  }
}

function log(line: string) {
  const entry = `[${new Date().toISOString()}] ${line}\n`;
  process.stdout.write(entry);
  appendFileSync(LOG_FILE, entry);
}

// ── Twilio helpers ──────────────────────────────────────────────────────────

function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
): boolean {
  const sortedKeys = Object.keys(params).sort();
  const paramStr = sortedKeys.reduce((acc, k) => acc + k + params[k], "");
  const expected = createHmac("sha1", TWILIO_AUTH_TOKEN)
    .update(url + paramStr)
    .digest("base64");
  return expected === signature;
}

function twiml(message: string): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`,
    { headers: { "Content-Type": "text/xml" } },
  );
}

function voiceSay(message: string, gather = false): Response {
  const gatherBlock = gather
    ? `<Gather input="speech" action="${PUBLIC_WEBHOOK_URL}/voice/action" method="POST" speechTimeout="3" language="nl-NL">
        <Say language="nl-NL" voice="Polly.Lotte">${message}</Say>
       </Gather>
       <Say language="nl-NL" voice="Polly.Lotte">Geen invoer ontvangen. Dag!</Say>`
    : `<Say language="nl-NL" voice="Polly.Lotte">${message}</Say>`;
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${gatherBlock}</Response>`,
    { headers: { "Content-Type": "text/xml" } },
  );
}

async function sendSms(to: string, body: string): Promise<void> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_FROM_NUMBER) return;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      To: to,
      From: TWILIO_FROM_NUMBER,
      Body: body,
    }).toString(),
  });
}

// ── Orchestrator ────────────────────────────────────────────────────────────

function buildPrompt(roomId: number, from: string): string {
  const read = (name: string) =>
    readFileSync(join(PROJECT_DIR, "agents", name), "utf-8");

  return read("orchestrator.md")
    .replaceAll("{{ROOM_ID}}", String(roomId))
    .replaceAll("{{TRIGGERED_BY}}", from)
    .replaceAll("{{TOM_PERSONA}}", read("personas/tom.md"))
    .replaceAll("{{SANDER_PERSONA}}", read("personas/sander.md"));
}

// ── Dynamic config-driven orchestration ────────────────────────────────────

interface TeamMember {
  name: string;
  persona_role: string;
  capabilities: string;
  prompt: string;
  figure_type: string;
  bot_name: string;
  team_role: string;
}

interface RoomTemplate {
  bot_name: string;
  room_id: number;
  x: number;
  y: number;
  rot: number;
}

interface TeamConfig {
  team: { id: number; name: string; description: string; orchestrator_prompt: string; execution_mode: string; tasks_json: string; language: string };
  members: TeamMember[];
  flow: { name: string; description: string; tasks_json: string } | null;
  templates: RoomTemplate[];
}

interface RoleAssignments {
  [role: string]: string; // e.g. { "researcher": "Tom", "planner": "Sander" }
}

interface PackConfig {
  pack_id: number;
  pack_source_url: string;
  role_assignments: RoleAssignments;
  room_id: number;
  triggered_by: string;
}

async function fetchTeamConfig(teamId: number, flowId: number | null): Promise<TeamConfig> {
  const params = flowId ? `?flow_id=${flowId}` : "";
  const url = `${PORTAL_URL}/api/internal/teams/${teamId}/config${params}`;
  const res = await fetch(url, {
    headers: {
      "X-Internal-Secret": PORTAL_INTERNAL_SECRET,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch team config (${res.status}): ${text}`);
  }
  const data = await res.json() as { ok: boolean; team: TeamConfig["team"]; members: TeamMember[]; flow: TeamConfig["flow"]; templates: RoomTemplate[] };
  return { team: data.team, members: data.members, flow: data.flow, templates: data.templates ?? [] };
}

async function fetchUserTeamConfig(userTeamId: number): Promise<TeamConfig> {
  const url = `${PORTAL_URL}/api/internal/user-teams/${userTeamId}/config`;
  const res = await fetch(url, {
    headers: { "X-Internal-Secret": PORTAL_INTERNAL_SECRET },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch user team config (${res.status}): ${text}`);
  }
  const data = await res.json() as { ok: boolean; team: TeamConfig["team"]; members: TeamMember[]; flow: TeamConfig["flow"]; templates: RoomTemplate[] };
  return { team: data.team, members: data.members, flow: data.flow, templates: data.templates ?? [] };
}

function renderTasksBlock(config: TeamConfig, roomId: number): string {
  let tasks: Array<{ id: string; title: string; description?: string; assign_to?: string; depends_on?: string[] }> = []
  try { tasks = JSON.parse(config.team.tasks_json || '[]') } catch { tasks = [] }
  if (!tasks.length) return ''

  const mode = config.team.execution_mode || 'concurrent'

  if (mode === 'shared') {
    const taskObjs = tasks.map((t, i) => ({
      id: t.id || `t${i + 1}`,
      title: t.title,
      description: t.description || '',
      assign_to: t.assign_to || null,
      depends_on: t.depends_on || [],
      status: 'pending',
      claimed_by: null,
      result: null,
    }))
    return `
## Step 2: Write shared task list
Write this exact JSON to \`/tmp/hotel-team-tasks.json\` using the Write tool:
\`\`\`json
${JSON.stringify({ room_id: roomId, created_at: '<ISO timestamp>', stop: false, tasks: taskObjs, messages: [] }, null, 2)}
\`\`\`

Each agent must: read \`/tmp/hotel-team-tasks.json\`, find a pending task assigned to them (or unclaimed if assign_to is null) that matches their capabilities and whose dependencies are resolved, atomically set \`claimed_by\` to their bot name, complete the work, write the \`result\` back and set \`status\` to \`done\`. Check \`messages[]\` and completed task results for dependency context.
`
  }

  if (mode === 'sequential') {
    const steps = tasks.map((t, i) => {
      const idx = i + 1
      const deps = (t.depends_on || []).length ? ` (depends on: ${t.depends_on!.join(', ')})` : ''
      const assignee = t.assign_to ? ` → assign to **${t.assign_to}**` : ''
      return `${idx}. **${t.title}**${assignee}${deps}${t.description ? `\n   ${t.description}` : ''}`
    }).join('\n')
    return `
## Tasks — execute IN ORDER, one at a time
Spawn ONE agent per task. Wait for each Agent call to return before spawning the next.

${steps}

Do NOT run tasks concurrently. Each agent receives the previous task's result as context.
`
  }

  return ''
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', nl: 'Dutch', de: 'German', fr: 'French', es: 'Spanish',
  it: 'Italian', pt: 'Portuguese', pl: 'Polish', tr: 'Turkish', sv: 'Swedish',
}

function buildPromptFromConfig(config: TeamConfig, roomId: number, triggeredBy: string): string {
  const mode = config.team.execution_mode || 'concurrent'
  const tasksBlock = renderTasksBlock(config, roomId)
  const lang = config.team.language || 'en'
  const langName = LANGUAGE_NAMES[lang] || lang
  const langInstruction = `\n\nIMPORTANT: Always communicate in ${langName} when using talk_bot to speak in the hotel room.`

  const flowSection = config.flow
    ? `\n## Flow: ${config.flow.name}\n${config.flow.description}\n`
    : "";

  // Build a clean team roster for the orchestrator — capabilities only, no reactive-chat persona
  const rosterLines = config.members.map(m => {
    const tpl = config.templates.find(t => t.bot_name === m.bot_name && t.room_id === roomId)
    const placement = tpl
      ? `x=${tpl.x}, y=${tpl.y}, rot=${tpl.rot}`
      : `anywhere in room ${roomId}`
    const titleParts = [m.team_role, m.persona_role].filter(Boolean)
    const title = titleParts.length ? ` (${titleParts.join(' · ')})` : ''
    const caps = m.capabilities?.trim()
      ? `\n  Capabilities:\n${m.capabilities.trim().split('\n').map(l => `    ${l}`).join('\n')}`
      : ''
    return `- **${m.name}**${title} — hotel bot: "${m.bot_name}", deploy at: ${placement}${caps}`
  }).join('\n\n')

  // Subagent prompt template block — tells orchestrator how to write each subagent's prompt
  const subagentTemplate = config.members.map(m => {
    const tpl = config.templates.find(t => t.bot_name === m.bot_name && t.room_id === roomId)
    const placement = tpl
      ? `x=${tpl.x}, y=${tpl.y}, rot=${tpl.rot}`
      : `anywhere`
    return `### Subagent prompt for ${m.name}
\`\`\`
You are ${m.name}, a ${m.persona_role || m.team_role || 'team member'} working as part of team "${config.team.name}" in Habbo Hotel room ${roomId}.

Your hotel bot name is "${m.bot_name}".
- Use the deploy_bot MCP tool to place yourself in the room (${placement}) if not already there.
- Use talk_bot to communicate progress and results in the hotel room.
- Always speak in ${langName} when using talk_bot.

[INSERT SPECIFIC TASK HERE]

When done: announce your completion in ${langName} via talk_bot (e.g. "✅ Task finished: [brief summary]"), then return your findings as text.
\`\`\``
  }).join('\n\n')

  const doneStep = `
## Final step: Announce completion
After ALL subagents have finished, use talk_bot (as any available bot) to announce in ${langName} that the entire team has completed all tasks. Keep it short and clear (1-2 sentences).`

  // If team has a custom orchestrator prompt, use it with variable substitution
  if (config.team.orchestrator_prompt?.trim()) {
    return config.team.orchestrator_prompt
      .replaceAll("{{TEAM_NAME}}", config.team.name)
      .replaceAll("{{ROOM_ID}}", String(roomId))
      .replaceAll("{{TRIGGERED_BY}}", triggeredBy)
      .replaceAll("{{TASKS}}", tasksBlock)
      .replaceAll("{{PERSONAS}}", rosterLines + flowSection)
      + langInstruction
  }

  // Auto-generate orchestrator prompt based on execution mode
  if (mode === 'shared') {
    return `You are the orchestrator for team "${config.team.name}".
Room: ${roomId}. Triggered by: ${triggeredBy}.
All hotel room communication must be in ${langName}.

## Team
${rosterLines}
${flowSection}
${tasksBlock}

## Step 3: Spawn subagents concurrently
Spawn ONE subagent per team member using the Agent tool — all in a single message (parallel).
Each subagent is a Claude agent that uses MCP tools to work in the hotel.

${subagentTemplate}

Replace [INSERT SPECIFIC TASK HERE] with the task(s) claimed from the shared task list that are assigned to that agent (or best match their capabilities).

## Step 4: Report
When all agents complete, read \`/tmp/hotel-team-tasks.json\` and summarise results.
${doneStep}`

  } else if (mode === 'sequential') {
    return `You are the orchestrator for team "${config.team.name}".
Room: ${roomId}. Triggered by: ${triggeredBy}.
All hotel room communication must be in ${langName}.

## Team
${rosterLines}
${flowSection}
${tasksBlock}

## Execution
Spawn ONE subagent at a time using the Agent tool. Wait for each to finish before spawning the next.
Each subagent is a Claude agent that uses MCP tools to work in the hotel.

${subagentTemplate}

Assign tasks to the agent whose capabilities best match. Work through all tasks in order.
${doneStep}`

  } else {
    // concurrent (default)
    return `You are the orchestrator for team "${config.team.name}".
Room: ${roomId}. Triggered by: ${triggeredBy}.
All hotel room communication must be in ${langName}.

## Team
${rosterLines}
${flowSection}

## Your job
Spawn ALL team members as Claude subagents CONCURRENTLY — use the Agent tool, all calls in a single message.
Each subagent uses MCP tools to deploy their hotel bot and work in the room.

${subagentTemplate}

Spawn all agents in ONE message (parallel). Wait for all to complete, then summarise.
${doneStep}`
  }
}

async function buildPromptFromPack(config: PackConfig): Promise<string> {
  // 1. Fetch the remote orchestrator prompt
  const res = await fetch(config.pack_source_url, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch pack prompt from ${config.pack_source_url} (${res.status})`);
  }
  const basePrompt = await res.text();

  // 2. Build the role injection block
  const botLines = Object.entries(config.role_assignments)
    .map(([role, bot]) => `- ${role} → include "You are ${bot}, a Habbo Hotel bot" in the subagent's prompt`)
    .join('\n');

  const injectionBlock = `

## Hotel Bot Assignments
You are running inside Habbo Hotel room ${config.room_id}, triggered by ${config.triggered_by}.
When spawning subagents, inject their hotel bot identity into each subagent prompt:
${botLines}

This ensures each agent is visually represented by their hotel bot in the room.`;

  return basePrompt + injectionBlock;
}

function runOrchestratorWithPrompt(prompt: string, roomId: number, from: string, userApiKey?: string | null, onChild?: (child: ReturnType<typeof spawn>) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    if (existsSync(STOP_FILE)) unlinkSync(STOP_FILE);

    const claudeBin = process.env.CLAUDE_BIN ?? "claude";
    const child = spawn(claudeBin, ["-p", "--dangerously-skip-permissions", "--no-session-persistence", "--output-format", "stream-json", "--verbose"], {
      cwd: PROJECT_DIR,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: userApiKey || (process.env.ANTHROPIC_API_KEY ?? ""),
        MCP_API_KEY: process.env.MCP_API_KEY ?? "",
        HABBO_HOOK_ENABLED: "true",
        HABBO_HOOK_TRANSPORT: process.env.HABBO_HOOK_TRANSPORT ?? "remote",
        HABBO_HOOK_REMOTE_BASE_URL:
          process.env.HABBO_HOOK_REMOTE_BASE_URL ?? "https://hotel-mcp.fixdev.nl",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    onChild?.(child);
    child.stdin.write(prompt);
    child.stdin.end();

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      const text = d.toString();
      stdout += text;
      for (const line of text.split("\n").filter(Boolean)) {
        try {
          const event = JSON.parse(line);
          if (event.type === "assistant" && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text?.trim()) log(`[think] ${block.text.trim().slice(0, 200)}`);
              if (block.type === "tool_use") log(`[tool→] ${block.name} ${JSON.stringify(block.input).slice(0, 150)}`);
            }
          } else if (event.type === "tool_result") {
            const content = Array.isArray(event.content) ? event.content.map((c: any) => c.text).join("") : String(event.content ?? "");
            log(`[tool←] ${content.slice(0, 150)}`);
          } else if (event.type === "result") {
            log(`[done] ${event.result?.slice(0, 200) ?? "complete"}`);
          }
        } catch { log(`[claude] ${line.slice(0, 200)}`); }
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      const text = d.toString();
      stderr += text;
      log(`[claude:err] ${text.trim()}`);
    });

    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolve(stdout.trim().slice(-200) || "Team session complete.");
      } else {
        reject(new Error(`claude exited ${code}: ${stderr.slice(0, 300)}`));
      }
    });
  });
}

function runOrchestrator(roomId: number, from: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Remove any stale stop signal
    if (existsSync(STOP_FILE)) unlinkSync(STOP_FILE);

    const claudeBin = process.env.CLAUDE_BIN ?? "claude";
    const child = spawn(claudeBin, ["-p", "--dangerously-skip-permissions", "--no-session-persistence", "--output-format", "stream-json", "--verbose"], {
      cwd: PROJECT_DIR,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
        MCP_API_KEY: process.env.MCP_API_KEY ?? "",
        HABBO_HOOK_ENABLED: "true",
        HABBO_HOOK_TRANSPORT: process.env.HABBO_HOOK_TRANSPORT ?? "remote",
        HABBO_HOOK_REMOTE_BASE_URL:
          process.env.HABBO_HOOK_REMOTE_BASE_URL ?? "https://hotel-mcp.fixdev.nl",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdin.write(buildPrompt(roomId, from));
    child.stdin.end();

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      const text = d.toString();
      stdout += text;
      // Parse stream-json events for readable logging
      for (const line of text.split("\n").filter(Boolean)) {
        try {
          const event = JSON.parse(line);
          if (event.type === "assistant" && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text?.trim()) log(`[think] ${block.text.trim().slice(0, 200)}`);
              if (block.type === "tool_use") log(`[tool→] ${block.name} ${JSON.stringify(block.input).slice(0, 150)}`);
            }
          } else if (event.type === "tool_result") {
            const content = Array.isArray(event.content) ? event.content.map((c: any) => c.text).join("") : String(event.content ?? "");
            log(`[tool←] ${content.slice(0, 150)}`);
          } else if (event.type === "result") {
            log(`[done] ${event.result?.slice(0, 200) ?? "complete"}`);
          }
        } catch { log(`[claude] ${line.slice(0, 200)}`); }
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      const text = d.toString();
      stderr += text;
      log(`[claude:err] ${text.trim()}`);
    });

    child.on("close", (code: number | null) => {
      if (code === 0) {
        // Return last 200 chars as summary for SMS
        resolve(stdout.trim().slice(-200) || "Team session complete.");
      } else {
        reject(new Error(`claude exited ${code}: ${stderr.slice(0, 300)}`));
      }
    });
  });
}

// ── State ───────────────────────────────────────────────────────────────────

let activeTeam: { roomId: number; startTime: Date; from: string; child: ReturnType<typeof spawn> | null } | null = null;

function killActiveTeam() {
  if (!activeTeam) return;
  writeFileSync(STOP_FILE, new Date().toISOString());
  // Update shared task file so subagents stop claiming new tasks
  try {
    const taskFile = "/tmp/hotel-team-tasks.json";
    if (existsSync(taskFile)) {
      const tasks = JSON.parse(readFileSync(taskFile, "utf8"));
      writeFileSync(taskFile, JSON.stringify({ ...tasks, stop: true }, null, 2));
    }
  } catch { /* ignore */ }
  // Kill the main orchestrator process — subagent claude processes will be orphaned
  // but they'll exit when they check stop: true in the task file
  if (activeTeam.child) {
    try { activeTeam.child.kill("SIGTERM"); } catch { /* already dead */ }
  }
  activeTeam = null;
}

// ── Server ──────────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, activeTeam });
    }

    // ── Log tail ──────────────────────────────────────────────────────────────
    if (url.pathname === "/logs") {
      try {
        const lines = Math.min(parseInt(url.searchParams.get("lines") ?? "100"), 500);
        if (!existsSync(LOG_FILE)) return Response.json({ ok: true, lines: [] });
        const raw = readFileSync(LOG_FILE, "utf-8").trimEnd();
        const all = raw.length ? raw.split("\n") : [];
        return Response.json({ ok: true, lines: all.slice(-lines) });
      } catch (e: any) {
        return Response.json({ ok: false, lines: [], error: e.message });
      }
    }

    // ── MCP config status ────────────────────────────────────────────────────
    if (url.pathname === "/mcp-status") {
      try {
        const mcpJsonPath = join(PROJECT_DIR, ".mcp.json");
        if (!existsSync(mcpJsonPath)) {
          return Response.json({ ok: false, servers: [], error: "MCP config not found at " + mcpJsonPath });
        }
        const config = JSON.parse(readFileSync(mcpJsonPath, "utf-8"));
        const servers = await Promise.all(
          Object.entries(config.mcpServers ?? {}).map(async ([name, cfg]: [string, any]) => {
            const rawAuth: string = cfg.headers?.Authorization ?? "";
            const keyPart = rawAuth.replace(/^Bearer |^Basic /, "").trim();
            const hasKey = keyPart.length > 0;
            const keyPreview = hasKey ? keyPart.slice(0, 8) + "…" : "";
            let reachable = false;
            let statusCode: number | null = null;
            try {
              const r = await fetch(cfg.url, {
                method: "GET",
                headers: { ...(cfg.headers ?? {}) },
                signal: AbortSignal.timeout(4000),
              });
              statusCode = r.status;
              // Any HTTP response means the server is reachable — only timeout/ECONNREFUSED = down
              reachable = true;
            } catch (e: any) {
              statusCode = null;
            }
            return { name, url: cfg.url, hasKey, keyPreview, reachable, statusCode };
          })
        );
        return Response.json({ ok: true, servers, mcpJsonPath });
      } catch (e: any) {
        return Response.json({ ok: false, servers: [], error: e.message });
      }
    }

    if (url.pathname === "/reset" && req.method === "POST") {
      killActiveTeam();
      return Response.json({ ok: true, message: "Team stopped." });
    }

    // ── Hotel narrator endpoint (called by hotel_narrator.mjs hook) ─────────
    if (url.pathname === "/narrator" && req.method === "POST") {
      let body: { bot_name?: string; message?: string; event?: string; session_id?: string; tool_name?: string };
      try { body = await req.json(); } catch { return Response.json({ ok: false }, { status: 400 }); }

      const { bot_name, message } = body;
      if (!bot_name || !message) return Response.json({ ok: false, error: "bot_name and message required" }, { status: 400 });

      // Fire-and-forget: resolve bot_id then talk
      (async () => {
        try {
          const botId = await findBotIdByName(bot_name);
          if (botId == null) { log(`[narrator] Bot "${bot_name}" not found in hotel`); return; }
          await mcpCall("talk_bot", { bot_id: botId, message: message.slice(0, 240), type: "talk" });
          log(`[narrator] ${bot_name}: ${message.slice(0, 80)}`);
        } catch (err: any) {
          log(`[narrator] error for ${bot_name}: ${err.message}`);
        }
      })();

      return Response.json({ ok: true });
    }

    // ── Portal trigger endpoint ──────────────────────────────────────────────
    if (url.pathname === "/trigger" && req.method === "POST") {
      const secret = req.headers.get("X-Internal-Secret") ?? "";
      if (PORTAL_INTERNAL_SECRET && secret !== PORTAL_INTERNAL_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }

      let body: {
        team_id?: number; flow_id?: number | null; room_id?: number; triggered_by?: string; portal_url?: string;
        pack_source_url?: string; role_assignments?: Record<string, string>; pack_id?: number;
        portal_user_id?: number; user_team?: boolean;
      };
      try {
        body = await req.json();
      } catch {
        return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
      }

      // Pack mode
      if (body.pack_source_url && body.role_assignments) {
        const packConfig: PackConfig = {
          pack_id: Number(body.pack_id) || 0,
          pack_source_url: body.pack_source_url,
          role_assignments: body.role_assignments,
          room_id: Number(body.room_id) || 50,
          triggered_by: body.triggered_by ?? 'portal',
        };

        if (activeTeam) {
          return Response.json({ ok: false, error: `Team already active in room ${activeTeam.roomId}. Stop it first.` }, { status: 409 });
        }

        let prompt: string;
        try {
          prompt = await buildPromptFromPack(packConfig);
        } catch (err: any) {
          log(`[trigger] Failed to build pack prompt: ${err.message}`);
          return Response.json({ ok: false, error: err.message }, { status: 502 });
        }

        const knownBots = Object.values(packConfig.role_assignments).filter(Boolean);
        writeNarratorBotsMap(knownBots);

        const packUserApiKey = await fetchUserAnthropicKey(Number(body.portal_user_id) || 0);
        if (packUserApiKey) log(`[trigger] Pack using API key from portal user ${body.portal_user_id}`);

        activeTeam = { roomId: packConfig.room_id, startTime: new Date(), from: packConfig.triggered_by, child: null };
        log(`[trigger] Pack ${packConfig.pack_id} started in room ${packConfig.room_id} by ${packConfig.triggered_by}`);

        runOrchestratorWithPrompt(prompt, packConfig.room_id, packConfig.triggered_by, packUserApiKey, (child) => {
          if (activeTeam) activeTeam.child = child;
        })
          .then((summary) => { activeTeam = null; log(`[trigger] Pack ${packConfig.pack_id} completed: ${summary.slice(0, 100)}`); })
          .catch((err: Error) => { activeTeam = null; log(`[trigger] Pack ${packConfig.pack_id} error: ${err.message}`); });

        return Response.json({ ok: true, message: `Pack launched in room ${packConfig.room_id}` });
      }
      // else fall through to existing team_id logic below

      const teamId = Number(body.team_id);
      const flowId = body.flow_id ? Number(body.flow_id) : null;
      const roomId = Number(body.room_id) || 50;
      const triggeredBy = body.triggered_by ?? "portal";
      const portalUserId = Number(body.portal_user_id) || 0;

      if (!teamId) {
        return Response.json({ ok: false, error: "team_id required" }, { status: 400 });
      }

      if (activeTeam) {
        return Response.json({ ok: false, error: `Team already active in room ${activeTeam.roomId}. Stop it first.` }, { status: 409 });
      }

      // Fetch team config + user API key in parallel
      const isUserTeam = body.user_team === true;
      let config: TeamConfig;
      let userApiKey: string | null = null;
      try {
        [config, userApiKey] = await Promise.all([
          isUserTeam ? fetchUserTeamConfig(teamId) : fetchTeamConfig(teamId, flowId),
          fetchUserAnthropicKey(portalUserId),
        ]);
      } catch (err: any) {
        log(`[trigger] Failed to fetch team config: ${err.message}`);
        return Response.json({ ok: false, error: `Could not load team config: ${err.message}` }, { status: 502 });
      }

      if (userApiKey) {
        log(`[trigger] Using API key from portal user ${portalUserId}`);
      }

      const prompt = buildPromptFromConfig(config, roomId, triggeredBy);
      activeTeam = { roomId, startTime: new Date(), from: triggeredBy, child: null };
      log(`[trigger] Team "${config.team.name}" started in room ${roomId} by ${triggeredBy}`);

      // Write known bot names so hotel_narrator.mjs can map subagent prompts → personas
      const knownBots = config.members.map(m => m.bot_name).filter(Boolean);
      writeNarratorBotsMap(knownBots);

      // Run in background
      runOrchestratorWithPrompt(prompt, roomId, triggeredBy, userApiKey, (child) => {
        if (activeTeam) activeTeam.child = child;
      })
        .then((summary) => {
          activeTeam = null;
          log(`[trigger] Team "${config.team.name}" completed: ${summary.slice(0, 100)}`);
        })
        .catch((err: Error) => {
          activeTeam = null;
          log(`[trigger] Team "${config.team.name}" error: ${err.message}`);
        });

      return Response.json({ ok: true, message: `Team "${config.team.name}" launched in room ${roomId}` });
    }

    // ── Voice webhook (initial call) ─────────────────────────────────────────
    if (url.pathname === "/voice" && req.method === "POST") {
      const formData = await req.formData();
      const from = formData.get("From")?.toString() ?? "";

      if (ALLOWED_NUMBERS.length > 0 && !ALLOWED_NUMBERS.includes(from)) {
        return voiceSay("Onbevoegd nummer. Verbinding verbroken.");
      }

      if (activeTeam) {
        return voiceSay(`Team is al actief in kamer ${activeTeam.roomId}. Stuur een SMS met stop team om te stoppen.`);
      }

      const roomId = 50;
      activeTeam = { roomId, startTime: new Date(), from, child: null };
      log(`[voice] Team gestart door ${from}`);

      runOrchestrator(roomId, from)
        .then((summary) => { activeTeam = null; sendSms(from, `Team klaar. ${summary.slice(0, 140)}`); })
        .catch((err: Error) => { activeTeam = null; sendSms(from, `Team fout: ${err.message.slice(0, 140)}`); });

      return voiceSay("Team wordt gestart. Je ontvangt een SMS als ze klaar zijn. Tot ziens!");
    }

    if (url.pathname === "/sms" && req.method === "POST") {
      const formData = await req.formData();
      const params: Record<string, string> = {};
      formData.forEach((v, k) => { params[k] = v.toString(); });

      // Validate Twilio signature (skip if no auth token configured)
      if (TWILIO_AUTH_TOKEN) {
        const sig = req.headers.get("X-Twilio-Signature") ?? "";
        const webhookUrl = `${PUBLIC_WEBHOOK_URL}/sms`;
        if (!validateTwilioSignature(webhookUrl, params, sig)) {
          return new Response("Forbidden", { status: 403 });
        }
      }

      const from = params.From ?? "";
      const body = (params.Body ?? "").trim().toLowerCase();

      // Allowlist check
      if (ALLOWED_NUMBERS.length > 0 && !ALLOWED_NUMBERS.includes(from)) {
        return twiml("Unauthorized number.");
      }

      // ── Commands ─────────────────────────────────────────────────────────

      if (body.startsWith("start team")) {
        const roomMatch = body.match(/start team\s+(\d+)/);
        const roomId = roomMatch ? parseInt(roomMatch[1]) : 50;

        if (activeTeam) {
          return twiml(`Team already active in room ${activeTeam.roomId}. Send "stop team" first.`);
        }

        activeTeam = { roomId, startTime: new Date(), from, child: null };
        log(`[trigger] Team started in room ${roomId} by ${from}`);

        // Run orchestrator in background — reply to Twilio immediately
        runOrchestrator(roomId, from)
          .then((summary) => {
            activeTeam = null;
            sendSms(from, `Team done in room ${roomId}. ${summary.slice(0, 140)}`);
          })
          .catch((err: Error) => {
            activeTeam = null;
            sendSms(from, `Team error: ${err.message.slice(0, 140)}`);
          });

        return twiml(`Spawning team in room ${roomId}... Confirmation SMS incoming.`);
      }

      if (body.startsWith("stop team")) {
        if (!activeTeam) {
          return twiml("No active team to stop.");
        }
        // Write stop signal — agents poll this file each iteration
        writeFileSync(STOP_FILE, new Date().toISOString());
        const room = activeTeam.roomId;
        return twiml(`Stop signal sent. Agents in room ${room} will finish their current action and clean up.`);
      }

      if (body === "status") {
        if (activeTeam) {
          const mins = Math.round((Date.now() - activeTeam.startTime.getTime()) / 60000);
          return twiml(`Team active in room ${activeTeam.roomId} for ${mins} min.`);
        }
        return twiml("No active team.");
      }

      return twiml('Commands: "start team [room_id]" | "stop team" | "status"');
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`agent-trigger running on http://localhost:${PORT}`);
console.log(`Project dir: ${PROJECT_DIR}`);
console.log(`Stop file: ${STOP_FILE}`);
console.log(ALLOWED_NUMBERS.length ? `Allowed numbers: ${ALLOWED_NUMBERS.join(", ")}` : "No number allowlist (set HABBO_ALLOWED_PHONE_NUMBERS)");
