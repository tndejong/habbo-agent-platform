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
const FALLBACK_TEMPLATES = {
  nl: {
    Write:       (n, i) => `${n} schrijft naar ${tail(i?.file_path ?? 'een bestand')}.`,
    Edit:        (n, i) => `${n} past ${tail(i?.file_path ?? 'een bestand')} aan.`,
    Bash:        (n, i) => `${n} voert uit: ${String(i?.command ?? '').slice(0, 50)}.`,
    WebFetch:    (n)    => `${n} zoekt informatie op het internet.`,
    WebSearch:   (n)    => `${n} doorzoekt het web.`,
    NotebookEdit:(n)    => `${n} werkt een notebook bij.`,
  },
  en: {
    Write:       (n, i) => `${n} is writing to ${tail(i?.file_path ?? 'a file')}.`,
    Edit:        (n, i) => `${n} is editing ${tail(i?.file_path ?? 'a file')}.`,
    Bash:        (n, i) => `${n} runs: ${String(i?.command ?? '').slice(0, 50)}.`,
    WebFetch:    (n)    => `${n} is looking up information online.`,
    WebSearch:   (n)    => `${n} is searching the web.`,
    NotebookEdit:(n)    => `${n} is updating a notebook.`,
  },
  de: {
    Write:       (n, i) => `${n} schreibt nach ${tail(i?.file_path ?? 'einer Datei')}.`,
    Edit:        (n, i) => `${n} bearbeitet ${tail(i?.file_path ?? 'eine Datei')}.`,
    Bash:        (n, i) => `${n} führt aus: ${String(i?.command ?? '').slice(0, 50)}.`,
    WebFetch:    (n)    => `${n} sucht Informationen im Internet.`,
    WebSearch:   (n)    => `${n} durchsucht das Web.`,
    NotebookEdit:(n)    => `${n} aktualisiert ein Notizbuch.`,
  },
  fr: {
    Write:       (n, i) => `${n} écrit dans ${tail(i?.file_path ?? 'un fichier')}.`,
    Edit:        (n, i) => `${n} modifie ${tail(i?.file_path ?? 'un fichier')}.`,
    Bash:        (n, i) => `${n} exécute : ${String(i?.command ?? '').slice(0, 50)}.`,
    WebFetch:    (n)    => `${n} recherche des informations en ligne.`,
    WebSearch:   (n)    => `${n} parcourt le web.`,
    NotebookEdit:(n)    => `${n} met à jour un notebook.`,
  },
  es: {
    Write:       (n, i) => `${n} escribe en ${tail(i?.file_path ?? 'un archivo')}.`,
    Edit:        (n, i) => `${n} edita ${tail(i?.file_path ?? 'un archivo')}.`,
    Bash:        (n, i) => `${n} ejecuta: ${String(i?.command ?? '').slice(0, 50)}.`,
    WebFetch:    (n)    => `${n} busca información en línea.`,
    WebSearch:   (n)    => `${n} busca en la web.`,
    NotebookEdit:(n)    => `${n} actualiza un cuaderno.`,
  },
  it: {
    Write:       (n, i) => `${n} scrive su ${tail(i?.file_path ?? 'un file')}.`,
    Edit:        (n, i) => `${n} modifica ${tail(i?.file_path ?? 'un file')}.`,
    Bash:        (n, i) => `${n} esegue: ${String(i?.command ?? '').slice(0, 50)}.`,
    WebFetch:    (n)    => `${n} cerca informazioni online.`,
    WebSearch:   (n)    => `${n} effettua una ricerca sul web.`,
    NotebookEdit:(n)    => `${n} aggiorna un notebook.`,
  },
  pt: {
    Write:       (n, i) => `${n} escreve em ${tail(i?.file_path ?? 'um arquivo')}.`,
    Edit:        (n, i) => `${n} edita ${tail(i?.file_path ?? 'um arquivo')}.`,
    Bash:        (n, i) => `${n} executa: ${String(i?.command ?? '').slice(0, 50)}.`,
    WebFetch:    (n)    => `${n} procura informações online.`,
    WebSearch:   (n)    => `${n} pesquisa na web.`,
    NotebookEdit:(n)    => `${n} atualiza um notebook.`,
  },
  pl: {
    Write:       (n, i) => `${n} zapisuje do ${tail(i?.file_path ?? 'pliku')}.`,
    Edit:        (n, i) => `${n} edytuje ${tail(i?.file_path ?? 'plik')}.`,
    Bash:        (n, i) => `${n} uruchamia: ${String(i?.command ?? '').slice(0, 50)}.`,
    WebFetch:    (n)    => `${n} wyszukuje informacje w internecie.`,
    WebSearch:   (n)    => `${n} przeszukuje sieć.`,
    NotebookEdit:(n)    => `${n} aktualizuje notatnik.`,
  },
  tr: {
    Write:       (n, i) => `${n} şuraya yazıyor: ${tail(i?.file_path ?? 'dosya')}.`,
    Edit:        (n, i) => `${n} şunu düzenliyor: ${tail(i?.file_path ?? 'dosya')}.`,
    Bash:        (n, i) => `${n} çalıştırıyor: ${String(i?.command ?? '').slice(0, 50)}.`,
    WebFetch:    (n)    => `${n} internette bilgi arıyor.`,
    WebSearch:   (n)    => `${n} web'de arama yapıyor.`,
    NotebookEdit:(n)    => `${n} not defterini güncelliyor.`,
  },
  sv: {
    Write:       (n, i) => `${n} skriver till ${tail(i?.file_path ?? 'en fil')}.`,
    Edit:        (n, i) => `${n} redigerar ${tail(i?.file_path ?? 'en fil')}.`,
    Bash:        (n, i) => `${n} kör: ${String(i?.command ?? '').slice(0, 50)}.`,
    WebFetch:    (n)    => `${n} söker information online.`,
    WebSearch:   (n)    => `${n} söker på webben.`,
    NotebookEdit:(n)    => `${n} uppdaterar ett anteckningsblock.`,
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
    if (!existsSync(BOTS_MAP)) return { known_bots: [], language: 'en', max_session_messages: 3, pending: [], sessions: {}, message_counts: {} };
    const m = JSON.parse(readFileSync(BOTS_MAP, 'utf-8'));
    m.language            = m.language            ?? 'en';
    m.max_session_messages = Math.max(3, Number(m.max_session_messages) || 3);
    m.pending             = m.pending             ?? [];
    m.sessions            = m.sessions            ?? {};
    m.message_counts      = m.message_counts      ?? {};
    return m;
  } catch { return { known_bots: [], language: 'en', max_session_messages: 3, pending: [], sessions: {}, message_counts: {} }; }
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
    // Orchestrator is about to spawn a subagent — detect bot name from prompt
    const prompt = String(
      payload.tool_input?.prompt ?? payload.tool_input?.description ?? ''
    );
    const map = readMap();
    const botName = findBotInText(prompt, map.known_bots);
    if (botName) {
      map.pending.push(botName);
      writeMap(map);
    }

  } else if (EVENT_TYPE === 'subagent_start') {
    // New subagent started — pop from pending queue, assign to this session
    const map = readMap();
    // First try pending queue (most reliable), fall back to scanning raw payload
    const botName = map.pending.shift() ?? findBotInText(raw, map.known_bots);
    if (!botName) { clearTimeout(watchdog); process.exit(0); }

    map.sessions[sessionId] = botName;
    writeMap(map);

    const startMessage = await narrateStatus('subagent_start', botName, map.language);
    await postNarrator({
      event: 'subagent_start',
      bot_name: botName,
      session_id: sessionId,
      message: startMessage,
    });

  } else if (EVENT_TYPE === 'subagent_stop') {
    const map = readMap();
    const botName = map.sessions[sessionId];
    if (botName) {
      const stopMessage = await narrateStatus('subagent_stop', botName, map.language);
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
    const botName = map.sessions[sessionId];
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

    const message = await narrate(botName, toolName, payload.tool_input ?? {}, map.language);
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
    nl: (n) => `${n} is aangemeld en klaar voor de taak.`,
    en: (n) => `${n} has signed in and is ready for the task.`,
    de: (n) => `${n} hat sich angemeldet und ist bereit für die Aufgabe.`,
    fr: (n) => `${n} s'est connecté et est prêt pour la tâche.`,
    es: (n) => `${n} se ha registrado y está listo para la tarea.`,
    it: (n) => `${n} ha effettuato l'accesso ed è pronto per il compito.`,
    pt: (n) => `${n} entrou e está pronto para a tarefa.`,
    pl: (n) => `${n} zalogował się i jest gotowy do zadania.`,
    tr: (n) => `${n} giriş yaptı ve göreve hazır.`,
    sv: (n) => `${n} har loggat in och är redo för uppgiften.`,
  },
  subagent_stop: {
    nl: (n) => `${n} heeft de taak afgerond.`,
    en: (n) => `${n} has completed the task.`,
    de: (n) => `${n} hat die Aufgabe abgeschlossen.`,
    fr: (n) => `${n} a terminé la tâche.`,
    es: (n) => `${n} ha completado la tarea.`,
    it: (n) => `${n} ha completato il compito.`,
    pt: (n) => `${n} concluiu a tarefa.`,
    pl: (n) => `${n} ukończył zadanie.`,
    tr: (n) => `${n} görevi tamamladı.`,
    sv: (n) => `${n} har slutfört uppgiften.`,
  },
};

