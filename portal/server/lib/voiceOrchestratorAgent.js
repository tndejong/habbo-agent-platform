// Anthropic tool-use agent for Voice Chat orchestration commands.
import { detectRequiredIntegrations } from '../../shared/teams.js';

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const MAX_AGENT_TURNS = 6;

export const ORCHESTRATION_TOOLS = [
  {
    name: 'list_teams',
    description: 'List all AI agent teams owned by the user, with id, name, and default room.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_active_runs',
    description: 'Get orchestration runs currently active for this user (room id, team info).',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'stop_active_runs',
    description: 'Stop active orchestration runs. Use when the user wants to halt, cancel, or stop teams.',
    input_schema: {
      type: 'object',
      properties: {
        room_id: { type: 'number', description: 'Optional specific room to stop. Omit to stop all user runs.' },
      },
      required: [],
    },
  },
  {
    name: 'trigger_team',
    description: 'Deploy/start an AI agent team in the hotel. Use when the user wants to run, launch, or activate a team with an optional task goal.',
    input_schema: {
      type: 'object',
      properties: {
        team_name: { type: 'string', description: 'Team name (fuzzy match against user teams)' },
        goal: { type: 'string', description: 'Optional one-off task or session goal for the team' },
      },
      required: ['team_name'],
    },
  },
];

function buildSystemPrompt({ username, teamNames, activeRunSummary }) {
  return `You are the voice assistant for a Habbo Hotel AI orchestration platform. The user "${username}" speaks to you via voice or text.

You manage their AI agent teams in the hotel. Use the provided tools whenever you need real data or to perform actions — never guess team names, run status, or pretend to start/stop teams without calling tools.

Available teams: ${teamNames.length ? teamNames.join(', ') : '(none yet)'}
Active runs: ${activeRunSummary}

Guidelines:
- Be conversational and concise — replies are spoken aloud via text-to-speech (1-3 sentences).
- Match team names loosely ("marketing" can match "Alex · Marketing Room").
- For status questions, call get_active_runs. For listing teams, call list_teams.
- To start a team, call trigger_team with team_name and goal if they gave a task.
- To stop, call stop_active_runs.
- If a tool fails, explain the error plainly and suggest what the user can do.
- For general chat unrelated to orchestration, answer briefly without tools.`;
}

function extractText(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
}

function findTeamByName(teams, name) {
  if (!name?.trim()) return null;
  const needle = name.trim().toLowerCase();
  const exact = teams.find(t => t.name.toLowerCase() === needle);
  if (exact) return exact;
  const partial = teams.find(t => t.name.toLowerCase().includes(needle) || needle.includes(t.name.toLowerCase()));
  if (partial) return partial;
  const words = needle.split(/[\s·,]+/).filter(w => w.length > 2);
  return teams.find(t => {
    const teamWords = t.name.toLowerCase().split(/[\s·,]+/).filter(Boolean);
    return words.some(w => teamWords.some(tw => tw.includes(w) || w.includes(tw)));
  }) || null;
}

async function fetchActiveRuns(agentTriggerUrl, username) {
  try {
    const r = await fetch(`${agentTriggerUrl}/health`, { signal: AbortSignal.timeout(4000) });
    const data = await r.json().catch(() => ({}));
    return (data.activeRuns || []).filter(run => run.from === username);
  } catch {
    return [];
  }
}

