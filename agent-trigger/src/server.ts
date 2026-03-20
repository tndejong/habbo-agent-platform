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
const LOG_FILE = "/tmp/hotel-team.log";
const NARRATOR_BOTS_MAP = "/tmp/hotel-narrator-bots.json";

// ── MCP helper (used by narrator) ────────────────────────────────────────────

const MCP_ENDPOINT = (() => {
  const raw = (process.env.HABBO_MCP_URL ?? "http://habbo-mcp:3003/mcp").trim();
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
  prompt: string;
  figure_type: string;
  bot_name: string;
  role: string;
}

interface RoomTemplate {
  bot_name: string;
  room_id: number;
  x: number;
  y: number;
  rot: number;
}

interface TeamConfig {
  team: { id: number; name: string; description: string; orchestrator_prompt: string };
  members: TeamMember[];
  flow: { name: string; description: string; tasks_json: string } | null;
  templates: RoomTemplate[];
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

function buildPromptFromConfig(config: TeamConfig, roomId: number, triggeredBy: string): string {
  const templateNote = (botName: string): string => {
    const tpl = config.templates.find(t => t.bot_name === botName && t.room_id === roomId);
    if (tpl) return `\n**Room placement**: deploy at x=${tpl.x}, y=${tpl.y}, rot=${tpl.rot} in room ${roomId}`;
    return `\n**Room placement**: deploy anywhere in room ${roomId}`;
  };

  const memberSections = config.members.map(m => `
## Agent: ${m.name}${m.role ? ` (${m.role})` : ""} — bot: "${m.bot_name}"
${m.prompt}
${templateNote(m.bot_name)}`).join("\n\n");

  const flowSection = config.flow
    ? `\n## Flow: ${config.flow.name}\n${config.flow.description}\n`
    : "";

  const orchestratorBase = config.team.orchestrator_prompt
    || `You are the orchestrator for team "${config.team.name}".\nTarget room: {{ROOM_ID}}\nTriggered by: {{TRIGGERED_BY}}\n\nLaunch all agents CONCURRENTLY in a single Agent tool call.\n\n{{PERSONAS}}\n\nLaunch all agents in ONE message.`;

  return orchestratorBase
    .replaceAll("{{ROOM_ID}}", String(roomId))
    .replaceAll("{{TRIGGERED_BY}}", triggeredBy)
    .replaceAll("{{PERSONAS}}", memberSections + flowSection);
}

function runOrchestratorWithPrompt(prompt: string, roomId: number, from: string): Promise<string> {
  return new Promise((resolve, reject) => {
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

let activeTeam: { roomId: number; startTime: Date; from: string } | null = null;

// ── Server ──────────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, activeTeam });
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
      activeTeam = null;
      if (existsSync(STOP_FILE)) unlinkSync(STOP_FILE);
      return Response.json({ ok: true, message: "State reset." });
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

      let body: { team_id?: number; flow_id?: number | null; room_id?: number; triggered_by?: string; portal_url?: string };
      try {
        body = await req.json();
      } catch {
        return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
      }

      const teamId = Number(body.team_id);
      const flowId = body.flow_id ? Number(body.flow_id) : null;
      const roomId = Number(body.room_id) || 202;
      const triggeredBy = body.triggered_by ?? "portal";

      if (!teamId) {
        return Response.json({ ok: false, error: "team_id required" }, { status: 400 });
      }

      if (activeTeam) {
        return Response.json({ ok: false, error: `Team already active in room ${activeTeam.roomId}. Stop it first.` }, { status: 409 });
      }

      // Fetch team config from portal
      let config: TeamConfig;
      try {
        config = await fetchTeamConfig(teamId, flowId);
      } catch (err: any) {
        log(`[trigger] Failed to fetch team config: ${err.message}`);
        return Response.json({ ok: false, error: `Could not load team config: ${err.message}` }, { status: 502 });
      }

      const prompt = buildPromptFromConfig(config, roomId, triggeredBy);
      activeTeam = { roomId, startTime: new Date(), from: triggeredBy };
      log(`[trigger] Team "${config.team.name}" started in room ${roomId} by ${triggeredBy}`);

      // Write known bot names so hotel_narrator.mjs can map subagent prompts → personas
      try {
        const knownBots = config.members.map(m => m.bot_name).filter(Boolean);
        const existing = existsSync(NARRATOR_BOTS_MAP)
          ? JSON.parse(readFileSync(NARRATOR_BOTS_MAP, "utf-8"))
          : {};
        writeFileSync(NARRATOR_BOTS_MAP, JSON.stringify({
          ...existing,
          known_bots: knownBots,
          sessions: existing.sessions ?? {},
        }, null, 2));
      } catch { /* non-fatal */ }

      // Run in background
      runOrchestratorWithPrompt(prompt, roomId, triggeredBy)
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

      const roomId = 202;
      activeTeam = { roomId, startTime: new Date(), from };
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
        const roomId = roomMatch ? parseInt(roomMatch[1]) : 202;

        if (activeTeam) {
          return twiml(`Team already active in room ${activeTeam.roomId}. Send "stop team" first.`);
        }

        activeTeam = { roomId, startTime: new Date(), from };
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
