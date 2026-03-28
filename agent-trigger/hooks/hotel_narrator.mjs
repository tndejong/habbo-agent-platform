#!/usr/bin/env node
/**
 * hotel_narrator.mjs — Claude Code hook: PreToolUse(Agent) / SubagentStart / PostToolUse / SubagentStop
 *
 * Bot linking flow:
 *   1. pre_agent_spawn (PreToolUse on Agent tool)
 *      Orchestrator is about to spawn a subagent. Read tool_input.prompt,
 *      detect the bot name, push to a PENDING QUEUE in the bots map.
 *
 *   2. subagent_start (SubagentStart)
 *      Subagent has started, we now have its session_id.
 *      Pop the oldest pending bot from the queue → write session_id → bot_name.
 *
 *   3. post_tool_use (PostToolUse)
 *      Look up bot for this session_id → translate via Haiku → narrate.
 *
 *   4. subagent_stop (SubagentStop)
 *      Farewell message, remove session mapping.
 *
 * Always exits 0. Hard watchdog at 4.5s.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const EVENT_TYPE   = process.argv[2];
// Use the room-scoped bots file injected by agent-trigger; fall back to legacy global path
const ROOM_ID      = process.env.HABBO_ROOM_ID ?? '';
const BOTS_MAP     = ROOM_ID ? `/tmp/hotel-narrator-bots-${ROOM_ID}.json` : '/tmp/hotel-narrator-bots.json';
const NARRATOR_URL = 'http://localhost:3004/narrator';
const MAX_MS       = 4500;

const watchdog = setTimeout(() => process.exit(0), MAX_MS);

// Tools too noisy to narrate — includes all hotel MCP chat/deploy tools to prevent
// narrating the bots' own speech (which creates circular meta-commentary spam)
const SKIP_TOOLS = new Set([
  // Claude built-in file/search tools
  'Read', 'Glob', 'Grep', 'LS', 'exit_plan_mode', 'ExitPlanMode', 'EnterPlanMode',
  'TodoRead', 'TodoWrite', 'Task', 'Agent',
  // Internal tool-discovery — spammy and never meaningful to show in hotel chat
  'ToolSearch', 'Skill',
  // Hotel MCP — plain names (used in some invocation paths)
  'talk_bot', 'talk_as_player', 'deploy_bot', 'delete_bot', 'list_bots',
  'get_player_room', 'check_stop_signal',
  // Team lifecycle tools — too frequent during shutdown loops to narrate
  'TeamDelete', 'TeamCreate', 'TeamStop', 'TeamStart',
  // Hotel MCP — namespaced names Claude reports in hook payloads (mcp__<server>__<tool>)
  'mcp__hotel-mcp__talk_bot', 'mcp__hotel-mcp__talk_as_player',
  'mcp__hotel-mcp__deploy_bot', 'mcp__hotel-mcp__delete_bot',
  'mcp__hotel-mcp__list_bots', 'mcp__hotel-mcp__get_player_room',
  'mcp__hotel-mcp__check_stop_signal',
  // Legacy / alternate naming kept for safety
  'mcp__check_stop_signal',
]);

// Returns true if the tool name matches any hotel MCP pattern (catches variants)
function isHotelMcpTool(name) {
  return name.startsWith('mcp__hotel') || name.startsWith('mcp__habbo');
}

// Fallback templates when Haiku times out — keyed by language code
function viaPersona(p, n, rest) {
  return p ? `${p.persona_name} (${p.persona_role}) via ${n} ${rest}` : `${n} ${rest}`;
}

const FALLBACK_TEMPLATES = {
  nl: {
    Write:       (n, i, p) => viaPersona(p, n, `schrijft naar ${tail(i?.file_path ?? 'een bestand')}.`),
    Edit:        (n, i, p) => viaPersona(p, n, `past ${tail(i?.file_path ?? 'een bestand')} aan.`),
    Bash:        (n, i, p) => viaPersona(p, n, `voert uit: ${String(i?.command ?? '').slice(0, 50)}.`),
    WebFetch:    (n, i, p) => viaPersona(p, n, 'zoekt informatie op het internet.'),
    WebSearch:   (n, i, p) => viaPersona(p, n, 'doorzoekt het web.'),
    NotebookEdit:(n, i, p) => viaPersona(p, n, 'werkt een notebook bij.'),
  },
  en: {
    Write:       (n, i, p) => viaPersona(p, n, `is writing to ${tail(i?.file_path ?? 'a file')}.`),
    Edit:        (n, i, p) => viaPersona(p, n, `is editing ${tail(i?.file_path ?? 'a file')}.`),
    Bash:        (n, i, p) => viaPersona(p, n, `runs: ${String(i?.command ?? '').slice(0, 50)}.`),
    WebFetch:    (n, i, p) => viaPersona(p, n, 'is looking up information online.'),
    WebSearch:   (n, i, p) => viaPersona(p, n, 'is searching the web.'),
    NotebookEdit:(n, i, p) => viaPersona(p, n, 'is updating a notebook.'),
  },
  de: {
    Write:       (n, i, p) => viaPersona(p, n, `schreibt nach ${tail(i?.file_path ?? 'einer Datei')}.`),
    Edit:        (n, i, p) => viaPersona(p, n, `bearbeitet ${tail(i?.file_path ?? 'eine Datei')}.`),
    Bash:        (n, i, p) => viaPersona(p, n, `führt aus: ${String(i?.command ?? '').slice(0, 50)}.`),
    WebFetch:    (n, i, p) => viaPersona(p, n, 'sucht Informationen im Internet.'),
    WebSearch:   (n, i, p) => viaPersona(p, n, 'durchsucht das Web.'),
    NotebookEdit:(n, i, p) => viaPersona(p, n, 'aktualisiert ein Notizbuch.'),
  },
  fr: {
    Write:       (n, i, p) => viaPersona(p, n, `écrit dans ${tail(i?.file_path ?? 'un fichier')}.`),
    Edit:        (n, i, p) => viaPersona(p, n, `modifie ${tail(i?.file_path ?? 'un fichier')}.`),
    Bash:        (n, i, p) => viaPersona(p, n, `exécute : ${String(i?.command ?? '').slice(0, 50)}.`),
    WebFetch:    (n, i, p) => viaPersona(p, n, 'recherche des informations en ligne.'),
    WebSearch:   (n, i, p) => viaPersona(p, n, 'parcourt le web.'),
    NotebookEdit:(n, i, p) => viaPersona(p, n, 'met à jour un notebook.'),
  },
  es: {
    Write:       (n, i, p) => viaPersona(p, n, `escribe en ${tail(i?.file_path ?? 'un archivo')}.`),
    Edit:        (n, i, p) => viaPersona(p, n, `edita ${tail(i?.file_path ?? 'un archivo')}.`),
    Bash:        (n, i, p) => viaPersona(p, n, `ejecuta: ${String(i?.command ?? '').slice(0, 50)}.`),
    WebFetch:    (n, i, p) => viaPersona(p, n, 'busca información en línea.'),
    WebSearch:   (n, i, p) => viaPersona(p, n, 'busca en la web.'),
    NotebookEdit:(n, i, p) => viaPersona(p, n, 'actualiza un cuaderno.'),
  },
  it: {
    Write:       (n, i, p) => viaPersona(p, n, `scrive su ${tail(i?.file_path ?? 'un file')}.`),
    Edit:        (n, i, p) => viaPersona(p, n, `modifica ${tail(i?.file_path ?? 'un file')}.`),
    Bash:        (n, i, p) => viaPersona(p, n, `esegue: ${String(i?.command ?? '').slice(0, 50)}.`),
    WebFetch:    (n, i, p) => viaPersona(p, n, 'cerca informazioni online.'),
    WebSearch:   (n, i, p) => viaPersona(p, n, 'effettua una ricerca sul web.'),
    NotebookEdit:(n, i, p) => viaPersona(p, n, 'aggiorna un notebook.'),
  },
  pt: {
    Write:       (n, i, p) => viaPersona(p, n, `escreve em ${tail(i?.file_path ?? 'um arquivo')}.`),
    Edit:        (n, i, p) => viaPersona(p, n, `edita ${tail(i?.file_path ?? 'um arquivo')}.`),
    Bash:        (n, i, p) => viaPersona(p, n, `executa: ${String(i?.command ?? '').slice(0, 50)}.`),
    WebFetch:    (n, i, p) => viaPersona(p, n, 'procura informações online.'),
    WebSearch:   (n, i, p) => viaPersona(p, n, 'pesquisa na web.'),
    NotebookEdit:(n, i, p) => viaPersona(p, n, 'atualiza um notebook.'),
  },
  pl: {
    Write:       (n, i, p) => viaPersona(p, n, `zapisuje do ${tail(i?.file_path ?? 'pliku')}.`),
    Edit:        (n, i, p) => viaPersona(p, n, `edytuje ${tail(i?.file_path ?? 'plik')}.`),
    Bash:        (n, i, p) => viaPersona(p, n, `uruchamia: ${String(i?.command ?? '').slice(0, 50)}.`),
    WebFetch:    (n, i, p) => viaPersona(p, n, 'wyszukuje informacje w internecie.'),
    WebSearch:   (n, i, p) => viaPersona(p, n, 'przeszukuje sieć.'),
    NotebookEdit:(n, i, p) => viaPersona(p, n, 'aktualizuje notatnik.'),
  },
  tr: {
    Write:       (n, i, p) => viaPersona(p, n, `şuraya yazıyor: ${tail(i?.file_path ?? 'dosya')}.`),
    Edit:        (n, i, p) => viaPersona(p, n, `şunu düzenliyor: ${tail(i?.file_path ?? 'dosya')}.`),
    Bash:        (n, i, p) => viaPersona(p, n, `çalıştırıyor: ${String(i?.command ?? '').slice(0, 50)}.`),
    WebFetch:    (n, i, p) => viaPersona(p, n, 'internette bilgi arıyor.'),
    WebSearch:   (n, i, p) => viaPersona(p, n, "web'de arama yapıyor."),
    NotebookEdit:(n, i, p) => viaPersona(p, n, 'not defterini güncelliyor.'),
  },
  sv: {
    Write:       (n, i, p) => viaPersona(p, n, `skriver till ${tail(i?.file_path ?? 'en fil')}.`),
    Edit:        (n, i, p) => viaPersona(p, n, `redigerar ${tail(i?.file_path ?? 'en fil')}.`),
    Bash:        (n, i, p) => viaPersona(p, n, `kör: ${String(i?.command ?? '').slice(0, 50)}.`),
    WebFetch:    (n, i, p) => viaPersona(p, n, 'söker information online.'),
    WebSearch:   (n, i, p) => viaPersona(p, n, 'söker på webben.'),
    NotebookEdit:(n, i, p) => viaPersona(p, n, 'uppdaterar ett anteckningsblock.'),
  },
};

function getFallback(lang) {
  return FALLBACK_TEMPLATES[lang] ?? FALLBACK_TEMPLATES['en'];
}

function tail(p) { return String(p).split('/').slice(-2).join('/'); }

// ── Bots map ─────────────────────────────────────────────────────────────────
// Format:
// {
//   known_bots: ["Tom", "Sander"],
//   pending:    ["Tom"],            ← FIFO queue: pre_agent_spawn pushes, subagent_start pops
//   sessions:   { "<session_id>": "Tom" }
// }

function readMap() {
  try {
    if (!existsSync(BOTS_MAP)) return { known_bots: [], language: 'en', max_session_messages: 3, pending: [], sessions: {}, message_counts: {}, bot_personas: {} };
    const m = JSON.parse(readFileSync(BOTS_MAP, 'utf-8'));
    m.language             = m.language             ?? 'en';
    m.max_session_messages = Math.max(0, Number(m.max_session_messages ?? 3));
    m.pending              = m.pending              ?? [];
    m.sessions             = m.sessions             ?? {};
    m.message_counts       = m.message_counts       ?? {};
    m.bot_personas         = m.bot_personas && typeof m.bot_personas === 'object' ? m.bot_personas : {};
    return m;
  } catch { return { known_bots: [], language: 'en', max_session_messages: 3, pending: [], sessions: {}, message_counts: {}, bot_personas: {} }; }
}

function writeMap(m) {
  try { writeFileSync(BOTS_MAP, JSON.stringify(m, null, 2), 'utf-8'); } catch {}
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  let payload = {};
  try { payload = JSON.parse(raw); } catch { payload = { raw }; }

  const sessionId = String(
    payload.session_id ?? payload.conversation_id ?? payload.sessionId ?? 'default'
  );

  if (EVENT_TYPE === 'pre_agent_spawn') {
    // Orchestrator is about to spawn a subagent — detect bot name and task title from prompt
    const prompt = String(payload.tool_input?.prompt ?? '');
    // The Agent tool's description field is a short task title (e.g. "Task 1: Pull and clean raw data")
    const taskTitle = String(payload.tool_input?.description ?? '').trim().slice(0, 80);
    const map = readMap();
    if (map.max_session_messages === 0) { clearTimeout(watchdog); process.exit(0); }
    const botName = findBotInText(prompt || taskTitle, map.known_bots);
    if (botName) {
      map.pending.push({ botName, taskTitle });
      writeMap(map);
    }

  } else if (EVENT_TYPE === 'subagent_start') {
    // New subagent started — pop from pending queue, assign to this session
    const map = readMap();
    if (map.max_session_messages === 0) { clearTimeout(watchdog); process.exit(0); }
    // pending entries are { botName, taskTitle } objects (or legacy plain strings)
    const pending = map.pending.shift();
    const botName = (typeof pending === 'object' ? pending?.botName : pending)
      ?? findBotInText(raw, map.known_bots);
    const taskTitle = (typeof pending === 'object' ? pending?.taskTitle : '') ?? '';
    if (!botName) { clearTimeout(watchdog); process.exit(0); }

    map.sessions[sessionId] = { botName, taskTitle };
    writeMap(map);

    const persona = map.bot_personas?.[botName];
    const startMessage = await narrateStatus('subagent_start', botName, map.language, taskTitle, persona);
    await postNarrator({
      event: 'subagent_start',
      bot_name: botName,
      session_id: sessionId,
      message: startMessage,
    });

  } else if (EVENT_TYPE === 'subagent_stop') {
    const map = readMap();
    if (map.max_session_messages === 0) {
      const session = map.sessions[sessionId];
      if (session) {
        delete map.sessions[sessionId];
        delete map.message_counts[sessionId];
        writeMap(map);
      }
      clearTimeout(watchdog); process.exit(0);
    }
    const session = map.sessions[sessionId];
    // session entries are { botName, taskTitle } objects (or legacy plain strings)
    const botName = typeof session === 'object' ? session?.botName : session;
    const taskTitle = typeof session === 'object' ? (session?.taskTitle ?? '') : '';
    if (botName) {
      const persona = map.bot_personas?.[botName];
      const stopMessage = await narrateStatus('subagent_stop', botName, map.language, taskTitle, persona);
      await postNarrator({
        event: 'subagent_stop',
        bot_name: botName,
        session_id: sessionId,
        message: stopMessage,
      });
      delete map.sessions[sessionId];
      delete map.message_counts[sessionId];
      writeMap(map);
    }

  } else if (EVENT_TYPE === 'post_tool_use') {
    const map = readMap();
    if (map.max_session_messages === 0) { clearTimeout(watchdog); process.exit(0); }
    const session = map.sessions[sessionId];
    const botName = typeof session === 'object' ? session?.botName : session;
    if (!botName) { clearTimeout(watchdog); process.exit(0); }

    const toolName = String(payload.tool_name ?? payload.toolName ?? '');
    if (!toolName || SKIP_TOOLS.has(toolName) || isHotelMcpTool(toolName)) {
      clearTimeout(watchdog); process.exit(0);
    }

    // Per-session message threshold — prevent runaway narration spam
    const count = map.message_counts[sessionId] ?? 0;
    if (count >= map.max_session_messages) {
      clearTimeout(watchdog); process.exit(0);
    }

    const persona = map.bot_personas?.[botName];
    const message = await narrate(botName, toolName, payload.tool_input ?? {}, map.language, persona);
    if (!message) { clearTimeout(watchdog); process.exit(0); }

    map.message_counts[sessionId] = count + 1;
    writeMap(map);

    await postNarrator({
      event: 'post_tool_use',
      bot_name: botName,
      session_id: sessionId,
      tool_name: toolName,
      message,
    });
  }

  clearTimeout(watchdog);
  process.exit(0);
}

// ── Localized status messages (fallback when Haiku unavailable) ───────────────

const STATUS_MESSAGES = {
  subagent_start: {
    nl: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) via ${n} is klaar voor de taak.`
      : `${n} is aangemeld en klaar voor de taak.`,
    en: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) via ${n} is signed in and ready.`
      : `${n} has signed in and is ready for the task.`,
    de: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) via ${n} ist angemeldet und bereit.`
      : `${n} hat sich angemeldet und ist bereit für die Aufgabe.`,
    fr: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) via ${n} est connecté et prêt.`
      : `${n} s'est connecté et est prêt pour la tâche.`,
    es: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) vía ${n} está listo para la tarea.`
      : `${n} se ha registrado y está listo para la tarea.`,
    it: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) via ${n} è pronto per il compito.`
      : `${n} ha effettuato l'accesso ed è pronto per il compito.`,
    pt: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) via ${n} está pronto para a tarefa.`
      : `${n} entrou e está pronto para a tarefa.`,
    pl: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) przez ${n} jest gotowy do zadania.`
      : `${n} zalogował się i jest gotowy do zadania.`,
    tr: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) — ${n} göreve hazır.`
      : `${n} giriş yaptı ve göreve hazır.`,
    sv: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) via ${n} är redo för uppgiften.`
      : `${n} har loggat in och är redo för uppgiften.`,
  },
  subagent_stop: {
    nl: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) via ${n} heeft de taak afgerond.`
      : `${n} heeft de taak afgerond.`,
    en: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) via ${n} has completed the task.`
      : `${n} has completed the task.`,
    de: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) via ${n} hat die Aufgabe abgeschlossen.`
      : `${n} hat die Aufgabe abgeschlossen.`,
    fr: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) via ${n} a terminé la tâche.`
      : `${n} a terminé la tâche.`,
    es: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) vía ${n} ha completado la tarea.`
      : `${n} ha completado la tarea.`,
    it: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) via ${n} ha completato il compito.`
      : `${n} ha completato il compito.`,
    pt: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) via ${n} concluiu a tarefa.`
      : `${n} concluiu a tarefa.`,
    pl: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) przez ${n} ukończył zadanie.`
      : `${n} ukończył zadanie.`,
    tr: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) — ${n} görevi tamamladı.`
      : `${n} görevi tamamladı.`,
    sv: (n, p) => p
      ? `${p.persona_name} (${p.persona_role}) via ${n} har slutfört uppgiften.`
      : `${n} har slutfört uppgiften.`,
  },
};

// Haiku prompts for start/stop events — key: "<event>.<lang>"
// (n) = bot name, (t) = task title (may be empty string)
const STATUS_HAIKU_PROMPTS = {
  subagent_start: {
    nl: (n, t, persona) => {
      if (persona) {
        return t
          ? `Jij bent ${n}, Habbo bot. Je speelt ${persona.persona_name} (${persona.persona_role}). Je begint met: "${t}". Schrijf in max 10 woorden wat je gaat doen. Eerste persoon, in rol, geen aanhalingstekens.`
          : `Jij bent ${n}, Habbo bot. Je speelt ${persona.persona_name} (${persona.persona_role}). Schrijf in max 10 woorden wat je nu gaat doen. Eerste persoon, in rol, geen aanhalingstekens.`;
      }
      return t
        ? `Jij bent ${n}, een Habbo Hotel bot. Je begint nu met: "${t}". Schrijf in MAXIMAAL 10 woorden wat je gaat doen. Eerste persoon, geen aanhalingstekens.`
        : `Jij bent ${n}, een Habbo Hotel bot die net online is gekomen. Schrijf in MAXIMAAL 10 woorden wat je nu gaat doen. Eerste persoon, geen aanhalingstekens.`;
    },
    en: (n, t, persona) => {
      if (persona) {
        return t
          ? `You are ${n}, a Habbo bot. You play ${persona.persona_name} (${persona.persona_role}). Starting: "${t}". Write in MAX 10 words what you will do. First person, in role, no quotes.`
          : `You are ${n}, a Habbo bot. You play ${persona.persona_name} (${persona.persona_role}). Write in MAX 10 words what you are about to do. First person, in role, no quotes.`;
      }
      return t
        ? `You are ${n}, a Habbo Hotel bot. Your task: "${t}". Write in MAX 10 words what you are about to do. First person, no quotes.`
        : `You are ${n}, a Habbo Hotel bot who just came online. Write in MAX 10 words what you are about to do. First person, no quotes.`;
    },
    de: (n, t, persona) => {
      if (persona) {
        return t
          ? `Du bist ${n}, Habbo-Bot. Du spielst ${persona.persona_name} (${persona.persona_role}). Start: "${t}". Schreibe in MAX 10 Wörtern, was du tun wirst. Erste Person, in Rolle, keine Anführungszeichen.`
          : `Du bist ${n}, Habbo-Bot. Du spielst ${persona.persona_name} (${persona.persona_role}). Schreibe in MAX 10 Wörtern, was du tun wirst. Erste Person, in Rolle, keine Anführungszeichen.`;
      }
      return t
        ? `Du bist ${n}, ein Habbo Hotel Bot. Deine Aufgabe: "${t}". Schreibe in MAX 10 Wörtern, was du jetzt tun wirst. Erste Person, keine Anführungszeichen.`
        : `Du bist ${n}, ein Habbo Hotel Bot, der gerade online gekommen ist. Schreibe in MAX 10 Wörtern, was du jetzt tun wirst. Erste Person, keine Anführungszeichen.`;
    },
    fr: (n, t, persona) => {
      if (persona) {
        return t
          ? `Tu es ${n}, bot Habbo. Tu joues ${persona.persona_name} (${persona.persona_role}). Début : "${t}". Écris en MAX 10 mots ce que tu vas faire. Première personne, dans le rôle, sans guillemets.`
          : `Tu es ${n}, bot Habbo. Tu joues ${persona.persona_name} (${persona.persona_role}). Écris en MAX 10 mots ce que tu vas faire. Première personne, dans le rôle, sans guillemets.`;
      }
      return t
        ? `Tu es ${n}, un bot Habbo Hotel. Ta tâche : "${t}". Écris en MAX 10 mots ce que tu vas faire. Première personne, sans guillemets.`
        : `Tu es ${n}, un bot Habbo Hotel qui vient de se connecter. Écris en MAX 10 mots ce que tu vas faire. Première personne, sans guillemets.`;
    },
    es: (n, t, persona) => {
      if (persona) {
        return t
          ? `Eres ${n}, bot Habbo. Representas a ${persona.persona_name} (${persona.persona_role}). Empiezas con: "${t}". Escribe en MÁX 10 palabras qué harás. Primera persona, en rol, sin comillas.`
          : `Eres ${n}, bot Habbo. Representas a ${persona.persona_name} (${persona.persona_role}). Escribe en MÁX 10 palabras qué harás. Primera persona, en rol, sin comillas.`;
      }
      return t
        ? `Eres ${n}, un bot de Habbo Hotel. Tu tarea: "${t}". Escribe en MÁX 10 palabras lo que vas a hacer. Primera persona, sin comillas.`
        : `Eres ${n}, un bot de Habbo Hotel que acaba de conectarse. Escribe en MÁX 10 palabras lo que vas a hacer. Primera persona, sin comillas.`;
    },
    it: (n, t, persona) => {
      if (persona) {
        return t
          ? `Sei ${n}, bot Habbo. Interpreti ${persona.persona_name} (${persona.persona_role}). Inizio: "${t}". Scrivi in MAX 10 parole cosa farai. Prima persona, nel ruolo, senza virgolette.`
          : `Sei ${n}, bot Habbo. Interpreti ${persona.persona_name} (${persona.persona_role}). Scrivi in MAX 10 parole cosa farai. Prima persona, nel ruolo, senza virgolette.`;
      }
      return t
        ? `Sei ${n}, un bot di Habbo Hotel. Il tuo compito: "${t}". Scrivi in MAX 10 parole cosa farai. Prima persona, senza virgolette.`
        : `Sei ${n}, un bot di Habbo Hotel appena connesso. Scrivi in MAX 10 parole cosa farai. Prima persona, senza virgolette.`;
    },
    pt: (n, t, persona) => {
      if (persona) {
        return t
          ? `Você é ${n}, bot Habbo. Você interpreta ${persona.persona_name} (${persona.persona_role}). Começo: "${t}". Escreva em MÁX 10 palavras o que fará. Primeira pessoa, no papel, sem aspas.`
          : `Você é ${n}, bot Habbo. Você interpreta ${persona.persona_name} (${persona.persona_role}). Escreva em MÁX 10 palavras o que fará. Primeira pessoa, no papel, sem aspas.`;
      }
      return t
        ? `Você é ${n}, um bot do Habbo Hotel. Sua tarefa: "${t}". Escreva em MÁX 10 palavras o que vai fazer. Primeira pessoa, sem aspas.`
        : `Você é ${n}, um bot do Habbo Hotel que acabou de se conectar. Escreva em MÁX 10 palavras o que vai fazer. Primeira pessoa, sem aspas.`;
    },
    pl: (n, t, persona) => {
      if (persona) {
        return t
          ? `Jesteś ${n}, botem Habbo. Grasz ${persona.persona_name} (${persona.persona_role}). Start: "${t}". Napisz w MAX 10 słowach, co zrobisz. Pierwsza osoba, w roli, bez cudzysłowów.`
          : `Jesteś ${n}, botem Habbo. Grasz ${persona.persona_name} (${persona.persona_role}). Napisz w MAX 10 słowach, co zrobisz. Pierwsza osoba, w roli, bez cudzysłowów.`;
      }
      return t
        ? `Jesteś ${n}, botem Habbo Hotel. Twoje zadanie: "${t}". Napisz w MAX 10 słowach, co zamierzasz zrobić. Pierwsza osoba, bez cudzysłowów.`
        : `Jesteś ${n}, botem Habbo Hotel, który właśnie się połączył. Napisz w MAX 10 słowach, co zamierzasz zrobić. Pierwsza osoba, bez cudzysłowów.`;
    },
    tr: (n, t, persona) => {
      if (persona) {
        return t
          ? `Sen ${n}, Habbo botusun. Rol: ${persona.persona_name} (${persona.persona_role}). Başlangıç: "${t}". MAX 10 kelimeyle ne yapacağını yaz. Birinci şahıs, rolde, tırnak yok.`
          : `Sen ${n}, Habbo botusun. Rol: ${persona.persona_name} (${persona.persona_role}). MAX 10 kelimeyle ne yapacağını yaz. Birinci şahıs, rolde, tırnak yok.`;
      }
      return t
        ? `Sen ${n}, Habbo Hotel botusun. Görevin: "${t}". MAX 10 kelimeyle ne yapacağını yaz. Birinci şahıs, tırnak işareti yok.`
        : `Sen ${n}, Habbo Hotel botu olarak yeni bağlandın. MAX 10 kelimeyle ne yapacağını yaz. Birinci şahıs, tırnak işareti yok.`;
    },
    sv: (n, t, persona) => {
      if (persona) {
        return t
          ? `Du är ${n}, Habbo-bot. Du spelar ${persona.persona_name} (${persona.persona_role}). Start: "${t}". Skriv med MAX 10 ord vad du ska göra. Första person, i rollen, inga citattecken.`
          : `Du är ${n}, Habbo-bot. Du spelar ${persona.persona_name} (${persona.persona_role}). Skriv med MAX 10 ord vad du ska göra. Första person, i rollen, inga citattecken.`;
      }
      return t
        ? `Du är ${n}, en Habbo Hotel-bot. Din uppgift: "${t}". Skriv med MAX 10 ord vad du ska göra. Första person, inga citattecken.`
        : `Du är ${n}, en Habbo Hotel-bot som precis kom online. Skriv med MAX 10 ord vad du ska göra. Första person, inga citattecken.`;
    },
  },
  subagent_stop: {
    nl: (n, t, persona) => {
      if (persona) {
        return t
          ? `Jij bent ${n}, Habbo bot. Je speelt ${persona.persona_name} (${persona.persona_role}). Je hebt afgerond: "${t}". Schrijf in max 10 woorden een afsluitende opmerking. Eerste persoon, in rol, geen aanhalingstekens.`
          : `Jij bent ${n}, Habbo bot. Je speelt ${persona.persona_name} (${persona.persona_role}). Schrijf in max 10 woorden een afsluitende opmerking. Eerste persoon, in rol, geen aanhalingstekens.`;
      }
      return t
        ? `Jij bent ${n}, een Habbo Hotel bot. Je hebt zojuist afgerond: "${t}". Schrijf in MAXIMAAL 10 woorden een afsluitende opmerking. Eerste persoon, geen aanhalingstekens.`
        : `Jij bent ${n}, een Habbo Hotel bot die de taak heeft afgerond. Schrijf in MAXIMAAL 10 woorden een afsluitende opmerking. Eerste persoon, geen aanhalingstekens.`;
    },
    en: (n, t, persona) => {
      if (persona) {
        return t
          ? `You are ${n}, a Habbo bot. You play ${persona.persona_name} (${persona.persona_role}). You just finished: "${t}". Write in MAX 10 words a closing remark. First person, in role, no quotes.`
          : `You are ${n}, a Habbo bot. You play ${persona.persona_name} (${persona.persona_role}). Write in MAX 10 words a closing remark. First person, in role, no quotes.`;
      }
      return t
        ? `You are ${n}, a Habbo Hotel bot. You just finished: "${t}". Write in MAX 10 words a closing remark. First person, no quotes.`
        : `You are ${n}, a Habbo Hotel bot who just finished the task. Write in MAX 10 words a closing remark. First person, no quotes.`;
    },
    de: (n, t, persona) => {
      if (persona) {
        return t
          ? `Du bist ${n}, Habbo-Bot. Du spielst ${persona.persona_name} (${persona.persona_role}). Gerade abgeschlossen: "${t}". Schreibe in MAX 10 Wörtern einen Abschluss. Erste Person, in Rolle, keine Anführungszeichen.`
          : `Du bist ${n}, Habbo-Bot. Du spielst ${persona.persona_name} (${persona.persona_role}). Schreibe in MAX 10 Wörtern einen Abschluss. Erste Person, in Rolle, keine Anführungszeichen.`;
      }
      return t
        ? `Du bist ${n}, ein Habbo Hotel Bot. Du hast gerade abgeschlossen: "${t}". Schreibe in MAX 10 Wörtern eine abschließende Bemerkung. Erste Person, keine Anführungszeichen.`
        : `Du bist ${n}, ein Habbo Hotel Bot, der die Aufgabe beendet hat. Schreibe in MAX 10 Wörtern eine abschließende Bemerkung. Erste Person, keine Anführungszeichen.`;
    },
    fr: (n, t, persona) => {
      if (persona) {
        return t
          ? `Tu es ${n}, bot Habbo. Tu joues ${persona.persona_name} (${persona.persona_role}). Tu viens de terminer : "${t}". Écris en MAX 10 mots une conclusion. Première personne, dans le rôle, sans guillemets.`
          : `Tu es ${n}, bot Habbo. Tu joues ${persona.persona_name} (${persona.persona_role}). Écris en MAX 10 mots une conclusion. Première personne, dans le rôle, sans guillemets.`;
      }
      return t
        ? `Tu es ${n}, un bot Habbo Hotel. Tu viens de terminer : "${t}". Écris en MAX 10 mots une remarque de clôture. Première personne, sans guillemets.`
        : `Tu es ${n}, un bot Habbo Hotel qui vient de terminer la tâche. Écris en MAX 10 mots une remarque de clôture. Première personne, sans guillemets.`;
    },
    es: (n, t, persona) => {
      if (persona) {
        return t
          ? `Eres ${n}, bot Habbo. Representas a ${persona.persona_name} (${persona.persona_role}). Acabas de terminar: "${t}". Escribe en MÁX 10 palabras un cierre. Primera persona, en rol, sin comillas.`
          : `Eres ${n}, bot Habbo. Representas a ${persona.persona_name} (${persona.persona_role}). Escribe en MÁX 10 palabras un cierre. Primera persona, en rol, sin comillas.`;
      }
      return t
        ? `Eres ${n}, un bot de Habbo Hotel. Acabas de terminar: "${t}". Escribe en MÁX 10 palabras una observación final. Primera persona, sin comillas.`
        : `Eres ${n}, un bot de Habbo Hotel que acaba de terminar la tarea. Escribe en MÁX 10 palabras una observación final. Primera persona, sin comillas.`;
    },
    it: (n, t, persona) => {
      if (persona) {
        return t
          ? `Sei ${n}, bot Habbo. Interpreti ${persona.persona_name} (${persona.persona_role}). Hai appena completato: "${t}". Scrivi in MAX 10 parole un commento finale. Prima persona, nel ruolo, senza virgolette.`
          : `Sei ${n}, bot Habbo. Interpreti ${persona.persona_name} (${persona.persona_role}). Scrivi in MAX 10 parole un commento finale. Prima persona, nel ruolo, senza virgolette.`;
      }
      return t
        ? `Sei ${n}, un bot di Habbo Hotel. Hai appena completato: "${t}". Scrivi in MAX 10 parole un commento finale. Prima persona, senza virgolette.`
        : `Sei ${n}, un bot di Habbo Hotel che ha appena terminato il compito. Scrivi in MAX 10 parole un commento finale. Prima persona, senza virgolette.`;
    },
    pt: (n, t, persona) => {
      if (persona) {
        return t
          ? `Você é ${n}, bot Habbo. Você interpreta ${persona.persona_name} (${persona.persona_role}). Acabou de concluir: "${t}". Escreva em MÁX 10 palavras um fechamento. Primeira pessoa, no papel, sem aspas.`
          : `Você é ${n}, bot Habbo. Você interpreta ${persona.persona_name} (${persona.persona_role}). Escreva em MÁX 10 palavras um fechamento. Primeira pessoa, no papel, sem aspas.`;
      }
      return t
        ? `Você é ${n}, um bot do Habbo Hotel. Você acabou de concluir: "${t}". Escreva em MÁX 10 palavras um comentário final. Primeira pessoa, sem aspas.`
        : `Você é ${n}, um bot do Habbo Hotel que acabou de terminar a tarefa. Escreva em MÁX 10 palavras um comentário final. Primeira pessoa, sem aspas.`;
    },
    pl: (n, t, persona) => {
      if (persona) {
        return t
          ? `Jesteś ${n}, botem Habbo. Grasz ${persona.persona_name} (${persona.persona_role}). Właśnie ukończyłeś: "${t}". Napisz w MAX 10 słowach podsumowanie. Pierwsza osoba, w roli, bez cudzysłowów.`
          : `Jesteś ${n}, botem Habbo. Grasz ${persona.persona_name} (${persona.persona_role}). Napisz w MAX 10 słowach podsumowanie. Pierwsza osoba, w roli, bez cudzysłowów.`;
      }
      return t
        ? `Jesteś ${n}, botem Habbo Hotel. Właśnie ukończyłeś: "${t}". Napisz w MAX 10 słowach końcową uwagę. Pierwsza osoba, bez cudzysłowów.`
        : `Jesteś ${n}, botem Habbo Hotel, który właśnie zakończył zadanie. Napisz w MAX 10 słowach końcową uwagę. Pierwsza osoba, bez cudzysłowów.`;
    },
    tr: (n, t, persona) => {
      if (persona) {
        return t
          ? `Sen ${n}, Habbo botusun. Rol: ${persona.persona_name} (${persona.persona_role}). Tamamladın: "${t}". MAX 10 kelimeyle kapanış yaz. Birinci şahıs, rolde, tırnak yok.`
          : `Sen ${n}, Habbo botusun. Rol: ${persona.persona_name} (${persona.persona_role}). MAX 10 kelimeyle kapanış yaz. Birinci şahıs, rolde, tırnak yok.`;
      }
      return t
        ? `Sen ${n}, Habbo Hotel botusun. Şunu tamamladın: "${t}". MAX 10 kelimeyle kapanış yorumu yaz. Birinci şahıs, tırnak işareti yok.`
        : `Sen ${n}, Habbo Hotel botu olarak görevi tamamladın. MAX 10 kelimeyle kapanış yorumu yaz. Birinci şahıs, tırnak işareti yok.`;
    },
    sv: (n, t, persona) => {
      if (persona) {
        return t
          ? `Du är ${n}, Habbo-bot. Du spelar ${persona.persona_name} (${persona.persona_role}). Du har avslutat: "${t}". Skriv med MAX 10 ord en avslutande kommentar. Första person, i rollen, inga citattecken.`
          : `Du är ${n}, Habbo-bot. Du spelar ${persona.persona_name} (${persona.persona_role}). Skriv med MAX 10 ord en avslutande kommentar. Första person, i rollen, inga citattecken.`;
      }
      return t
        ? `Du är ${n}, en Habbo Hotel-bot. Du har just avslutat: "${t}". Skriv med MAX 10 ord en avslutande kommentar. Första person, inga citattecken.`
        : `Du är ${n}, en Habbo Hotel-bot som precis slutfört uppgiften. Skriv med MAX 10 ord en avslutande kommentar. Första person, inga citattecken.`;
    },
  },
};

async function narrateStatus(event, botName, lang = 'en', taskTitle = '', persona) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const promptFn = STATUS_HAIKU_PROMPTS[event]?.[lang] ?? STATUS_HAIKU_PROMPTS[event]?.['en'];
    if (promptFn) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 50,
            messages: [{ role: 'user', content: promptFn(botName, taskTitle, persona) }],
          }),
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.content?.[0]?.text?.trim()?.slice(0, 240);
          if (text) return text;
        }
      } catch { /* fall through to static fallback */ }
    }
  }
  const fallbackFn = STATUS_MESSAGES[event]?.[lang] ?? STATUS_MESSAGES[event]?.['en'];
  return fallbackFn ? fallbackFn(botName, persona) : `${botName} ${event.replace('_', ' ')}.`;
}

