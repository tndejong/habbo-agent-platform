// /api/agents/* — marketplace-scoped resources (personas, teams, packs,
// members, templates, flows), plus run/stop/logs and bot picker.
// Mounts /api/agents JSON body parser internally.
import express from 'express';

export function registerAgentsRoutes(app, ctx) {
  const {
    db,
    authRequired,
    permRequired,
    getPortalUserByHabboUserId,
    portalUserHasAnthropicApiKey,
    forwardToAgentTrigger,
    AGENT_TRIGGER_URL,
  } = ctx;

  app.use('/api/agents', express.json({ limit: '1mb' }));

  // ── Personas ─────────────────────────────────────────────────────────────
  app.get('/api/agents/personas', authRequired, async (req, res) => {
    try {
      const [rows] = await db.execute(
        `SELECT p.*,
           (SELECT MIN(atm.team_id) FROM agent_team_members atm WHERE atm.persona_id = p.id) AS marketplace_team_id
         FROM agent_personas p ORDER BY p.name ASC`
      );
      res.json({ ok: true, personas: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/agents/personas', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      const { name, description, prompt, capabilities, figure_type, bot_name } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
      const [result] = await db.execute(
        'INSERT INTO agent_personas (name, description, prompt, capabilities, figure_type, bot_name, created_by_user_id) VALUES (?,?,?,?,?,?,?)',
        [name.trim(), description || '', prompt || '', capabilities || '', figure_type || 'agent-m', bot_name || '', req.user.habbo_user_id]
      );
      res.json({ ok: true, id: result.insertId });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/agents/personas/:id', authRequired, async (req, res) => {
    try {
      const [[row]] = await db.execute('SELECT * FROM agent_personas WHERE id=?', [req.params.id]);
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true, persona: row });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/agents/personas/:id', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      const { name, role, capabilities, description, prompt, figure_type, bot_name, figure } = req.body;
      await db.execute(
        'UPDATE agent_personas SET name=?, role=?, capabilities=?, description=?, prompt=?, figure_type=?, bot_name=?, figure=? WHERE id=?',
        [name, role || '', capabilities || '', description || '', prompt || '', figure_type || 'agent-m', bot_name || '', figure || '', req.params.id]
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/agents/personas/:id', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      await db.execute('DELETE FROM agent_personas WHERE id=?', [req.params.id]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Teams ────────────────────────────────────────────────────────────────
  app.get('/api/agents/teams', authRequired, async (req, res) => {
    try {
      const [teams] = await db.execute('SELECT * FROM agent_teams ORDER BY name ASC');
      for (const team of teams) {
        const [[{ cnt }]] = await db.execute('SELECT COUNT(*) as cnt FROM agent_team_members WHERE team_id=?', [team.id]);
        team.member_count = cnt;
      }
      res.json({ ok: true, teams });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/agents/teams', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      const { name, description, orchestrator_prompt, pack_source_url, role_assignments, execution_mode, tasks_json, language } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
      const [result] = await db.execute(
        'INSERT INTO agent_teams (name, description, orchestrator_prompt, pack_source_url, role_assignments, execution_mode, tasks_json, language, created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?)',
        [name.trim(), description || '', orchestrator_prompt || '', pack_source_url || null, role_assignments ? JSON.stringify(role_assignments) : null, execution_mode || 'concurrent', JSON.stringify(tasks_json || []), language || 'en', req.user.habbo_user_id]
      );
      res.json({ ok: true, id: result.insertId });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/agents/teams/:id', authRequired, async (req, res) => {
    try {
      const [[team]] = await db.execute('SELECT * FROM agent_teams WHERE id=?', [req.params.id]);
      if (!team) return res.status(404).json({ error: 'Not found' });
      const [members] = await db.execute(
        `SELECT atm.id, atm.role, p.id AS persona_id, p.name, p.description, p.figure_type, p.figure,
                p.role AS persona_role, p.capabilities, p.prompt
         FROM agent_team_members atm
         JOIN agent_personas p ON p.id = atm.persona_id
         WHERE atm.team_id = ?
         ORDER BY atm.id ASC`, [req.params.id]
      );
      const [flows] = await db.execute(
        `SELECT f.* FROM agent_flows f
         JOIN agent_team_flows atf ON atf.flow_id = f.id
         WHERE atf.team_id = ?`, [req.params.id]
      );
      res.json({ ok: true, team: { ...team, members, flows } });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/agents/teams/:id', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      const { name, description, orchestrator_prompt, pack_source_url, role_assignments, execution_mode, tasks_json, language } = req.body;
      await db.execute(
        'UPDATE agent_teams SET name=?, description=?, orchestrator_prompt=?, pack_source_url=?, role_assignments=?, execution_mode=?, tasks_json=?, language=? WHERE id=?',
        [name, description || '', orchestrator_prompt || '', pack_source_url || null, role_assignments ? JSON.stringify(role_assignments) : null, execution_mode || 'concurrent', JSON.stringify(tasks_json || []), language || 'en', req.params.id]
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/agents/teams/:id', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      await db.execute('DELETE FROM agent_teams WHERE id=?', [req.params.id]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Packs ────────────────────────────────────────────────────────────────
  app.get('/api/agents/packs', authRequired, async (req, res) => {
    try {
      const [rows] = await db.execute('SELECT * FROM agent_packs ORDER BY name ASC');
      res.json({ ok: true, packs: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/agents/packs', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      const { name, description, room_id, pack_source_url, role_assignments } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
      const [result] = await db.execute(
        'INSERT INTO agent_packs (name, description, room_id, pack_source_url, role_assignments, created_by_user_id) VALUES (?,?,?,?,?,?)',
        [name.trim(), description || '', Number(room_id) || 50, pack_source_url || '', JSON.stringify(role_assignments || {}), req.user.habbo_user_id]
      );
      res.json({ ok: true, id: result.insertId });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/agents/packs/:id', authRequired, async (req, res) => {
    try {
      const [[row]] = await db.execute('SELECT * FROM agent_packs WHERE id=?', [req.params.id]);
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true, pack: row });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/agents/packs/:id', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      const { name, description, room_id, pack_source_url, role_assignments } = req.body;
      await db.execute(
        'UPDATE agent_packs SET name=?, description=?, room_id=?, pack_source_url=?, role_assignments=? WHERE id=?',
        [name, description || '', Number(room_id) || 50, pack_source_url || '', JSON.stringify(role_assignments || {}), req.params.id]
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/agents/packs/:id', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      await db.execute('DELETE FROM agent_packs WHERE id=?', [req.params.id]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/agents/packs/:id/trigger', authRequired, async (req, res) => {
    try {
      const [[pack]] = await db.execute('SELECT * FROM agent_packs WHERE id=?', [req.params.id]);
      if (!pack) return res.status(404).json({ error: 'Pack not found' });

      const roleAssignments = typeof pack.role_assignments === 'string'
        ? JSON.parse(pack.role_assignments)
        : pack.role_assignments;
      if (!roleAssignments || Object.keys(roleAssignments).length === 0) {
        return res.status(400).json({ error: 'Pack has no role assignments. Edit the pack to assign roles.' });
      }

      const packPortalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!packPortalUser) return res.status(404).json({ error: 'Portal user not found' });
      if (!(await portalUserHasAnthropicApiKey(packPortalUser.id))) {
        return res.status(400).json({ error: 'Add your Anthropic API key in Account settings before running a pack.' });
      }
      const { ok, data } = await forwardToAgentTrigger({
        pack_id: Number(req.params.id),
        pack_source_url: pack.pack_source_url,
        role_assignments: roleAssignments,
        room_id: pack.room_id,
        hotel_integrated: !!packPortalUser.hotel_enabled,
        triggered_by: req.user.username,
        portal_user_id: packPortalUser.id,
      });
      if (!ok) return res.status(502).json({ error: data.error || 'Trigger failed' });
      res.json({ ok: true, ...data });
    } catch (err) { res.status(502).json({ error: 'Agent trigger unavailable: ' + err.message }); }
  });

  // ── Team members ─────────────────────────────────────────────────────────
  app.post('/api/agents/teams/:id/members', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      const { persona_id, role } = req.body;
      await db.execute(
        'INSERT IGNORE INTO agent_team_members (team_id, persona_id, role) VALUES (?,?,?)',
        [req.params.id, persona_id, role || '']
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/agents/teams/:id/members/:memberId', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      await db.execute('DELETE FROM agent_team_members WHERE id=? AND team_id=?', [req.params.memberId, req.params.id]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Team flows ───────────────────────────────────────────────────────────
  app.post('/api/agents/teams/:id/flows', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      const { flow_id } = req.body;
      await db.execute('INSERT IGNORE INTO agent_team_flows (team_id, flow_id) VALUES (?,?)', [req.params.id, flow_id]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/agents/teams/:id/flows/:flowId', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      await db.execute('DELETE FROM agent_team_flows WHERE team_id=? AND flow_id=?', [req.params.id, req.params.flowId]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Room templates ───────────────────────────────────────────────────────
  app.get('/api/agents/teams/:id/templates', authRequired, async (req, res) => {
    try {
      const [rows] = await db.execute(
        'SELECT * FROM agent_room_templates WHERE team_id=? ORDER BY bot_name ASC',
        [req.params.id]
      );
      res.json({ ok: true, templates: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/agents/teams/:id/templates', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      const { bot_name, room_id, x, y, rot } = req.body;
      if (!bot_name?.trim()) return res.status(400).json({ error: 'bot_name required' });
      await db.execute(
        `INSERT INTO agent_room_templates (team_id, bot_name, room_id, x, y, rot)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE room_id=VALUES(room_id), x=VALUES(x), y=VALUES(y), rot=VALUES(rot)`,
        [req.params.id, bot_name.trim(), Number(room_id) || 0, Number(x) || 0, Number(y) || 0, Number(rot) || 2]
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/agents/teams/:id/templates/:templateId', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      await db.execute(
        'DELETE FROM agent_room_templates WHERE id=? AND team_id=?',
        [req.params.templateId, req.params.id]
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Marketplace team trigger (dev) ───────────────────────────────────────
  app.post('/api/agents/teams/:id/trigger', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      const { flow_id, room_id } = req.body;
      const [[team]] = await db.execute('SELECT id, name, pack_source_url, role_assignments FROM agent_teams WHERE id=?', [req.params.id]);
      if (!team) return res.status(404).json({ error: 'Team not found' });

      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      if (!(await portalUserHasAnthropicApiKey(portalUser.id))) {
        return res.status(400).json({ error: 'Add your Anthropic API key in Account settings before triggering this team.' });
      }
      const hotelEnabled = !!portalUser.hotel_enabled;
      const resolvedRoomId = Number(room_id) || 50;

      if (hotelEnabled) {
        const [[room]] = await db.execute('SELECT id, name FROM rooms WHERE id = ? LIMIT 1', [resolvedRoomId]);
        if (!room) return res.status(400).json({ error: `Room ${resolvedRoomId} does not exist in the hotel. Create it first or use a valid room ID.` });

        if (!team.pack_source_url) {
          const [members] = await db.execute(
            `SELECT p.name, p.bot_name FROM agent_team_members atm
             JOIN agent_personas p ON p.id = atm.persona_id
             WHERE atm.team_id = ?`, [req.params.id]
          );
          if (members.length === 0) {
            return res.status(400).json({ error: 'Team has no members. Add at least one persona.' });
          }
          const unlinked = members.filter(m => !m.bot_name?.trim());
          if (unlinked.length > 0) {
            return res.status(400).json({
              error: `Cannot launch: ${unlinked.map(m => `"${m.name}"`).join(', ')} ${unlinked.length === 1 ? 'has' : 'have'} no bot linked. Edit the persona(s) to assign a hotel bot.`,
            });
          }

          const botNames = members.map(m => m.bot_name).filter(Boolean);
          if (botNames.length > 0) {
            const placeholders = botNames.map(() => '?').join(',');
            const [activeBots] = await db.execute(
              `SELECT name, room_id FROM bots WHERE name IN (${placeholders}) AND room_id > 0`,
              botNames
            );
            const wrongRoom = activeBots.filter(b => Number(b.room_id) !== resolvedRoomId);
            if (wrongRoom.length > 0) {
              const conflictRoom = wrongRoom[0].room_id;
              const names = wrongRoom.map(b => `"${b.name}"`).join(', ');
              return res.status(400).json({
                error: `Team can't start in room ${resolvedRoomId} — ${names} ${wrongRoom.length === 1 ? 'is' : 'are'} already active in room ${conflictRoom}. Stop the current session or trigger the correct room.`,
              });
            }
          }
        }
      }

      const { ok, data } = await forwardToAgentTrigger({
        team_id: Number(req.params.id),
        flow_id: flow_id ? Number(flow_id) : null,
        room_id: hotelEnabled ? resolvedRoomId : null,
        hotel_integrated: hotelEnabled,
        triggered_by: req.user.username,
        portal_url: process.env.PORTAL_PUBLIC_URL || `http://agent-portal:3000`,
        portal_user_id: portalUser?.id,
      });
      if (!ok) return res.status(502).json({ error: data.error || 'Trigger failed' });
      res.json({ ok: true, ...data });
    } catch (err) { res.status(502).json({ error: 'Agent trigger unavailable: ' + err.message }); }
  });

  // ── Stop / logs ──────────────────────────────────────────────────────────
  app.post('/api/agents/stop', authRequired, async (req, res) => {
    try {
      const body = req.body?.room_id ? { room_id: Number(req.body.room_id) } : {};
      const r = await fetch(`${AGENT_TRIGGER_URL}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      res.json({ ok: true, ...data });
    } catch (err) { res.status(502).json({ error: 'Agent trigger unavailable' }); }
  });

  app.get('/api/agents/logs', authRequired, permRequired('devtools.access'), async (req, res) => {
    try {
      const lines = Math.min(parseInt(req.query.lines ?? '150'), 500);
      const r = await fetch(`${AGENT_TRIGGER_URL}/logs?lines=${lines}`);
      const data = await r.json().catch(() => ({ ok: false, lines: [] }));
      if (req.query.room_id && data.lines) {
        const prefix = `[room-${req.query.room_id}]`;
        data.lines = data.lines.filter(l => l.includes(prefix));
      }
      res.json(data);
    } catch (err) { res.json({ ok: false, lines: [], error: 'Agent trigger unavailable' }); }
  });

  app.get('/api/agents/logs/bak', authRequired, permRequired('devtools.access'), async (req, res) => {
    try {
      const r = await fetch(`${AGENT_TRIGGER_URL}/logs/bak`);
      if (r.status === 404) return res.status(404).json({ error: 'No previous session log found.' });
      if (!r.ok) return res.status(502).json({ error: 'Agent trigger unavailable' });
      const text = await r.text();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="hotel-team.log.bak"');
      res.send(text);
    } catch (err) { res.status(502).json({ error: 'Agent trigger unavailable' }); }
  });

  // ── Flows ────────────────────────────────────────────────────────────────
  app.get('/api/agents/flows', authRequired, async (req, res) => {
    try {
      const [rows] = await db.execute('SELECT * FROM agent_flows ORDER BY name ASC');
      res.json({ ok: true, flows: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/agents/flows', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      const { name, description, tasks_json, allowed_tools_json } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
      const [result] = await db.execute(
        'INSERT INTO agent_flows (name, description, tasks_json, allowed_tools_json, created_by_user_id) VALUES (?,?,?,?,?)',
        [name.trim(), description || '', JSON.stringify(tasks_json || []), JSON.stringify(allowed_tools_json || []), req.user.habbo_user_id]
      );
      res.json({ ok: true, id: result.insertId });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/agents/flows/:id', authRequired, async (req, res) => {
    try {
      const [[row]] = await db.execute('SELECT * FROM agent_flows WHERE id=?', [req.params.id]);
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true, flow: row });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/agents/flows/:id', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      const { name, description, tasks_json, allowed_tools_json } = req.body;
      await db.execute(
        'UPDATE agent_flows SET name=?, description=?, tasks_json=?, allowed_tools_json=? WHERE id=?',
        [name, description || '', JSON.stringify(tasks_json || []), JSON.stringify(allowed_tools_json || []), req.params.id]
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/agents/flows/:id', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      await db.execute('DELETE FROM agent_flows WHERE id=?', [req.params.id]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Bot picker ───────────────────────────────────────────────────────────
  app.get('/api/agents/bots', authRequired, async (req, res) => {
    try {
      if (req.query.mine === 'true') {
        const [rows] = await db.execute(
          'SELECT id, name, room_id, x, y, figure FROM bots WHERE user_id = ? ORDER BY name ASC',
          [req.user.habbo_user_id]
        );
        return res.json({ ok: true, bots: rows });
      }
      const [rows] = await db.execute(
        'SELECT id, name, room_id, x, y, figure FROM bots ORDER BY name ASC'
      );
      res.json({ ok: true, bots: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Status (heavy: aggregates trigger + MCP + persona joins) ─────────────
  app.get('/api/agents/status', authRequired, async (req, res) => {
    try {
      const MCP_URL = (process.env.HOTEL_MCP_URL || 'http://habbo-mcp:3003/mcp').replace(/\/?$/, '');
      const MCP_KEY = process.env.MCP_API_KEY || '';

      const [triggerRes, mcpRes, globalPersonasRes, userPersonasRes, roomsRes] = await Promise.allSettled([
        fetch(`${AGENT_TRIGGER_URL}/health`).then(r => r.json()),
        fetch(`${AGENT_TRIGGER_URL}/mcp-status`).then(r => r.json()),
        db.execute(`
          SELECT p.name AS persona_name, p.bot_name, p.figure AS persona_figure,
                 at2.name AS team_name
          FROM agent_personas p
          LEFT JOIN agent_team_members atm ON atm.persona_id = p.id
          LEFT JOIN agent_teams at2 ON at2.id = atm.team_id
          WHERE p.bot_name != ''
        `),
        db.execute(`
          SELECT up.name AS persona_name, up.bot_name, up.figure AS persona_figure,
                 up.elevenlabs_voice_id, ut.name AS team_name
          FROM user_personas up
          LEFT JOIN user_team_members utm ON utm.user_persona_id = up.id
          LEFT JOIN user_teams ut ON ut.id = utm.user_team_id
          WHERE up.bot_name != ''
        `),
        db.execute('SELECT id, caption AS name FROM rooms'),
      ]);

      const roomNames = {};
      if (roomsRes.status === 'fulfilled') {
        for (const r of roomsRes.value[0]) roomNames[r.id] = r.name;
      }

      let liveBots = [];
      try {
        const headers = { 'content-type': 'application/json' };
        if (MCP_KEY) headers['authorization'] = `Bearer ${MCP_KEY}`;
        const mcpBotRes = await fetch(MCP_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({ jsonrpc: '2.0', id: 'status', method: 'tools/call', params: { name: 'list_bots', arguments: {} } }),
          signal: AbortSignal.timeout(4000),
        });
        const mcpData = await mcpBotRes.json();
        const parsed = JSON.parse(mcpData.result?.content?.[0]?.text || '{}');
        const allBots = parsed.bots || [];

        const personaMap = {};
        const globalPersonas = globalPersonasRes.status === 'fulfilled' ? globalPersonasRes.value[0] : [];
        const userPersonas = userPersonasRes.status === 'fulfilled' ? userPersonasRes.value[0] : [];
        for (const p of globalPersonas) {
          if (p.bot_name) personaMap[p.bot_name.toLowerCase()] = p;
        }
        for (const p of userPersonas) {
          if (p.bot_name) personaMap[p.bot_name.toLowerCase()] = p;
        }

        const enriched = allBots
          .filter(b => b.room_id > 0)
          .map(b => ({
            ...b,
            room_name: roomNames[b.room_id] || null,
            ...(personaMap[b.name?.toLowerCase()] || {}),
            is_agent: !!personaMap[b.name?.toLowerCase()],
          }));

        const seen = new Map();
        for (const b of enriched) {
          const key = `${b.name?.toLowerCase()}:${b.room_id}`;
          const existing = seen.get(key);
          if (!existing || (b.x > 0 || b.y > 0)) seen.set(key, b);
        }

        liveBots = [...seen.values()]
          .sort((a, b) => (b.is_agent ? 1 : 0) - (a.is_agent ? 1 : 0) || a.name.localeCompare(b.name));
      } catch (e) { /* MCP unreachable */ }

      const triggerData = triggerRes.status === 'fulfilled' ? triggerRes.value : { ok: false };
      if (triggerData.activeRuns) {
        const [[devRow]] = await db.execute(
          'SELECT is_developer FROM portal_users WHERE habbo_user_id = ? LIMIT 1',
          [req.user.habbo_user_id]
        );
        if (!devRow?.is_developer) {
          triggerData.activeRuns = triggerData.activeRuns.filter(r => r.from === req.user.username);
        }
      }

      res.json({
        ok: true,
        trigger: triggerData,
        bots: liveBots,
        mcp: mcpRes.status === 'fulfilled' ? mcpRes.value : { ok: false, servers: [], error: 'agent-trigger unreachable' },
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Run reports ──────────────────────────────────────────────────────────
  app.get('/api/agents/run-reports', authRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const limit = Math.min(parseInt(req.query.limit ?? '20'), 50);
      const roomId = req.query.room_id ? Number(req.query.room_id) : null;
      const whereExtra = roomId ? ' AND room_id = ?' : '';
      const params = roomId
        ? [portalUser.id, roomId, limit]
        : [portalUser.id, limit];
      const [rows] = await db.execute(
        `SELECT id, room_id, team_name, triggered_by, report_md, cost_usd,
                input_tokens, output_tokens, started_at, created_at
         FROM team_run_reports
         WHERE portal_user_id = ?${whereExtra}
         ORDER BY created_at DESC LIMIT ?`,
        params
      );
      res.json({ ok: true, reports: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}