// Haiku prompts for start/stop events — key: "<event>.<lang>"
const STATUS_HAIKU_PROMPTS = {
  subagent_start: {
    nl: (n) => `Jij bent ${n}, een Habbo Hotel bot die net online is gekomen. Schrijf in MAXIMAAL 10 woorden wat je nu gaat doen. Eerste persoon, geen aanhalingstekens.`,
    en: (n) => `You are ${n}, a Habbo Hotel bot who just came online. Write in MAX 10 words what you are about to do. First person, no quotes.`,
    de: (n) => `Du bist ${n}, ein Habbo Hotel Bot, der gerade online gekommen ist. Schreibe in MAX 10 Wörtern, was du jetzt tun wirst. Erste Person, keine Anführungszeichen.`,
    fr: (n) => `Tu es ${n}, un bot Habbo Hotel qui vient de se connecter. Écris en MAX 10 mots ce que tu vas faire. Première personne, sans guillemets.`,
    es: (n) => `Eres ${n}, un bot de Habbo Hotel que acaba de conectarse. Escribe en MÁX 10 palabras lo que vas a hacer. Primera persona, sin comillas.`,
    it: (n) => `Sei ${n}, un bot di Habbo Hotel appena connesso. Scrivi in MAX 10 parole cosa farai. Prima persona, senza virgolette.`,
    pt: (n) => `Você é ${n}, um bot do Habbo Hotel que acabou de se conectar. Escreva em MÁX 10 palavras o que vai fazer. Primeira pessoa, sem aspas.`,
    pl: (n) => `Jesteś ${n}, botem Habbo Hotel, który właśnie się połączył. Napisz w MAX 10 słowach, co zamierzasz zrobić. Pierwsza osoba, bez cudzysłowów.`,
    tr: (n) => `Sen ${n}, Habbo Hotel botu olarak yeni bağlandın. MAX 10 kelimeyle ne yapacağını yaz. Birinci şahıs, tırnak işareti yok.`,
    sv: (n) => `Du är ${n}, en Habbo Hotel-bot som precis kom online. Skriv med MAX 10 ord vad du ska göra. Första person, inga citattecken.`,
  },
  subagent_stop: {
    nl: (n) => `Jij bent ${n}, een Habbo Hotel bot die de taak heeft afgerond. Schrijf in MAXIMAAL 10 woorden een afsluitende opmerking. Eerste persoon, geen aanhalingstekens.`,
    en: (n) => `You are ${n}, a Habbo Hotel bot who just finished the task. Write in MAX 10 words a closing remark. First person, no quotes.`,
    de: (n) => `Du bist ${n}, ein Habbo Hotel Bot, der die Aufgabe beendet hat. Schreibe in MAX 10 Wörtern eine abschließende Bemerkung. Erste Person, keine Anführungszeichen.`,
    fr: (n) => `Tu es ${n}, un bot Habbo Hotel qui vient de terminer la tâche. Écris en MAX 10 mots une remarque de clôture. Première personne, sans guillemets.`,
    es: (n) => `Eres ${n}, un bot de Habbo Hotel que acaba de terminar la tarea. Escribe en MÁX 10 palabras una observación final. Primera persona, sin comillas.`,
    it: (n) => `Sei ${n}, un bot di Habbo Hotel che ha appena terminato il compito. Scrivi in MAX 10 parole un commento finale. Prima persona, senza virgolette.`,
    pt: (n) => `Você é ${n}, um bot do Habbo Hotel que acabou de terminar a tarefa. Escreva em MÁX 10 palavras um comentário final. Primeira pessoa, sem aspas.`,
    pl: (n) => `Jesteś ${n}, botem Habbo Hotel, który właśnie zakończył zadanie. Napisz w MAX 10 słowach końcową uwagę. Pierwsza osoba, bez cudzysłowów.`,
    tr: (n) => `Sen ${n}, Habbo Hotel botu olarak görevi tamamladın. MAX 10 kelimeyle kapanış yorumu yaz. Birinci şahıs, tırnak işareti yok.`,
    sv: (n) => `Du är ${n}, en Habbo Hotel-bot som precis slutfört uppgiften. Skriv med MAX 10 ord en avslutande kommentar. Första person, inga citattecken.`,
  },
};

