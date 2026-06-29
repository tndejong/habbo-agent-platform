// /api/internal/* — server-to-server endpoints for agent-trigger.
// All protected by requireInternalSecret (shared header secret).

export function registerInternalRoutes(app, ctx) {
  const {
    db,
    requireInternalSecret,
    mintHotelToken,
    apiKeys,
    decryptApiKey,
    resolvePersonaSkills,
    collectRequiredIntegrations,
    mcpClient,
  } = ctx;

  app.get('/api/internal/user/:portalUserId/api-key/:provider', requireInternalSecret, async (req, res) => {
    const api_key = await apiKeys.getDecryptedKey(req.params.portalUserId, req.params.provider);
    res.json({ ok: true, api_key });
  });

  // Hotel-side variant: resolve a portal-stored key by the habbo user id. This is
  // how the emulator / habbo-ai-service fetch keys without storing them locally.
  app.get('/api/internal/hotel-user/:habboUserId/api-key/:provider', requireInternalSecret, async (req, res) => {
    const api_key = await apiKeys.getDecryptedKeyByHabbo(req.params.habboUserId, req.params.provider);
    res.json({ ok: true, api_key });
  });

  // Mint a short-lived bearer token for the in-hotel Nitro client. Called by the
  // emulator (which has already authenticated the user via SSO) and relayed to
  // the client via the AI settings packet.
  app.post('/api/internal/hotel-token', requireInternalSecret, async (req, res) => {
    const habboUserId = Number(req.body?.habbo_user_id);
    if (!habboUserId) return res.status(400).json({ error: 'habbo_user_id required' });
    const [[user]] = await db.execute(
      'SELECT habbo_username FROM portal_users WHERE habbo_user_id = ? LIMIT 1',
      [habboUserId]
    );
    if (!user) return res.status(404).json({ error: 'No portal user for that habbo_user_id' });
    const token = mintHotelToken(habboUserId, user.habbo_username || '');
    res.json({ ok: true, token });
  });

  app.get('/api/internal/user/:portalUserId/mcp-token', requireInternalSecret, async (req, res) => {
    const [rows] = await db.execute(
      `SELECT token_raw_encrypted FROM portal_mcp_tokens
       WHERE portal_user_id = ? AND status = 'active' AND expires_at > NOW() AND token_raw_encrypted IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [req.params.portalUserId]
    );
    if (!rows.length) return res.json({ ok: true, mcp_token: null });
    const plain = decryptApiKey(rows[0].token_raw_encrypted);
    return res.json({ ok: true, mcp_token: plain });
  });

  app.get('/api/internal/user-by-phone/:number', requireInternalSecret, async (req, res) => {
    try {
      const [[user]] = await db.execute(
        'SELECT id, username, default_user_team_id FROM portal_users WHERE phone_number = ? LIMIT 1',
        [req.params.number]
      );
      if (!user) return res.status(404).json({ error: 'No user registered for this number' });

      let team = null;
      if (user.default_user_team_id) {
        const [[t]] = await db.execute(
          'SELECT id, name, default_room_id FROM user_teams WHERE id = ? AND portal_user_id = ?',
          [user.default_user_team_id, user.id]
        );
        team = t ?? null;
      }
      if (!team) {
        const [[t]] = await db.execute(
          'SELECT id, name, default_room_id FROM user_teams WHERE portal_user_id = ? ORDER BY id ASC LIMIT 1',
          [user.id]
        );
        team = t ?? null;
      }

      res.json({ ok: true, portal_user_id: user.id, username: user.username, team: team ?? null });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── MCP tool endpoints ────────────────────────────────────────────────────
  // Two parallel mount points: by portalUserId (direct) and by habboUserId
  // (resolved via portal_users). Same body / response shape on both.

  async function resolveHabboUser(habboUserId) {
    const [[user]] = await db.execute(
      'SELECT id FROM portal_users WHERE habbo_user_id = ? LIMIT 1',
      [Number(habboUserId)]
    );
    if (!user) throw new Error('No portal user for this habbo_user_id');
    return user.id;
  }

  function mountMcpRoutes(prefix, resolveUserId) {
    app.get(`${prefix}/mcp-tools`, requireInternalSecret, async (req, res) => {
      try {
        const portalUserId = await resolveUserId(req);
        const tools = await mcpClient.listTools(portalUserId);
        res.json({ ok: true, tools });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post(`${prefix}/mcp-call`, requireInternalSecret, async (req, res) => {
      try {
        const { tool_name, args } = req.body;
        if (!tool_name) return res.status(400).json({ error: 'tool_name required' });
        const portalUserId = await resolveUserId(req);
        const result = await mcpClient.callTool(portalUserId, tool_name, args || {});
        res.json({ ok: true, result });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });
  }

  mountMcpRoutes('/api/internal/user/:portalUserId', req => Number(req.params.portalUserId));
  mountMcpRoutes('/api/internal/hotel-user/:habboUserId', req => resolveHabboUser(req.params.habboUserId));

  app.get('/api/internal/user/:portalUserId/integrations', requireInternalSecret, async (req, res) => {
    try {
      const [rows] = await db.execute(
        'SELECT id, name, url, api_key_encrypted, stdio_config_encrypted, enabled FROM portal_user_integrations WHERE portal_user_id = ? ORDER BY created_at ASC',
        [req.params.portalUserId]
      );
      const integrations = rows.map(row => {
        const enabled = !!row.enabled;
        if (row.stdio_config_encrypted) {
          const stdio_config = decryptApiKey(row.stdio_config_encrypted);
          return { id: row.id, name: row.name, url: null, api_key: null, stdio_config, enabled };
        }
        return {
          id: row.id,
          name: row.name,
          url: row.url,
          api_key: row.api_key_encrypted ? decryptApiKey(row.api_key_encrypted) : null,
          stdio_config: null,
          enabled,
        };
      });
      res.json({ ok: true, integrations });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/internal/rooms/:roomId/report', requireInternalSecret, async (req, res) => {
    try {
      const roomId = Number(req.params.roomId);
      const { team_name = '', triggered_by = '', portal_user_id = 0, report_md = '',
              cost_usd = 0, input_tokens = 0, output_tokens = 0, started_at } = req.body;
      if (!report_md.trim()) return res.status(400).json({ error: 'report_md required' });
      const startedAtVal = started_at ? new Date(started_at) : new Date();
      await db.execute(
        `INSERT INTO team_run_reports
           (room_id, team_name, triggered_by, portal_user_id, report_md, cost_usd, input_tokens, output_tokens, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [roomId, String(team_name).slice(0, 128), String(triggered_by).slice(0, 64),
         Number(portal_user_id) || 0, String(report_md),
         Number(cost_usd) || 0, Number(input_tokens) || 0, Number(output_tokens) || 0,
         startedAtVal]
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/internal/user-teams/:id/config', requireInternalSecret, async (req, res) => {
    try {
      const userTeamId = Number(req.params.id);
      const [[team]] = await db.execute('SELECT * FROM user_teams WHERE id=?', [userTeamId]);
      if (!team) return res.status(404).json({ error: 'User team not found' });
      const [rawMembers] = await db.execute(
        `SELECT up.name, up.role AS persona_role, up.capabilities, up.prompt, up.figure_type, up.bot_name, utm.role AS team_role
         FROM user_team_members utm JOIN user_personas up ON up.id = utm.user_persona_id
         WHERE utm.user_team_id = ?`, [userTeamId]
      );
      const members = rawMembers.map(resolvePersonaSkills);
      const required_integrations = collectRequiredIntegrations(members);
      res.json({ ok: true, team: { ...team, required_integrations }, members, flow: null, templates: [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/internal/teams/:id/config', requireInternalSecret, async (req, res) => {
    try {
      const teamId = Number(req.params.id);
      const flowId = req.query.flow_id ? Number(req.query.flow_id) : null;
      const [[team]] = await db.execute('SELECT * FROM agent_teams WHERE id=?', [teamId]);
      if (!team) return res.status(404).json({ error: 'Team not found' });
      const [rawMembers] = await db.execute(
        `SELECT p.name, p.role AS persona_role, p.capabilities, p.prompt, p.figure_type, p.bot_name, atm.role AS team_role
         FROM agent_team_members atm JOIN agent_personas p ON p.id = atm.persona_id
         WHERE atm.team_id = ?`, [teamId]
      );
      const flow = flowId
        ? (await db.execute('SELECT * FROM agent_flows WHERE id=?', [flowId]))[0][0]
        : null;
      const [templates] = await db.execute(
        'SELECT bot_name, room_id, x, y, rot FROM agent_room_templates WHERE team_id=?',
        [teamId]
      );
      const members = rawMembers.map(resolvePersonaSkills);
      const required_integrations = collectRequiredIntegrations(members);
      res.json({ ok: true, team: { ...team, required_integrations }, members, flow, templates });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}
