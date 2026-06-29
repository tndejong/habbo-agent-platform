// MCP client — resolves user-enabled MCP servers, aggregates tools, routes calls.
// Used by agent-trigger and habbo-ai-service via portal internal API.

const TOOL_CACHE_TTL_MS = 60_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;
const TOOL_LIST_TIMEOUT_MS = 8_000;

// MCP session store — tracks initialized sessions per endpoint URL.
// The MCP HTTP protocol requires an initialize handshake before any other
// request. Some servers return a sessionId that must be included in subsequent
// requests, while others are stateless after initialization.
const mcpSessions = new Map();

function getOrCreateSession(url) {
  let session = mcpSessions.get(url);
  if (!session) {
    session = { initialized: false, sessionId: null };
    mcpSessions.set(url, session);
  }
  return session;
}

// Build JSON-RPC headers for an MCP HTTP request.
// Some servers (e.g. Atlassian) use Streamable HTTP and require
// text/event-stream in the Accept header.
function mcpHeaders(apiKey) {
  const h = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
  if (apiKey) h['Authorization'] = `Bearer ${apiKey}`;
  return h;
}

// Fetch from an MCP HTTP endpoint, handling both JSON and SSE (Streamable HTTP) responses.
async function mcpFetch(url, headers, body, timeoutMs) {
  const resp = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`MCP returned HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('text/event-stream')) {
    // Streamable HTTP — accumulate the SSE data event(s) and parse the JSON.
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let done = false;
    while (!done) {
      const { value, done: d } = await reader.read();
      done = d;
      if (value) buf += decoder.decode(value, { stream: !done });
    }
    // Extract the first JSON payload from SSE "data:" lines.
    for (const line of buf.split('\n')) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        return data.result ?? data;
      }
    }
    // Fallback: try parsing the whole body as JSON.
    return JSON.parse(buf);
  }
  return (await resp.json()).result;
}

async function ensureInitialized(url, apiKey) {
  const session = getOrCreateSession(url);
  if (session.initialized) return session;

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'habbo-agent-platform', version: '1.0' },
    },
  });
  const h = mcpHeaders(apiKey);

  const resp = await fetch(url, {
    method: 'POST',
    headers: h,
    body,
    signal: AbortSignal.timeout(8_000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`MCP initialize returned HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const ct = resp.headers.get('content-type') || '';
  let data;
  if (ct.includes('text/event-stream')) {
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', done = false;
    while (!done) {
      const { value, done: d } = await reader.read();
      done = d;
      if (value) buf += decoder.decode(value, { stream: !done });
    }
    for (const line of buf.split('\n')) {
      if (line.startsWith('data: ')) {
        data = JSON.parse(line.slice(6));
        break;
      }
    }
    data ??= JSON.parse(buf);
  } else {
    data = await resp.json();
  }

  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  const headerSessionId = resp.headers.get('x-mcp-session-id') || resp.headers.get('mcp-session-id');
  session.sessionId = data.result?.sessionId || headerSessionId || null;
  session.initialized = true;

  // Send initialized notification (no response expected).
  fetch(url, {
    method: 'POST',
    headers: { ...h, ...(session.sessionId ? { 'Mcp-Session-Id': session.sessionId } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {});

  return session;
}

// ── stdio MCP support ────────────────────────────────────────────────────────

import { spawn } from 'child_process';

// Spawn a stdio MCP process and send a JSON-RPC request, returning the result.
// Handles initialize handshake automatically. Kills the process after the request.
async function stdioJsonRpc(stdioConfig, method, params, timeoutMs) {
  const proc = spawn(stdioConfig.command, stdioConfig.args || [], {
    env: { ...process.env, ...(stdioConfig.env || {}) },
    stdio: ['pipe', 'pipe', 'inherit'],
    shell: true,
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`MCP stdio ${method} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    let buf = '';
    let initDone = false;
    let reqId = 0;

    function sendRequest(methodName, reqParams) {
      reqId++;
      const msg = JSON.stringify({ jsonrpc: '2.0', id: reqId, method: methodName, params: reqParams }) + '\n';
      proc.stdin.write(msg);
    }

    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (!initDone) {
            if (data.result && data.id === 1) {
              initDone = true;
              // Send initialized notification
              const notif = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n';
              proc.stdin.write(notif);
              // Now send the actual request
              if (method !== 'initialize') {
                sendRequest(method, params);
                continue;
              }
              clearTimeout(timer);
              proc.kill();
              resolve(data.result);
              return;
            }
            if (data.error) {
              clearTimeout(timer);
              proc.kill();
              reject(new Error(data.error.message || JSON.stringify(data.error)));
              return;
            }
            continue;
          }
          if (data.id === reqId) {
            clearTimeout(timer);
            proc.kill();
            if (data.error) {
              reject(new Error(data.error.message || JSON.stringify(data.error)));
            } else {
              resolve(data.result);
            }
            return;
          }
        } catch {}
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('exit', (code) => {
      clearTimeout(timer);
      if (!initDone) {
        reject(new Error(`MCP stdio process exited with code ${code} before initialize completed`));
      }
    });

    // Start with initialize
    sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'habbo-agent-platform', version: '1.0' },
    });
  });
}

export function createMcpClient({ db, decryptApiKey, MCP_ENDPOINT, MCP_API_KEY }) {
  // Per-user tool list cache (in-memory, lost on restart).
  const toolCache = new Map();

  function invalidateCache(portalUserId) {
    toolCache.delete(portalUserId);
  }

  async function getServers(portalUserId) {
    const [rows] = await db.execute(
      `SELECT id, name, url, api_key_encrypted, stdio_config_encrypted, enabled
       FROM portal_user_integrations
       WHERE portal_user_id = ? AND enabled = 1
       ORDER BY created_at ASC`,
      [portalUserId]
    );

    return rows.map(row => {
      if (row.stdio_config_encrypted) {
      return {
        id: row.id,
        name: row.name,
        type: 'stdio',
        url: null,
        api_key: null,
        stdio_config: JSON.parse(decryptApiKey(row.stdio_config_encrypted)),
      };
      }
      return {
        id: row.id,
        name: row.name,
        type: 'http',
        url: row.url,
        api_key: row.api_key_encrypted ? decryptApiKey(row.api_key_encrypted) : null,
        stdio_config: null,
      };
    });
  }

  // Fetch user's active MCP token for hotel-mcp auth.
  // The same token lookup used by agent-trigger / habbo-ai-service.
  async function getUserMcpToken(portalUserId) {
    const [rows] = await db.execute(
      `SELECT token_raw_encrypted FROM portal_mcp_tokens
       WHERE portal_user_id = ? AND status = 'active' AND expires_at > NOW() AND token_raw_encrypted IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [portalUserId]
    );
    if (!rows.length) return null;
    return decryptApiKey(rows[0].token_raw_encrypted);
  }

  // Post a JSON-RPC request to an MCP HTTP endpoint.
  // Non-initialize requests first ensure the session is initialized.
  async function mcpJsonRpc(url, apiKey, method, params, timeoutMs) {
    if (method !== 'initialize' && method !== 'notifications/initialized') {
      await ensureInitialized(url, apiKey);
    }
    const session = getOrCreateSession(url);
    const headers = mcpHeaders(apiKey);
    if (session.sessionId) headers['Mcp-Session-Id'] = session.sessionId;

    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    return mcpFetch(url, headers, body, timeoutMs);
  }

  // Probe a single HTTP MCP server and return its tools (with the server source id).
  async function listToolsFromServer(url, apiKey, sourceId, sourceName, timeoutMs) {
    try {
      const result = await mcpJsonRpc(url, apiKey, 'tools/list', {}, timeoutMs);
      return (result.tools || []).map(t => ({
        name: `int_${sourceId}__${t.name}`,
        originalName: t.name,
        description: t.description || '',
        input_schema: t.inputSchema || t.input_schema || {},
        _source: { id: sourceId, name: sourceName },
      }));
    } catch (err) {
      console.warn(`[mcpClient] tools/list failed for "${sourceName}" (${url}): ${err.message}`);
      return [];
    }
  }

  // Resolve the full MCP endpoint URL: base URL might or might not include /mcp path.
  function ensureMcpEndpoint(base) {
    const s = base.replace(/\/+$/, '');
    if (s.endsWith('/mcp')) return s;
    return `${s}/mcp`;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async function listTools(portalUserId) {
    // Check cache
    const cached = toolCache.get(portalUserId);
    if (cached && (Date.now() < cached.expiresAt)) return cached.tools;

    const servers = await getServers(portalUserId);
    const mcpToken = await getUserMcpToken(portalUserId);
    const effectiveToken = mcpToken || MCP_API_KEY;
    const allTools = [];

    // Hotel MCP — always included
    if (MCP_ENDPOINT) {
      const hotelUrl = ensureMcpEndpoint(MCP_ENDPOINT);
      try {
        const result = await mcpJsonRpc(hotelUrl, effectiveToken, 'tools/list', {}, TOOL_LIST_TIMEOUT_MS);
        const hotelTools = (result.tools || []).map(t => ({
          name: `hotel__${t.name}`,
          originalName: t.name,
          description: t.description || '',
          input_schema: t.inputSchema || t.input_schema || {},
          _source: { id: 'hotel', name: 'hotel-mcp' },
        }));
        allTools.push(...hotelTools);
      } catch (err) {
        console.warn(`[mcpClient] tools/list failed for hotel-mcp: ${err.message}`);
      }
    }

    // External MCP servers (HTTP and stdio)
    for (const server of servers) {
      let tools = [];
      if (server.type === 'http' && server.url) {
        tools = await listToolsFromServer(ensureMcpEndpoint(server.url), server.api_key, server.id, server.name, TOOL_LIST_TIMEOUT_MS);
      } else if (server.type === 'stdio' && server.stdio_config) {
        try {
          const result = await stdioJsonRpc(server.stdio_config, 'tools/list', {}, TOOL_LIST_TIMEOUT_MS);
          tools = (result.tools || []).map(t => ({
            name: `int_${server.id}__${t.name}`,
            originalName: t.name,
            description: t.description || '',
            input_schema: t.inputSchema || t.input_schema || {},
            _source: { id: String(server.id), name: server.name },
          }));
        } catch (err) {
          console.warn(`[mcpClient] tools/list failed for stdio "${server.name}": ${err.message}`);
        }
      }
      allTools.push(...tools);
    }

    // Cache and return
    toolCache.set(portalUserId, { tools: allTools, expiresAt: Date.now() + TOOL_CACHE_TTL_MS });
    return allTools;
  }

  async function callTool(portalUserId, prefixedName, args) {
    let sourceId, toolName;

    if (prefixedName.startsWith('hotel__')) {
      sourceId = 'hotel';
      toolName = prefixedName.slice('hotel__'.length);
    } else if (prefixedName.startsWith('int_')) {
      const underscore = prefixedName.indexOf('__', 4);
      if (underscore === -1) throw new Error(`Invalid tool name prefix: ${prefixedName}`);
      sourceId = prefixedName.slice(4, underscore);
      toolName = prefixedName.slice(underscore + 2);
    } else {
      throw new Error(`Unknown tool prefix in: ${prefixedName}`);
    }

    if (sourceId === 'hotel') {
      const mcpToken = await getUserMcpToken(portalUserId);
      const effectiveToken = mcpToken || MCP_API_KEY;
      const url = ensureMcpEndpoint(MCP_ENDPOINT);
      return mcpJsonRpc(url, effectiveToken, 'tools/call', { name: toolName, arguments: args }, TOOL_CALL_TIMEOUT_MS);
    }

    // External server — look up by id
    const servers = await getServers(portalUserId);
    const server = servers.find(s => String(s.id) === sourceId);
    if (!server) throw new Error(`MCP server ${sourceId} not found or disabled`);

    if (server.type === 'http' && server.url) {
      return mcpJsonRpc(ensureMcpEndpoint(server.url), server.api_key, 'tools/call', { name: toolName, arguments: args }, TOOL_CALL_TIMEOUT_MS);
    }
    if (server.type === 'stdio' && server.stdio_config) {
      return stdioJsonRpc(server.stdio_config, 'tools/call', { name: toolName, arguments: args }, TOOL_CALL_TIMEOUT_MS);
    }
    throw new Error(`Cannot call tool on server "${server.name}" — no valid endpoint`);
  }

  return {
    getServers,
    listTools,
    callTool,
    invalidateCache,
  };
}