async function narrateStatus(event, botName, lang = 'en') {
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
            messages: [{ role: 'user', content: promptFn(botName) }],
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
  return fallbackFn ? fallbackFn(botName) : `${botName} ${event.replace('_', ' ')}.`;
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

async function narrate(botName, toolName, toolInput, lang = 'en') {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const result = await callHaiku(apiKey, botName, toolName, toolInput, lang);
    if (result) return result;
  }
  const fallback = getFallback(lang);
  const tpl = fallback[toolName];
  return tpl ? tpl(botName, toolInput) : null;
}

const HAIKU_LANG_INSTRUCTIONS = {
  nl: (n) => `Jij bent ${n}, een Habbo Hotel bot. Spreek in eerste persoon.\nVertel in MAXIMAAL 12 woorden wat je nu doet. Geen aanhalingstekens.`,
  en: (n) => `You are ${n}, a Habbo Hotel bot. Speak in first person.\nDescribe in MAX 12 words what you are doing right now. No quotes.`,
  de: (n) => `Du bist ${n}, ein Habbo Hotel Bot. Sprich in der ersten Person.\nBeschreibe in MAX 12 Wörtern, was du gerade tust. Keine Anführungszeichen.`,
  fr: (n) => `Tu es ${n}, un bot Habbo Hotel. Parle à la première personne.\nDécris en MAX 12 mots ce que tu fais maintenant. Pas de guillemets.`,
  es: (n) => `Eres ${n}, un bot de Habbo Hotel. Habla en primera persona.\nDescribe en MÁX 12 palabras lo que estás haciendo ahora. Sin comillas.`,
  it: (n) => `Sei ${n}, un bot di Habbo Hotel. Parla in prima persona.\nDescrivi in MAX 12 parole cosa stai facendo adesso. Senza virgolette.`,
  pt: (n) => `Você é ${n}, um bot do Habbo Hotel. Fale na primeira pessoa.\nDescreva em MÁX 12 palavras o que está fazendo agora. Sem aspas.`,
  pl: (n) => `Jesteś ${n}, botem Habbo Hotel. Mów w pierwszej osobie.\nOpisz w MAX 12 słowach, co teraz robisz. Bez cudzysłowów.`,
  tr: (n) => `Sen ${n}, Habbo Hotel botusun. Birinci şahıs olarak konuş.\nŞu anda ne yaptığını MAX 12 kelimeyle anlat. Tırnak işareti yok.`,
  sv: (n) => `Du är ${n}, en Habbo Hotel-bot. Tala i första person.\nBeskriv med MAX 12 ord vad du gör just nu. Inga citattecken.`,
};

async function callHaiku(apiKey, botName, toolName, toolInput, lang = 'en') {
  let detail = '';
  try {
    const i = typeof toolInput === 'object' && toolInput !== null ? toolInput : {};
    detail = String(i.command ?? i.file_path ?? i.path ?? i.url ?? i.prompt ?? i.query ?? '').slice(0, 80);
  } catch {}

  const instrFn = HAIKU_LANG_INSTRUCTIONS[lang] ?? HAIKU_LANG_INSTRUCTIONS['en'];
  const prompt = instrFn(botName) + `\nTool: ${toolName}${detail ? `\nDetail: ${detail}` : ''}`;

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
