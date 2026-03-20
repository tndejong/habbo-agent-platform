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
              // MCP HTTP servers return 405 on GET (expects POST) — that's fine, server is up
              reachable = r.ok || r.status === 405 || r.status === 401 || r.status === 400;
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