async function executeTool(name, input, ctx) {
  const {
    db,
    portalUser,
    username,
    canDeployTeams,
    forwardToAgentTrigger,
    agentTriggerUrl,
    portalInternalSecret,
  } = ctx;

  if (name === 'list_teams') {
    const [teams] = await db.execute(
      'SELECT id, name, default_room_id, description FROM user_teams WHERE portal_user_id = ? ORDER BY name ASC',
      [portalUser.id]
    );
    return {
      teams: teams.map(t => ({
        id: t.id,
        name: t.name,
        default_room_id: t.default_room_id,
        description: t.description || '',
      })),
      count: teams.length,
    };
  }

  if (name === 'get_active_runs') {
    const runs = await fetchActiveRuns(agentTriggerUrl, username);
    return {
      active_runs: runs.map(r => ({
        room_id: r.roomId,
        team: r.teamName || r.team || null,
        from: r.from,
      })),
      count: runs.length,
    };
  }

  if (name === 'stop_active_runs') {
    const body = input.room_id ? { room_id: Number(input.room_id) } : {};
    const r = await fetch(`${agentTriggerUrl}/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': portalInternalSecret,
      },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, error: data.error || 'Failed to stop runs' };
    }
    return { ok: true, message: input.room_id ? `Stopped run in room ${input.room_id}` : 'Stopped active runs', ...data };
  }

  if (name === 'trigger_team') {
    if (!canDeployTeams) {
      return { ok: false, error: 'Team deployment requires Pro tier or higher.' };
    }

    const [teams] = await db.execute(
      'SELECT * FROM user_teams WHERE portal_user_id = ? ORDER BY name ASC',
      [portalUser.id]
    );
    const team = findTeamByName(teams, input.team_name);
    if (!team) {
      return {
        ok: false,
        error: `Team "${input.team_name}" not found.`,
        available_teams: teams.map(t => t.name),
      };
    }

    const goal = (input.goal || '').trim();
    const taskMode = goal ? 'session_goal' : 'team_tasks';
    if (taskMode === 'session_goal' && goal.length < 10) {
      return { ok: false, error: 'Session goal must be at least 10 characters. Ask the user what they want the team to do.' };
    }

    const hotelEnabled = !!portalUser.hotel_enabled;
    const resolvedRoomId = hotelEnabled ? (Number(team.default_room_id) || null) : null;

    const [members] = await db.execute(
      `SELECT up.name, up.capabilities, up.prompt, up.bot_name
       FROM user_team_members utm JOIN user_personas up ON up.id = utm.user_persona_id
       WHERE utm.user_team_id = ?`,
      [team.id]
    );

    if (members.length === 0) {
      return { ok: false, error: `${team.name} has no members. Add personas to the team first.` };
    }

    if (hotelEnabled) {
      if (!resolvedRoomId) {
        return { ok: false, error: `${team.name} has no default room. Set one in team settings.` };
      }
      const [[room]] = await db.execute('SELECT id FROM rooms WHERE id = ? LIMIT 1', [resolvedRoomId]);
      if (!room) {
        return { ok: false, error: `Room ${resolvedRoomId} does not exist in the hotel.` };
      }

      const unlinked = members.filter(m => !m.bot_name?.trim());
      if (unlinked.length > 0) {
        return {
          ok: false,
          error: `Cannot launch: ${unlinked.map(m => m.name).join(', ')} ${unlinked.length === 1 ? 'has' : 'have'} no hotel bot linked.`,
        };
      }

      const botNames = members.map(m => m.bot_name).filter(Boolean);
      if (botNames.length > 0) {
        const placeholders = botNames.map(() => '?').join(',');
        const [foundBots] = await db.execute(
          `SELECT name, room_id FROM bots WHERE name IN (${placeholders})`,
          botNames
        );
        const wrongRoom = foundBots.filter(b => b.room_id > 0 && Number(b.room_id) !== resolvedRoomId);
        if (wrongRoom.length > 0) {
          return {
            ok: false,
            error: `Bot ${wrongRoom.map(b => b.name).join(', ')} already active in room ${wrongRoom[0].room_id}. Stop that run first.`,
          };
        }
      }
    }

    const [mcpTokenRows] = await db.execute(
      `SELECT id FROM portal_mcp_tokens WHERE portal_user_id = ? AND status = 'active' AND expires_at > NOW() AND token_raw_encrypted IS NOT NULL LIMIT 1`,
      [portalUser.id]
    );
    if (mcpTokenRows.length === 0) {
      return { ok: false, error: 'No active MCP token. Generate one in Settings → MCP Tokens before deploying.' };
    }

    const teamForCheck = taskMode === 'session_goal' ? { ...team, tasks_json: '' } : team;
    const required = detectRequiredIntegrations(teamForCheck, members);
    if (required.length > 0) {
      const [userIntegrations] = await db.execute(
        `SELECT name FROM portal_user_integrations
         WHERE portal_user_id = ?
           AND (api_key_encrypted IS NOT NULL OR stdio_config_encrypted IS NOT NULL)`,
        [portalUser.id]
      );
      const connectedNames = userIntegrations.map(i => i.name.toLowerCase());
      const missing = required.filter(svc => !connectedNames.some(n => n.includes(svc)));
      if (missing.length > 0) {
        return {
          ok: false,
          error: `Missing integrations: ${missing.join(', ')}. Connect them in Settings → Integrations.`,
          missing_integrations: missing,
        };
      }
    }

    const payload = {
      team_id: team.id,
      user_team: true,
      room_id: resolvedRoomId,
      hotel_integrated: hotelEnabled,
      triggered_by: username,
      portal_url: process.env.PORTAL_PUBLIC_URL || process.env.PORTAL_URL || '',
      portal_user_id: portalUser.id,
      task_mode: taskMode,
      language: team.language || 'en',
    };
    if (taskMode === 'session_goal') {
      payload.session_goal = goal;
    }

    const { ok, data } = await forwardToAgentTrigger(payload);
    if (!ok) {
      return { ok: false, error: data.error || 'Failed to start team', details: data };
    }
    return {
      ok: true,
      message: `Started ${team.name}${goal ? ` with goal: ${goal}` : ''}`,
      room_id: resolvedRoomId,
      ...data,
    };
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}

async function callAnthropic({ anthropicKey, system, messages }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 512,
      system,
      tools: ORCHESTRATION_TOOLS,
      messages,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    const msg = err.error?.message || `Anthropic API error (${r.status})`;
    const e = new Error(msg);
    e.status = r.status;
    throw e;
  }

  return r.json();
}

/**
 * Run the voice orchestration agent loop. Returns a spoken-friendly reply string.
 */
export async function runVoiceOrchestratorAgent({ transcript, anthropicKey, ctx }) {
  const [teams] = await ctx.db.execute(
    'SELECT id, name FROM user_teams WHERE portal_user_id = ? ORDER BY name ASC',
    [ctx.portalUser.id]
  );
  const teamNames = teams.map(t => t.name);
  const activeRuns = await fetchActiveRuns(ctx.agentTriggerUrl, ctx.username);
  const activeRunSummary = activeRuns.length
    ? activeRuns.map(r => `room ${r.roomId}`).join(', ')
    : 'none';

  const system = buildSystemPrompt({
    username: ctx.username,
    teamNames,
    activeRunSummary,
  });

  const messages = [{ role: 'user', content: transcript }];

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    const response = await callAnthropic({ anthropicKey, system, messages });
    const toolUses = (response.content || []).filter(block => block.type === 'tool_use');

    if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const text = extractText(response.content);
      if (text) return text;
      return 'I heard you, but I am not sure how to help with that.';
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolResults = [];
    for (const toolUse of toolUses) {
      let result;
      try {
        result = await executeTool(toolUse.name, toolUse.input || {}, ctx);
      } catch (err) {
        result = { ok: false, error: err.message || 'Tool execution failed' };
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  return 'That took too many steps. Please try a simpler request.';
}
