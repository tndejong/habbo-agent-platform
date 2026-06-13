// /api/marketplace/* — fork a marketplace team (full or solo), uninstall forks.

export function registerMarketplaceRoutes(app, ctx) {
  const {
    db,
    authRequired,
    permRequired,
    getPortalUserByHabboUserId,
    setDefaultUserTeamIfUnset,
    clearDefaultUserTeamIfPointsTo,
    deleteOrphanedForkedPersonas,
    SOLO_MARKETPLACE_ORCHESTRATOR,
  } = ctx;

  app.post('/api/marketplace/teams/:id/install', authRequired, permRequired('marketplace.install'), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const marketplaceTeamId = Number(req.params.id);

      const [[mTeam]] = await db.execute('SELECT * FROM agent_teams WHERE id = ?', [marketplaceTeamId]);
      if (!mTeam) return res.status(404).json({ error: 'Marketplace team not found' });
      const [mMembers] = await db.execute(
        `SELECT p.*, atm.role AS team_role
         FROM agent_team_members atm JOIN agent_personas p ON p.id = atm.persona_id
         WHERE atm.team_id = ?`, [marketplaceTeamId]
      );

      const rawAssignments = req.body?.bot_assignments;
      const botAssignments = (rawAssignments && typeof rawAssignments === 'object' && !Array.isArray(rawAssignments))
        ? rawAssignments : {};

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        const [[dupFull]] = await conn.execute(
          `SELECT id FROM user_teams WHERE portal_user_id = ? AND source_team_id = ? AND marketplace_install_kind = 'full' FOR UPDATE`,
          [portalUser.id, marketplaceTeamId]
        );
        if (dupFull) {
          await conn.rollback();
          conn.release();
          return res.status(409).json({ error: 'Full team already forked', user_team_id: dupFull.id });
        }

        const personaIdMap = {};
        const nameMap = {};
        for (const mp of mMembers) {
          let suffix = '';
          let attempts = 0;
          while (attempts < 5) {
            const candidateName = `${mp.name}${suffix}`;
            const [[dup]] = await conn.execute(
              'SELECT id FROM user_personas WHERE portal_user_id = ? AND name = ?',
              [portalUser.id, candidateName]
            );
            if (!dup) {
              const botName = String(botAssignments[mp.name] ?? '').trim();
              const [result] = await conn.execute(
                `INSERT INTO user_personas (portal_user_id, source_persona_id, name, description, prompt, role, capabilities, figure_type, figure, bot_name)
                 VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [portalUser.id, mp.id, candidateName, mp.description || '', mp.prompt || '', mp.role || '', mp.capabilities || '', mp.figure_type || 'agent-m', mp.figure || '', botName]
              );
              personaIdMap[mp.id] = result.insertId;
              if (suffix !== '') nameMap[mp.name] = candidateName;
              break;
            }
            attempts++;
            suffix = ` (${attempts + 1})`;
          }
        }

        const missing = mMembers.filter(mp => !personaIdMap[mp.id]);
        if (missing.length > 0) throw new Error(`Could not fork personas (name collision after 5 attempts): ${missing.map(m => m.name).join(', ')}`);

        let tasksJson = mTeam.tasks_json || '[]';
        if (Object.keys(nameMap).length > 0) {
          try {
            const tasks = JSON.parse(tasksJson);
            for (const task of tasks) {
              if (task.assign_to && nameMap[task.assign_to]) {
                task.assign_to = nameMap[task.assign_to];
              }
            }
            tasksJson = JSON.stringify(tasks);
          } catch { /* malformed tasks_json — use as-is */ }
        }

        const [teamResult] = await conn.execute(
          `INSERT INTO user_teams (portal_user_id, source_team_id, name, description, orchestrator_prompt, execution_mode, tasks_json, language, default_room_id, marketplace_install_kind)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [portalUser.id, marketplaceTeamId, mTeam.name, mTeam.description || '', mTeam.orchestrator_prompt || '', mTeam.execution_mode || 'concurrent', tasksJson, mTeam.language || 'en', 50, 'full']
        );
        const userTeamId = teamResult.insertId;

        for (const mp of mMembers) {
          const userPersonaId = personaIdMap[mp.id];
          if (userPersonaId) {
            await conn.execute(
              'INSERT INTO user_team_members (user_team_id, user_persona_id, role) VALUES (?,?,?)',
              [userTeamId, userPersonaId, mp.team_role || '']
            );
          }
        }

        await conn.commit();
        await setDefaultUserTeamIfUnset(portalUser.id, userTeamId);
        res.json({ ok: true, user_team_id: userTeamId });
      } catch (innerErr) {
        await conn.rollback();
        throw innerErr;
      } finally {
        conn.release();
      }
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Team already forked or name conflict' });
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/marketplace/teams/:teamId/personas/:personaId/install', authRequired, permRequired('marketplace.install'), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const marketplaceTeamId = Number(req.params.teamId);
      const marketplacePersonaId = Number(req.params.personaId);

      const [[mTeam]] = await db.execute('SELECT * FROM agent_teams WHERE id = ?', [marketplaceTeamId]);
      if (!mTeam) return res.status(404).json({ error: 'Marketplace team not found' });

      const [[mp]] = await db.execute(
        `SELECT p.*, atm.role AS team_role FROM agent_team_members atm
         JOIN agent_personas p ON p.id = atm.persona_id
         WHERE atm.team_id = ? AND p.id = ?`,
        [marketplaceTeamId, marketplacePersonaId]
      );
      if (!mp) return res.status(404).json({ error: 'Persona not in this marketplace team' });

      const rawAssignments = req.body?.bot_assignments;
      const botAssignments = (rawAssignments && typeof rawAssignments === 'object' && !Array.isArray(rawAssignments))
        ? rawAssignments : {};
      const botName = String(botAssignments[mp.name] ?? '').trim();

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        let userPersonaId;
        let suffix = '';
        let attempts = 0;
        while (attempts < 5) {
          const candidateName = `${mp.name}${suffix}`;
          const [[dup]] = await conn.execute(
            'SELECT id FROM user_personas WHERE portal_user_id = ? AND name = ?',
            [portalUser.id, candidateName]
          );
          if (!dup) {
            const [result] = await conn.execute(
              `INSERT INTO user_personas (portal_user_id, source_persona_id, name, description, prompt, role, capabilities, figure_type, figure, bot_name)
               VALUES (?,?,?,?,?,?,?,?,?,?)`,
              [portalUser.id, mp.id, candidateName, mp.description || '', mp.prompt || '', mp.role || '', mp.capabilities || '', mp.figure_type || 'agent-m', mp.figure || '', botName]
            );
            userPersonaId = result.insertId;
            break;
          }
          attempts++;
          suffix = ` (${attempts + 1})`;
        }
        if (!userPersonaId) throw new Error('Could not fork persona (name collision after 5 attempts)');

        let teamName = `${mp.name} · ${mTeam.name}`;
        for (let tAttempt = 0; tAttempt < 5; tAttempt++) {
          const tn = tAttempt === 0 ? teamName : `${mp.name} · ${mTeam.name} (${tAttempt + 1})`;
          const [[tdup]] = await conn.execute(
            'SELECT id FROM user_teams WHERE portal_user_id = ? AND name = ?',
            [portalUser.id, tn]
          );
          if (!tdup) {
            teamName = tn;
            break;
          }
          if (tAttempt === 4) throw new Error('Could not allocate unique team name');
        }

        const [teamResult] = await conn.execute(
          `INSERT INTO user_teams (portal_user_id, source_team_id, name, description, orchestrator_prompt, execution_mode, tasks_json, language, default_room_id, marketplace_install_kind)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [portalUser.id, marketplaceTeamId, teamName, mTeam.description || '', SOLO_MARKETPLACE_ORCHESTRATOR, 'concurrent', '[]', mTeam.language || 'en', 50, 'solo']
        );
        const userTeamId = teamResult.insertId;
        await conn.execute(
          'INSERT INTO user_team_members (user_team_id, user_persona_id, role) VALUES (?,?,?)',
          [userTeamId, userPersonaId, mp.team_role || '']
        );
        await conn.commit();
        await setDefaultUserTeamIfUnset(portalUser.id, userTeamId);
        res.json({ ok: true, user_team_id: userTeamId, user_persona_id: userPersonaId });
      } catch (innerErr) {
        await conn.rollback();
        throw innerErr;
      } finally {
        conn.release();
      }
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Name conflict' });
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/marketplace/forks/:userTeamId', authRequired, permRequired('marketplace.uninstall'), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const userTeamId = Number(req.params.userTeamId);
      const [[team]] = await db.execute(
        'SELECT id, source_team_id FROM user_teams WHERE id = ? AND portal_user_id = ?',
        [userTeamId, portalUser.id]
      );
      if (!team) return res.status(404).json({ error: 'Team not found' });
      if (!team.source_team_id) return res.status(400).json({ error: 'Not a marketplace fork' });

      const [forkedMembers] = await db.execute(
        `SELECT up.id FROM user_team_members utm
         JOIN user_personas up ON up.id = utm.user_persona_id
         WHERE utm.user_team_id = ? AND up.source_persona_id IS NOT NULL`,
        [userTeamId]
      );
      const personaIds = forkedMembers.map((m) => m.id);
      await clearDefaultUserTeamIfPointsTo(portalUser.id, userTeamId);
      await db.execute('DELETE FROM user_team_members WHERE user_team_id = ?', [userTeamId]);
      await db.execute('DELETE FROM user_teams WHERE id = ? AND portal_user_id = ?', [userTeamId, portalUser.id]);
      await deleteOrphanedForkedPersonas(portalUser.id, personaIds);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/marketplace/teams/:id/uninstall', authRequired, permRequired('marketplace.uninstall'), async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const marketplaceTeamId = Number(req.params.id);
      const [rows] = await db.execute(
        'SELECT id FROM user_teams WHERE source_team_id = ? AND portal_user_id = ? ORDER BY id ASC',
        [marketplaceTeamId, portalUser.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'No fork found' });
      if (rows.length > 1) {
        return res.status(409).json({
          error: 'Multiple forks exist — remove a specific fork via DELETE /api/marketplace/forks/:userTeamId',
          fork_ids: rows.map((r) => r.id),
        });
      }
      const userTeamId = rows[0].id;
      const [forkedMembers] = await db.execute(
        `SELECT up.id FROM user_team_members utm
         JOIN user_personas up ON up.id = utm.user_persona_id
         WHERE utm.user_team_id = ? AND up.source_persona_id IS NOT NULL`,
        [userTeamId]
      );
      const personaIds = forkedMembers.map((m) => m.id);
      await clearDefaultUserTeamIfPointsTo(portalUser.id, userTeamId);
      await db.execute('DELETE FROM user_team_members WHERE user_team_id = ?', [userTeamId]);
      await db.execute('DELETE FROM user_teams WHERE id = ? AND portal_user_id = ?', [userTeamId, portalUser.id]);
      await deleteOrphanedForkedPersonas(portalUser.id, personaIds);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