// ── Bot name detection ────────────────────────────────────────────────────────

function findBotInText(text, knownBots = []) {
  if (!text || !knownBots.length) return null;
  // Prefer the explicit assignment line injected by agent-trigger:
  //   Your hotel bot name is "Ariatje".
  // This prevents false matches when other bots' names appear in task context.
  const explicit = text.match(/your hotel bot name is[:\s]+"([^"]+)"/i);
  if (explicit) {
    const assigned = explicit[1].trim();
    const match = knownBots.find(n => n.toLowerCase() === assigned.toLowerCase());
    if (match) return match;
  }
  // Fallback: first known bot name found anywhere in the text
  const lower = text.toLowerCase();
  return knownBots.find(name => lower.includes(name.toLowerCase())) ?? null;
}

// ── Narration ─────────────────────────────────────────────────────────────────

async function narrate(botName, toolName, toolInput, lang = 'en', persona) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const result = await callHaiku(apiKey, botName, toolName, toolInput, lang, persona);
    if (result) return result;
  }
  const fallback = getFallback(lang);
  const tpl = fallback[toolName];
  return tpl ? tpl(botName, toolInput, persona) : null;
}

const HAIKU_LANG_INSTRUCTIONS = {
  nl: (n, persona) => persona
    ? `Jij bent ${n}. Je rol: ${persona.persona_name}, ${persona.persona_role}. Vertel in max 12 woorden wat je doet. Geen aanhalingstekens.`
    : `Jij bent ${n}, een Habbo Hotel bot. Spreek in eerste persoon.\nVertel in MAXIMAAL 12 woorden wat je nu doet. Geen aanhalingstekens.`,
  en: (n, persona) => persona
    ? `You are ${n}. Your role: ${persona.persona_name}, ${persona.persona_role}. Describe in MAX 12 words what you are doing. No quotes.`
    : `You are ${n}, a Habbo Hotel bot. Speak in first person.\nDescribe in MAX 12 words what you are doing right now. No quotes.`,
  de: (n, persona) => persona
    ? `Du bist ${n}. Deine Rolle: ${persona.persona_name}, ${persona.persona_role}. Beschreibe in MAX 12 Wörtern, was du tust. Keine Anführungszeichen.`
    : `Du bist ${n}, ein Habbo Hotel Bot. Sprich in der ersten Person.\nBeschreibe in MAX 12 Wörtern, was du gerade tust. Keine Anführungszeichen.`,
  fr: (n, persona) => persona
    ? `Tu es ${n}. Ton rôle : ${persona.persona_name}, ${persona.persona_role}. Décris en MAX 12 mots ce que tu fais. Pas de guillemets.`
    : `Tu es ${n}, un bot Habbo Hotel. Parle à la première personne.\nDécris en MAX 12 mots ce que tu fais maintenant. Pas de guillemets.`,
  es: (n, persona) => persona
    ? `Eres ${n}. Tu rol: ${persona.persona_name}, ${persona.persona_role}. Describe en MÁX 12 palabras lo que haces. Sin comillas.`
    : `Eres ${n}, un bot de Habbo Hotel. Habla en primera persona.\nDescribe en MÁX 12 palabras lo que estás haciendo ahora. Sin comillas.`,
  it: (n, persona) => persona
    ? `Sei ${n}. Il tuo ruolo: ${persona.persona_name}, ${persona.persona_role}. Descrivi in MAX 12 parole cosa stai facendo. Senza virgolette.`
    : `Sei ${n}, un bot di Habbo Hotel. Parla in prima persona.\nDescrivi in MAX 12 parole cosa stai facendo adesso. Senza virgolette.`,
  pt: (n, persona) => persona
    ? `Você é ${n}. Seu papel: ${persona.persona_name}, ${persona.persona_role}. Descreva em MÁX 12 palavras o que está fazendo. Sem aspas.`
    : `Você é ${n}, um bot do Habbo Hotel. Fale na primeira pessoa.\nDescreva em MÁX 12 palavras o que está fazendo agora. Sem aspas.`,
  pl: (n, persona) => persona
    ? `Jesteś ${n}. Twoja rola: ${persona.persona_name}, ${persona.persona_role}. Opisz w MAX 12 słowach, co robisz. Bez cudzysłowów.`
    : `Jesteś ${n}, botem Habbo Hotel. Mów w pierwszej osobie.\nOpisz w MAX 12 słowach, co teraz robisz. Bez cudzysłowów.`,
  tr: (n, persona) => persona
    ? `Sen ${n}. Rolün: ${persona.persona_name}, ${persona.persona_role}. Şu anda ne yaptığını MAX 12 kelimeyle anlat. Tırnak yok.`
    : `Sen ${n}, Habbo Hotel botusun. Birinci şahıs olarak konuş.\nŞu anda ne yaptığını MAX 12 kelimeyle anlat. Tırnak işareti yok.`,
  sv: (n, persona) => persona
    ? `Du är ${n}. Din roll: ${persona.persona_name}, ${persona.persona_role}. Beskriv med MAX 12 ord vad du gör. Inga citattecken.`
    : `Du är ${n}, en Habbo Hotel-bot. Tala i första person.\nBeskriv med MAX 12 ord vad du gör just nu. Inga citattecken.`,
};

