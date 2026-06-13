// /api/dev/* — developer-only marketplace export/import bundle tooling.

export function registerDevRoutes(app, ctx) {
  const {
    db,
    authRequired,
    permRequired,
    getPortalUserByHabboUserId,
  } = ctx;

  app.get('/api/dev/marketplace/teams/:id/export', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      const [[team]] = await db.execute('SELECT * FROM agent_teams WHERE id = ?', [req.params.id]);
      if (!team) return res.status(404).json({ error: 'Team not found' });

      const [members] = await db.execute(
        `SELECT p.name, p.role, p.capabilities, p.description, p.prompt, p.figure_type, p.figure,
                atm.role AS member_role
         FROM agent_team_members atm
         JOIN agent_personas p ON p.id = atm.persona_id
         WHERE atm.team_id = ?`, [team.id]
      );

      const [flows] = await db.execute(
        `SELECT f.name, f.description, f.tasks_json, f.allowed_tools_json
         FROM agent_flows f
         JOIN agent_team_flows atf ON atf.flow_id = f.id
         WHERE atf.team_id = ?`, [team.id]
      );

      const [templates] = await db.execute(
        'SELECT bot_name, room_id, x, y, rot FROM agent_room_templates WHERE team_id = ?',
        [team.id]
      );

      const safeParse = (v) => { try { return JSON.parse(v || '[]'); } catch { return []; } };

      const bundle = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        team: {
          name: team.name,
          description: team.description || '',
          orchestrator_prompt: team.orchestrator_prompt || '',
          execution_mode: team.execution_mode || 'concurrent',
          tasks_json: safeParse(team.tasks_json),
          language: team.language || 'en',
        },
        personas: members.map(m => ({
          name: m.name,
          role: m.role || '',
          capabilities: m.capabilities || '',
          description: m.description || '',
          prompt: m.prompt || '',
          figure_type: m.figure_type || 'agent-m',
          figure: m.figure || '',
          member_role: m.member_role || '',
        })),
        flows: flows.map(f => ({
          name: f.name,
          description: f.description || '',
          tasks_json: safeParse(f.tasks_json),
          allowed_tools_json: safeParse(f.allowed_tools_json),
        })),
        room_templates: templates.map(t => ({
          bot_name: t.bot_name || '',
          room_id: t.room_id,
          x: t.x, y: t.y, rot: t.rot,
        })),
      };

      const filename = team.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      res.setHeader('Content-Disposition', `attachment; filename="${filename}-team.json"`);
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(bundle, null, 2));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/dev/marketplace/teams/import', authRequired, permRequired('marketplace.manage'), async (req, res) => {
    try {
      const { team: t, personas = [], flows = [], room_templates = [] } = req.body;
      if (!t?.name) return res.status(400).json({ error: 'Bundle missing team.name' });

      const devUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      const userId = devUser?.id ?? null;

      const tasksJson = JSON.stringify(Array.isArray(t.tasks_json) ? t.tasks_json : []);

      await db.execute(
        `INSERT INTO agent_teams (name, description, orchestrator_prompt, execution_mode, tasks_json, language, created_by_user_id)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           description=VALUES(description), orchestrator_prompt=VALUES(orchestrator_prompt),
           execution_mode=VALUES(execution_mode), tasks_json=VALUES(tasks_json),
           language=VALUES(language), updated_at=CURRENT_TIMESTAMP`,
        [t.name, t.description||'', t.orchestrator_prompt||'', t.execution_mode||'concurrent', tasksJson, t.language||'en', userId]
      );
      const [[teamRow]] = await db.execute('SELECT id FROM agent_teams WHERE name = ?', [t.name]);
      const teamId = teamRow.id;

      const linkedPersonaIds = [];
      for (const p of personas) {
        if (!p.name) continue;
        await db.execute(
          `INSERT INTO agent_personas (name, role, capabilities, description, prompt, figure_type, figure, created_by_user_id)
           VALUES (?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             role=VALUES(role), capabilities=VALUES(capabilities), description=VALUES(description),
             prompt=VALUES(prompt), figure_type=VALUES(figure_type), figure=VALUES(figure),
             updated_at=CURRENT_TIMESTAMP`,
          [p.name, p.role||'', p.capabilities||'', p.description||'', p.prompt||'', p.figure_type||'agent-m', p.figure||'', userId]
        );
        const [[pRow]] = await db.execute('SELECT id FROM agent_personas WHERE name = ?', [p.name]);
        linkedPersonaIds.push({ id: pRow.id, member_role: p.member_role || '' });
      }

      await db.execute('DELETE FROM agent_team_members WHERE team_id = ?', [teamId]);
      for (const { id: personaId, member_role } of linkedPersonaIds) {
        await db.execute(
          'INSERT IGNORE INTO agent_team_members (team_id, persona_id, role) VALUES (?,?,?)',
          [teamId, personaId, member_role]
        );
      }

      await db.execute('DELETE FROM agent_team_flows WHERE team_id = ?', [teamId]);
      let flowsUpserted = 0;
      for (const f of flows) {
        if (!f.name) continue;
        await db.execute(
          `INSERT INTO agent_flows (name, description, tasks_json, allowed_tools_json, created_by_user_id)
           VALUES (?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             description=VALUES(description), tasks_json=VALUES(tasks_json),
             allowed_tools_json=VALUES(allowed_tools_json), updated_at=CURRENT_TIMESTAMP`,
          [f.name, f.description||'', JSON.stringify(f.tasks_json||[]), JSON.stringify(f.allowed_tools_json||[]), userId]
        );
        const [[fRow]] = await db.execute('SELECT id FROM agent_flows WHERE name = ?', [f.name]);
        if (fRow) {
          await db.execute('INSERT IGNORE INTO agent_team_flows (team_id, flow_id) VALUES (?,?)', [teamId, fRow.id]);
          flowsUpserted++;
        }
      }

      let templatesUpserted = 0;
      if (room_templates.length > 0) {
        await db.execute('DELETE FROM agent_room_templates WHERE team_id = ?', [teamId]);
        for (const rt of room_templates) {
          if (!rt.bot_name) continue;
          await db.execute(
            'INSERT INTO agent_room_templates (team_id, bot_name, room_id, x, y, rot) VALUES (?,?,?,?,?,?)',
            [teamId, rt.bot_name, rt.room_id||0, rt.x||0, rt.y||0, rt.rot||0]
          );
          templatesUpserted++;
        }
      }

      res.json({ ok: true, team_id: teamId, personas_upserted: linkedPersonaIds.length, flows_upserted: flowsUpserted, templates_upserted: templatesUpserted });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}
