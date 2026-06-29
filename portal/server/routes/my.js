// /api/my/* — user-scoped resources: integrations, personas, teams,
// marketplace fork tracking. The big sibling of /api/account.

export function registerMyRoutes(app, ctx) {
  const {
    db,
    authRequired,
    apiKeysRequired,
    permRequired,
    getPortalUserByHabboUserId,
    encryptApiKey,
    decryptApiKey,
    parseAndEncryptStdioConfig,
    probeMcpConnection,
    checkSocketOnline,
    setDefaultUserTeamIfUnset,
    clearDefaultUserTeamIfPointsTo,
    deleteOrphanedForkedPersonas,
    portalUserHasAnthropicApiKey,
    forwardToAgentTrigger,
    detectRequiredIntegrations,
    mcpClient,
    AGENT_TRIGGER_URL,
  } = ctx;

  // ─── Integrations ──────────────────────────────────────────────────────────
  app.get('/api/my/integrations', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [rows] = await db.execute(
        'SELECT id, name, url, stdio_config_encrypted, enabled, created_at, updated_at FROM portal_user_integrations WHERE portal_user_id = ? ORDER BY created_at ASC',
        [portalUser.id]
      );
      const integrations = rows.map(row => {
        const enabled = !!row.enabled;
        if (row.stdio_config_encrypted) {
          let command = null, args = [];
          try {
            const cfg = JSON.parse(decryptApiKey(row.stdio_config_encrypted));
            command = cfg.command ?? null;
            args = Array.isArray(cfg.args) ? cfg.args : [];
          } catch {}
          return { id: row.id, name: row.name, url: null, type: 'stdio', command, args, enabled, created_at: row.created_at, updated_at: row.updated_at };
        }
        return { id: row.id, name: row.name, url: row.url, type: 'http', enabled, created_at: row.created_at, updated_at: row.updated_at };
      });
      res.json({ ok: true, integrations });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/my/integrations', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });

      const name = String(req.body?.name || '').trim().slice(0, 64);
      if (!name) return res.status(400).json({ error: 'name is required' });

      const stdioConfigRaw = req.body?.stdio_config;
      if (stdioConfigRaw) {
        const { error, encrypted } = parseAndEncryptStdioConfig(stdioConfigRaw);
        if (error) return res.status(400).json({ error });
        const [result] = await db.execute(
          'INSERT INTO portal_user_integrations (portal_user_id, name, url, stdio_config_encrypted) VALUES (?, ?, ?, ?)',
          [portalUser.id, name, 'stdio://', encrypted]
        );
        return res.json({ ok: true, integration: { id: result.insertId, name, type: 'stdio', created_at: new Date() } });
      }

      const url = String(req.body?.url || '').trim().slice(0, 512);
      const apiKey = String(req.body?.api_key || '').trim();
      if (!url) return res.status(400).json({ error: 'url is required' });
      const apiKeyEncrypted = apiKey ? encryptApiKey(apiKey) : null;
      const [result] = await db.execute(
        'INSERT INTO portal_user_integrations (portal_user_id, name, url, api_key_encrypted) VALUES (?, ?, ?, ?)',
        [portalUser.id, name, url, apiKeyEncrypted]
      );
      res.json({ ok: true, integration: { id: result.insertId, name, url, type: 'http', created_at: new Date() } });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/my/integrations/:id', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });

      const [[existing]] = await db.execute(
        'SELECT id, stdio_config_encrypted FROM portal_user_integrations WHERE id = ? AND portal_user_id = ?',
        [req.params.id, portalUser.id]
      );
      if (!existing) return res.status(404).json({ error: 'Integration not found' });

      const name = String(req.body?.name || '').trim().slice(0, 64);
      if (!name) return res.status(400).json({ error: 'name is required' });

      const stdioConfigRaw = req.body?.stdio_config;
      if (stdioConfigRaw || existing.stdio_config_encrypted) {
        if (stdioConfigRaw) {
          const { error, encrypted } = parseAndEncryptStdioConfig(stdioConfigRaw);
          if (error) return res.status(400).json({ error });
          await db.execute(
            'UPDATE portal_user_integrations SET name = ?, stdio_config_encrypted = ? WHERE id = ? AND portal_user_id = ?',
            [name, encrypted, req.params.id, portalUser.id]
          );
        } else {
          await db.execute(
            'UPDATE portal_user_integrations SET name = ? WHERE id = ? AND portal_user_id = ?',
            [name, req.params.id, portalUser.id]
          );
        }
        return res.json({ ok: true });
      }

      const url = String(req.body?.url || '').trim().slice(0, 512);
      const apiKey = req.body?.api_key !== undefined ? String(req.body.api_key).trim() : undefined;
      if (!url) return res.status(400).json({ error: 'url is required' });

      if (apiKey !== undefined) {
        const apiKeyEncrypted = apiKey ? encryptApiKey(apiKey) : null;
        await db.execute(
          'UPDATE portal_user_integrations SET name = ?, url = ?, api_key_encrypted = ? WHERE id = ? AND portal_user_id = ?',
          [name, url, apiKeyEncrypted, req.params.id, portalUser.id]
        );
      } else {
        await db.execute(
          'UPDATE portal_user_integrations SET name = ?, url = ? WHERE id = ? AND portal_user_id = ?',
          [name, url, req.params.id, portalUser.id]
        );
      }
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.patch('/api/my/integrations/:id', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      if (req.body.enabled === undefined) return res.status(400).json({ error: 'enabled is required' });
      const enabled = req.body.enabled ? 1 : 0;
      const [result] = await db.execute(
        'UPDATE portal_user_integrations SET enabled = ? WHERE id = ? AND portal_user_id = ?',
        [enabled, req.params.id, portalUser.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Integration not found' });
      mcpClient.invalidateCache(portalUser.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/my/integrations/:id', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [result] = await db.execute(
        'DELETE FROM portal_user_integrations WHERE id = ? AND portal_user_id = ?',
        [req.params.id, portalUser.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Integration not found' });
      mcpClient.invalidateCache(portalUser.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/my/integrations/ping', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const url = String(req.body?.url || '').trim();
      if (!url) return res.status(400).json({ error: 'url is required' });
      const result = await checkSocketOnline(url, 3000);
      res.json({ ok: true, ...result });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/my/integrations/:id/test', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [[integration]] = await db.execute(
        'SELECT id, url, api_key_encrypted, stdio_config_encrypted FROM portal_user_integrations WHERE id = ? AND portal_user_id = ?',
        [req.params.id, portalUser.id]
      );
      if (!integration) return res.status(404).json({ error: 'Integration not found' });
      if (integration.stdio_config_encrypted) {
        return res.json({ ok: true, online: true, authenticated: true, tools: [], stdio: true });
      }
      const apiKey = integration.api_key_encrypted ? decryptApiKey(integration.api_key_encrypted) : null;
      const authHeaders = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
      const result = await probeMcpConnection(integration.url, authHeaders);
      res.json({ ok: true, ...result });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── Personas ──────────────────────────────────────────────────────────────
  app.get('/api/my/personas', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [rows] = await db.execute(
        `SELECT up.*, ap.name AS forked_from_template_name
         FROM user_personas up
         LEFT JOIN agent_personas ap ON ap.id = up.source_persona_id
         WHERE up.portal_user_id = ? ORDER BY up.name ASC`,
        [portalUser.id]
      );
      res.json({ ok: true, personas: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/my/personas', authRequired, apiKeysRequired, permRequired('personas.create'), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const { name, description, prompt, role, capabilities, figure_type, figure, bot_name, elevenlabs_voice_id } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
      const [result] = await db.execute(
        `INSERT INTO user_personas (portal_user_id, name, description, prompt, role, capabilities, figure_type, figure, bot_name, elevenlabs_voice_id)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [portalUser.id, name.trim(), description || '', prompt || '', role || '', capabilities || '', figure_type || 'agent-m', figure || '', bot_name || '', elevenlabs_voice_id || null]
      );
      res.json({ ok: true, id: result.insertId });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'You already have a persona with that name' });
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/my/personas/:id', authRequired, apiKeysRequired, permRequired('personas.edit'), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [[existing]] = await db.execute('SELECT id FROM user_personas WHERE id = ? AND portal_user_id = ?', [req.params.id, portalUser.id]);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const { name, description, prompt, role, capabilities, figure_type, figure, bot_name, elevenlabs_voice_id } = req.body;
      await db.execute(
        `UPDATE user_personas SET name=?, description=?, prompt=?, role=?, capabilities=?, figure_type=?, figure=?, bot_name=?, elevenlabs_voice_id=? WHERE id=? AND portal_user_id=?`,
        [name, description || '', prompt || '', role || '', capabilities || '', figure_type || 'agent-m', figure || '', bot_name || '', elevenlabs_voice_id || null, req.params.id, portalUser.id]
      );
      res.json({ ok: true });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'You already have a persona with that name' });
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/my/personas/:id/bot', authRequired, apiKeysRequired, permRequired('personas.link_bot'), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [[existing]] = await db.execute('SELECT id FROM user_personas WHERE id = ? AND portal_user_id = ?', [req.params.id, portalUser.id]);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const { bot_name } = req.body;
      await db.execute('UPDATE user_personas SET bot_name = ? WHERE id = ? AND portal_user_id = ?', [bot_name || '', req.params.id, portalUser.id]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/my/personas/:id', authRequired, apiKeysRequired, permRequired('personas.delete'), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      await db.execute('DELETE FROM user_personas WHERE id = ? AND portal_user_id = ?', [req.params.id, portalUser.id]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── Teams ─────────────────────────────────────────────────────────────────
  app.get('/api/my/teams', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [teams] = await db.execute(
        `SELECT ut.*, at.name AS source_marketplace_team_name
         FROM user_teams ut
         LEFT JOIN agent_teams at ON at.id = ut.source_team_id
         WHERE ut.portal_user_id = ? ORDER BY ut.name ASC`,
        [portalUser.id]
      );
      for (const team of teams) {
        const [members] = await db.execute(
          `SELECT utm.id, utm.role, up.id AS persona_id, up.name, up.description, up.figure_type, up.figure, up.bot_name,
                  up.source_persona_id, ap.name AS source_persona_name
           FROM user_team_members utm
           JOIN user_personas up ON up.id = utm.user_persona_id
           LEFT JOIN agent_personas ap ON ap.id = up.source_persona_id
           WHERE utm.user_team_id = ?`,
          [team.id]
        );
        team.members = members;
      }
      res.json({ ok: true, teams });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/my/teams/:id', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [[team]] = await db.execute(
        `SELECT ut.*, at.name AS source_marketplace_team_name
         FROM user_teams ut
         LEFT JOIN agent_teams at ON at.id = ut.source_team_id
         WHERE ut.id = ? AND ut.portal_user_id = ?`,
        [req.params.id, portalUser.id]
      );
      if (!team) return res.status(404).json({ error: 'Not found' });
      const [members] = await db.execute(
        `SELECT utm.id, utm.role, up.id AS persona_id, up.name, up.description, up.figure_type, up.figure, up.bot_name,
                up.source_persona_id, ap.name AS source_persona_name
         FROM user_team_members utm
         JOIN user_personas up ON up.id = utm.user_persona_id
         LEFT JOIN agent_personas ap ON ap.id = up.source_persona_id
         WHERE utm.user_team_id = ?
         ORDER BY utm.id ASC`,
        [team.id]
      );
      res.json({ ok: true, team: { ...team, members, flows: [] } });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/my/teams', authRequired, apiKeysRequired, permRequired('teams.create'), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const { name, description, orchestrator_prompt, execution_mode, tasks_json, language, default_room_id } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
      const [result] = await db.execute(
        `INSERT INTO user_teams (portal_user_id, name, description, orchestrator_prompt, execution_mode, tasks_json, language, default_room_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        [portalUser.id, name.trim(), description || '', orchestrator_prompt || '', execution_mode || 'concurrent', JSON.stringify(tasks_json || []), language || 'en', Number(default_room_id) || 50]
      );
      await setDefaultUserTeamIfUnset(portalUser.id, result.insertId);
      res.json({ ok: true, id: result.insertId });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'You already have a team with that name' });
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/my/teams/:id', authRequired, apiKeysRequired, permRequired('teams.edit'), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [[existing]] = await db.execute('SELECT id FROM user_teams WHERE id = ? AND portal_user_id = ?', [req.params.id, portalUser.id]);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const { name, description, orchestrator_prompt, execution_mode, tasks_json, language, default_room_id } = req.body;
      await db.execute(
        `UPDATE user_teams SET name=?, description=?, orchestrator_prompt=?, execution_mode=?, tasks_json=?, language=?, default_room_id=? WHERE id=? AND portal_user_id=?`,
        [name, description || '', orchestrator_prompt || '', execution_mode || 'concurrent', JSON.stringify(tasks_json || []), language || 'en', Number(default_room_id) || 50, req.params.id, portalUser.id]
      );
      res.json({ ok: true });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'You already have a team with that name' });
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/my/teams/:id', authRequired, apiKeysRequired, permRequired('teams.delete'), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const teamId = Number(req.params.id);
      const [memRows] = await db.execute(
        'SELECT user_persona_id FROM user_team_members WHERE user_team_id = ?',
        [teamId]
      );
      const personaIds = memRows.map((r) => r.user_persona_id);
      await clearDefaultUserTeamIfPointsTo(portalUser.id, teamId);
      await db.execute('DELETE FROM user_teams WHERE id = ? AND portal_user_id = ?', [teamId, portalUser.id]);
      await deleteOrphanedForkedPersonas(portalUser.id, personaIds);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/my/teams/:id/members', authRequired, apiKeysRequired, permRequired('teams.edit'), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [[team]] = await db.execute('SELECT id FROM user_teams WHERE id = ? AND portal_user_id = ?', [req.params.id, portalUser.id]);
      if (!team) return res.status(404).json({ error: 'Team not found' });
      const { persona_id, role } = req.body;
      const [[persona]] = await db.execute('SELECT id FROM user_personas WHERE id = ? AND portal_user_id = ?', [persona_id, portalUser.id]);
      if (!persona) return res.status(400).json({ error: 'Persona not found or not yours' });
      await db.execute(
        'INSERT IGNORE INTO user_team_members (user_team_id, user_persona_id, role) VALUES (?,?,?)',
        [req.params.id, persona_id, role || '']
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.patch('/api/my/teams/:id/members/:memberId', authRequired, apiKeysRequired, permRequired('teams.edit'), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [[team]] = await db.execute('SELECT id FROM user_teams WHERE id = ? AND portal_user_id = ?', [req.params.id, portalUser.id]);
      if (!team) return res.status(404).json({ error: 'Team not found' });
      const { role } = req.body;
      await db.execute('UPDATE user_team_members SET role = ? WHERE id = ? AND user_team_id = ?', [role ?? '', req.params.memberId, req.params.id]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/my/teams/:id/members/:memberId', authRequired, apiKeysRequired, permRequired('teams.edit'), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [[team]] = await db.execute('SELECT id FROM user_teams WHERE id = ? AND portal_user_id = ?', [req.params.id, portalUser.id]);
      if (!team) return res.status(404).json({ error: 'Team not found' });
      await db.execute('DELETE FROM user_team_members WHERE id = ? AND user_team_id = ?', [req.params.memberId, req.params.id]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.patch('/api/my/teams/:id/room', authRequired, apiKeysRequired, permRequired('teams.deploy'), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [[team]] = await db.execute('SELECT id FROM user_teams WHERE id = ? AND portal_user_id = ?', [req.params.id, portalUser.id]);
      if (!team) return res.status(404).json({ error: 'Not found' });
      const { default_room_id } = req.body;
      await db.execute(
        'UPDATE user_teams SET default_room_id=? WHERE id=? AND portal_user_id=?',
        [Number(default_room_id) || 0, req.params.id, portalUser.id]
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/my/teams/:id/stop', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [[team]] = await db.execute('SELECT id, default_room_id FROM user_teams WHERE id = ? AND portal_user_id = ?', [req.params.id, portalUser.id]);
      if (!team) return res.status(404).json({ error: 'Team not found' });
      const room_id = Number(req.body?.room_id) || team.default_room_id;
      if (!room_id) return res.status(400).json({ error: 'room_id required' });
      const r = await fetch(`${AGENT_TRIGGER_URL}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(r.status).json({ error: data.error || 'Stop failed' });
      res.json({ ok: true, ...data });
    } catch (err) { res.status(502).json({ error: 'Agent trigger unavailable: ' + err.message }); }
  });

  app.post('/api/my/teams/:id/trigger', authRequired, apiKeysRequired, permRequired('teams.deploy'), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      if (!(await portalUserHasAnthropicApiKey(portalUser.id))) {
        return res.status(400).json({ error: 'Add your Anthropic API key in Account settings before deploying.' });
      }
      const [[team]] = await db.execute('SELECT * FROM user_teams WHERE id = ? AND portal_user_id = ?', [req.params.id, portalUser.id]);
      if (!team) return res.status(404).json({ error: 'Team not found' });

      const { room_id } = req.body;
      const hotelEnabled = !!portalUser.hotel_enabled;
      const resolvedRoomId = hotelEnabled ? (Number(room_id) || team.default_room_id || null) : null;

      const [members] = await db.execute(
        `SELECT up.name, up.role AS persona_role, up.capabilities, up.prompt, up.figure_type, up.bot_name, utm.role AS team_role
         FROM user_team_members utm JOIN user_personas up ON up.id = utm.user_persona_id
         WHERE utm.user_team_id = ?`, [team.id]
      );

      if (members.length === 0) return res.status(400).json({ error: 'Team has no members. Add at least one persona.' });

      if (hotelEnabled) {
        if (!resolvedRoomId) return res.status(400).json({ error: 'No room selected. Set a default room for this team in the team settings.' });
        const [[room]] = await db.execute('SELECT id, name FROM rooms WHERE id = ? LIMIT 1', [resolvedRoomId]);
        if (!room) return res.status(400).json({ error: `Room ${resolvedRoomId} does not exist in the hotel.` });

        const unlinked = members.filter(m => !m.bot_name?.trim());
        if (unlinked.length > 0) {
          return res.status(400).json({
            error: `Cannot launch: ${unlinked.map(m => `"${m.name}"`).join(', ')} ${unlinked.length === 1 ? 'has' : 'have'} no bot linked.`,
          });
        }

        const botNames = members.map(m => m.bot_name).filter(Boolean);
        if (botNames.length > 0) {
          const placeholders = botNames.map(() => '?').join(',');
          const [foundBots] = await db.execute(
            `SELECT name, room_id FROM bots WHERE name IN (${placeholders})`,
            botNames
          );
          const foundNames = new Set(foundBots.map(b => b.name.toLowerCase()));
          const deletedBots = botNames.filter(n => !foundNames.has(n.toLowerCase()));
          if (deletedBots.length > 0) {
            return res.status(400).json({
              error: `Bot${deletedBots.length > 1 ? 's' : ''} no longer exist in the hotel: ${deletedBots.map(n => `"${n}"`).join(', ')}. Reassign the agent${deletedBots.length > 1 ? 's' : ''} to a valid bot.`,
              deleted_bots: deletedBots,
            });
          }
          const wrongRoom = foundBots.filter(b => b.room_id > 0 && Number(b.room_id) !== resolvedRoomId);
          if (wrongRoom.length > 0) {
            return res.status(400).json({
              error: `Bot ${wrongRoom.map(b => `"${b.name}"`).join(', ')} already active in room ${wrongRoom[0].room_id}.`,
            });
          }
        }
      }

      const [mcpTokenRows] = await db.execute(
        `SELECT id FROM portal_mcp_tokens WHERE portal_user_id = ? AND status = 'active' AND expires_at > NOW() AND token_raw_encrypted IS NOT NULL LIMIT 1`,
        [portalUser.id]
      );
      if (mcpTokenRows.length === 0) {
        return res.status(400).json({ error: 'No active MCP token found. Go to Settings → MCP Tokens and generate one before deploying.' });
      }

      const taskMode = req.body.task_mode || 'team_tasks';
      let sessionGoal = '';
      if (taskMode === 'session_goal') {
        sessionGoal = (req.body.session_goal || '').trim();
        if (sessionGoal.length < 10) {
          return res.status(400).json({ error: 'session_goal must be at least 10 characters' });
        }
        if (sessionGoal.length > 4000) {
          return res.status(400).json({ error: 'session_goal must be at most 4000 characters' });
        }
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
          return res.status(400).json({
            error: `Team needs integrations that are not connected: ${missing.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')}. Go to Settings → Integrations to connect them first.`,
            missing_integrations: missing,
          });
        }
      }

      const triggerPayload = {
        team_id: team.id,
        user_team: true,
        room_id: resolvedRoomId,
        hotel_integrated: hotelEnabled,
        triggered_by: req.user.username,
        portal_url: process.env.PORTAL_PUBLIC_URL || `http://agent-portal:3000`,
        portal_user_id: portalUser.id,
        task_mode: taskMode,
      };
      if (taskMode === 'session_goal') {
        triggerPayload.session_goal = sessionGoal;
      }
      const { ok, data } = await forwardToAgentTrigger(triggerPayload);
      if (!ok) return res.status(502).json({ error: data.error || 'Trigger failed' });
      res.json({ ok: true, ...data });
    } catch (err) { res.status(502).json({ error: 'Agent trigger unavailable: ' + err.message }); }
  });

  // ─── Marketplace fork tracking ─────────────────────────────────────────────
  app.get('/api/my/marketplace-forks', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [rows] = await db.execute(
        `SELECT id, source_team_id, name, marketplace_install_kind
         FROM user_teams
         WHERE portal_user_id = ? AND source_team_id IS NOT NULL
         ORDER BY id ASC`,
        [portalUser.id]
      );
      res.json({ ok: true, forks: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/my/installed-team-ids', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [rows] = await db.execute(
        `SELECT DISTINCT source_team_id AS sid FROM user_teams
         WHERE portal_user_id = ? AND source_team_id IS NOT NULL
           AND marketplace_install_kind = 'full'`,
        [portalUser.id]
      );
      res.json({ ok: true, installed: rows.map((r) => r.sid) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