async function callHaiku(apiKey, botName, toolName, toolInput, lang = 'en', persona) {
  let detail = '';
  try {
    const i = typeof toolInput === 'object' && toolInput !== null ? toolInput : {};
    detail = String(i.command ?? i.file_path ?? i.path ?? i.url ?? i.prompt ?? i.query ?? '').slice(0, 80);
  } catch {}

  const instrFn = HAIKU_LANG_INSTRUCTIONS[lang] ?? HAIKU_LANG_INSTRUCTIONS['en'];
  const prompt = instrFn(botName, persona) + `\nTool: ${toolName}${detail ? `\nDetail: ${detail}` : ''}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 50,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.content?.[0]?.text?.trim()?.slice(0, 240) || null;
  } catch { return null; }
}

// ── POST to agent-trigger /narrator ──────────────────────────────────────────

async function postNarrator(body) {
  const userMcpToken = process.env.USER_MCP_TOKEN || '';
  try {
    await fetch(NARRATOR_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...body,
        ...(userMcpToken ? { mcp_token: userMcpToken } : {}),
        ...(ROOM_ID ? { room_id: Number(ROOM_ID) } : {}),
      }),
      signal: AbortSignal.timeout(1500),
    });
  } catch { /* best effort */ }
}

// ── Run ──────────────────────────────────────────────────────────────────────

main().catch(() => { clearTimeout(watchdog); process.exit(0); });
