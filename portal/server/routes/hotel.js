// /api/hotel/* — SSO join, room list, portal-side bot config CRUD + RCON sync.
// /api/hotel/status stays inline in server.js as a singleton next to /api/health.
import { v4 as uuidv4 } from 'uuid';

export function registerHotelRoutes(app, ctx) {
  const {
    db,
    authRequired,
    rconCommand,
    findLiveBot,
    portalPkgVersion,
    distMainJsFingerprint,
    HABBO_BASE_URL,
    AI_SERVICE_URL,
    RCON_HOST,
    RCON_PORT,
  } = ctx;

  app.post('/api/hotel/join', authRequired, async (req, res) => {
    const ticket = uuidv4();
    await db.execute('UPDATE users SET auth_ticket = ? WHERE id = ? LIMIT 1', [ticket, req.user.habbo_user_id]);
    res.json({
      ok: true,
      login_url: `${HABBO_BASE_URL}?sso=${ticket}`,
    });
  });

  app.get('/api/hotel/rooms', authRequired, async (req, res) => {
    try {
      const [rows] = await db.execute(
        'SELECT id, name, owner_id FROM rooms ORDER BY id ASC LIMIT 200'
      );
      res.json({ ok: true, rooms: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/hotel/bots', authRequired, async (req, res) => {
    const habboUserId = req.user.habbo_user_id;

    await db.execute(
      `DELETE a FROM ai_agent_configs a
       WHERE a.user_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM bots b
         WHERE b.user_id = a.user_id
         AND (
           (a.bot_id IS NOT NULL AND a.bot_id != 0 AND b.id = a.bot_id)
           OR (
             (a.bot_id IS NULL OR a.bot_id = 0)
             AND b.id = (
               SELECT MAX(b2.id) FROM bots b2
               WHERE b2.user_id = a.user_id AND LOWER(TRIM(b2.name)) = LOWER(TRIM(a.name))
             )
           )
         )
       )`,
      [habboUserId]
    );

    const [rows] = await db.execute(
      `
      SELECT
        a.id, a.name, a.persona, COALESCE(b.motto, a.motto, '') AS motto, COALESCE(b.figure, a.figure) AS figure, a.gender,
        a.room_id AS config_room_id, a.bot_id, a.active, a.created_at,
        r.name AS room_name,
        b.room_id AS db_room_id,
        br.name AS db_room_name
      FROM ai_agent_configs a
      INNER JOIN bots b ON b.user_id = a.user_id AND (
        (a.bot_id IS NOT NULL AND a.bot_id != 0 AND b.id = a.bot_id)
        OR (
          (a.bot_id IS NULL OR a.bot_id = 0)
          AND b.id = (
            SELECT MAX(b3.id) FROM bots b3
            WHERE b3.user_id = a.user_id AND LOWER(TRIM(b3.name)) = LOWER(TRIM(a.name))
          )
        )
      )
      LEFT JOIN rooms r ON r.id = a.room_id
      LEFT JOIN rooms br ON br.id = b.room_id
      WHERE a.user_id = ?
      ORDER BY a.active DESC, a.created_at DESC
      `,
      [habboUserId]
    );

    const liveByBotId = {};
    const liveByName = {};
    try {
      const MCP_URL = (process.env.HOTEL_MCP_URL || 'http://habbo-mcp:3003/mcp').replace(/\/?$/, '');
      const MCP_KEY = process.env.MCP_API_KEY || '';
      const headers = { 'content-type': 'application/json' };
      if (MCP_KEY) headers['authorization'] = `Bearer ${MCP_KEY}`;
      const mcpRes = await fetch(MCP_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 'bots', method: 'tools/call', params: { name: 'list_bots', arguments: {} } }),
        signal: AbortSignal.timeout(4000),
      });
      const mcpData = await mcpRes.json();
      const allBots = JSON.parse(mcpData.result?.content?.[0]?.text || '{}').bots || [];
      for (const b of allBots) {
        if (b.room_id > 0 && b.id != null) liveByBotId[b.id] = b;
        if (b.room_id > 0 && b.name) liveByName[b.name.toLowerCase()] = b;
      }
    } catch { /* MCP unreachable */ }

    const [roomRows] = await db.execute('SELECT id, caption AS name FROM rooms').catch(() => [[]]);
    const roomNames = Object.fromEntries((roomRows || []).map(r => [r.id, r.name]));

    const roomIdsToVerify = new Set();
    for (const r of rows) {
      let cand = null;
      if (r.bot_id && liveByBotId[r.bot_id]) cand = liveByBotId[r.bot_id];
      else if (!r.bot_id) cand = liveByName[r.name?.toLowerCase()] || null;
      if (cand && cand.room_id > 0) roomIdsToVerify.add(cand.room_id);
    }
    const roomLiveSets = new Map();
    let rconRoomsOk = 0;
    let rconLastErr = null;
    await Promise.all(
      [...roomIdsToVerify].map(async (rid) => {
        try {
          const rc = await rconCommand('roomlivebots', { room_id: rid });
          if (rc.status === 0 && rc.message) {
            const j = JSON.parse(rc.message);
            if (j.loaded === true && Array.isArray(j.bot_ids)) {
              roomLiveSets.set(rid, new Set(j.bot_ids));
            } else {
              roomLiveSets.set(rid, new Set());
            }
            rconRoomsOk++;
          } else {
            rconLastErr = rc.message || `status ${rc.status}`;
          }
        } catch (e) {
          rconLastErr = e?.message || String(e);
        }
      })
    );
    const rconRoomsRequested = roomIdsToVerify.size;
    const rconVerified =
      rconRoomsRequested === 0 || rconRoomsOk === rconRoomsRequested;

    const bots = rows.map((r) => {
      let cand = null;
      if (r.bot_id && liveByBotId[r.bot_id]) cand = liveByBotId[r.bot_id];
      else if (!r.bot_id) cand = liveByName[r.name?.toLowerCase()] || null;
      let live = null;
      if (cand && cand.room_id > 0) {
        const set = roomLiveSets.get(cand.room_id);
        if (set && set.has(cand.id)) live = cand;
        else if (set === undefined) live = cand;
      }
      const ghostStaleDb = !!(cand && cand.room_id > 0 && !live && roomLiveSets.has(cand.room_id));
      return {
        ...r,
        live_room_id: live?.room_id || 0,
        live_room_name: live ? (roomNames[live.room_id] || null) : null,
        ghost_stale_db: ghostStaleDb,
        stale_db_room_id: ghostStaleDb ? cand.room_id : 0,
      };
    });

    res.json({
      bots,
      meta: {
        portalVersion: portalPkgVersion,
        distMainJs: distMainJsFingerprint(),
        rcon: {
          host: RCON_HOST,
          port: RCON_PORT,
          roomsRequested: rconRoomsRequested,
          roomsOk: rconRoomsOk,
          verified: rconVerified,
          lastError: rconVerified ? null : (rconLastErr || 'RCON did not confirm all rooms'),
        },
      },
    });
  });

  app.post('/api/hotel/bots/sync', authRequired, async (req, res) => {
    const habboUserId = req.user.habbo_user_id;
    try {
      const [ownedBots] = await db.execute(
        `SELECT id, name, motto, figure, gender FROM bots WHERE user_id = ? ORDER BY id ASC`,
        [habboUserId]
      );
      const ownedBotsById = new Map(ownedBots.map(b => [b.id, b]));

      const [configs] = await db.execute(
        'SELECT id, bot_id, name, figure, motto FROM ai_agent_configs WHERE user_id = ?',
        [habboUserId]
      );

      const coveredBotIds = new Set();
      let removed = 0, updated = 0, alreadyHad = 0;

      for (const config of configs) {
        let matchedBot = null;

        if (config.bot_id != null && config.bot_id !== 0) {
          matchedBot = ownedBotsById.get(config.bot_id) ?? null;
        }

        if (!matchedBot) {
          const nameKey = String(config.name || '').toLowerCase();
          for (const b of ownedBots) {
            if (coveredBotIds.has(b.id)) continue;
            if (b.name?.toLowerCase() === nameKey) { matchedBot = b; break; }
          }
        }

        if (!matchedBot) {
          await db.execute('DELETE FROM ai_agent_configs WHERE id = ? AND user_id = ?', [config.id, habboUserId]);
          removed++;
          continue;
        }

        coveredBotIds.add(matchedBot.id);

        const newFigure    = matchedBot.figure || config.figure;
        const newMotto     = matchedBot.motto  ?? config.motto;
        const newBotId     = matchedBot.id;
        const botIdChanged = config.bot_id == null || config.bot_id !== newBotId;
        if (newFigure !== config.figure || newMotto !== config.motto || botIdChanged) {
          await db.execute(
            'UPDATE ai_agent_configs SET figure=?, motto=?, bot_id=? WHERE id=?',
            [newFigure, newMotto, newBotId, config.id]
          );
          updated++;
        } else {
          alreadyHad++;
        }
      }

      let imported = 0;
      for (const b of ownedBots) {
        if (coveredBotIds.has(b.id)) continue;
        const gender = b.gender === 'F' ? 'F' : 'M';
        await db.execute(
          `INSERT INTO ai_agent_configs (user_id, name, persona, motto, figure, gender, room_id, active, bot_id)
           VALUES (?, ?, '', ?, ?, ?, 0, 1, ?)`,
          [habboUserId, b.name, b.motto || '', b.figure || '', gender, b.id]
        );
        imported++;
      }

      res.json({ ok: true, imported, updated, removed, alreadyHad, totalOwned: ownedBots.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/hotel/bots/:id', authRequired, async (req, res) => {
    const configId = Number.parseInt(req.params.id, 10);
    const habboUserId = req.user.habbo_user_id;

    const name    = (String(req.body.name    || '')).trim().slice(0, 25) || null;
    const persona = (String(req.body.persona || '')).trim()              || null;
    const motto   = req.body.motto !== undefined ? (String(req.body.motto)).trim().slice(0, 100) : null;
    const figure  = (String(req.body.figure  || '')).trim()              || null;
    const gender  = ['M', 'F'].includes(req.body.gender) ? req.body.gender : null;

    const [[config]] = await db.execute(
      'SELECT * FROM ai_agent_configs WHERE id=? AND user_id=? AND active=1',
      [configId, habboUserId]
    );
    if (!config) return res.status(404).json({ error: 'Not found' });

    const newName    = name    || config.name;
    const newPersona = persona || config.persona;
    const newMotto   = motto   !== null ? motto : (config.motto || '');
    const newFigure  = figure  || config.figure;
    const newGender  = gender  || config.gender;

    await db.execute(
      'UPDATE ai_agent_configs SET name=?, persona=?, motto=?, figure=?, gender=? WHERE id=?',
      [newName, newPersona, newMotto, newFigure, newGender, configId]
    );

    const liveBot = await findLiveBot(config, habboUserId);
    if (liveBot) {
      await db.execute(
        `UPDATE bots SET name=?, motto=?, figure=?, gender=? WHERE id=?`,
        [newName, newMotto, newFigure, newGender, liveBot.id]
      );
      if (!config.bot_id) {
        await db.execute('UPDATE ai_agent_configs SET bot_id=? WHERE id=?', [liveBot.id, configId]);
      }
    }

    let personaUpdated = false;
    if (newPersona !== config.persona) {
      const [[keyRow]] = await db.execute(
        'SELECT api_key, provider FROM ai_api_keys WHERE user_id=? AND verified=1',
        [habboUserId]
      );
      if (keyRow) {
        const updatedConfig = { ...config, name: newName };
        const bot = await findLiveBot(updatedConfig, habboUserId);
        if (bot) {
          try {
            const r = await fetch(`${AI_SERVICE_URL}/api/init-session`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bot_id: bot.id, user_id: habboUserId, persona: newPersona, api_key: keyRow.api_key, provider: keyRow.provider || 'anthropic' }),
            });
            personaUpdated = r.ok;
          } catch { /* AI service unavailable */ }
        }
      }
    }

    let liveUpdated = false;
    let liveUpdateError = null;
    if (liveBot) {
      const update = {
        bot_id: liveBot.id,
        name:   newName   !== config.name         ? newName   : undefined,
        motto:  newMotto  !== (config.motto || '') ? newMotto  : undefined,
        figure: newFigure !== config.figure        ? newFigure : undefined,
        gender: newGender !== config.gender        ? newGender : undefined,
      };
      const hasChanges = update.name !== undefined || update.motto !== undefined
                      || update.figure !== undefined || update.gender !== undefined;
      if (hasChanges) {
        try {
          const rconResult = await rconCommand('updatebotvisuals', update);
          liveUpdated = rconResult?.status === 0 || rconResult?.message === 'updated live';
          if (!liveUpdated) liveUpdateError = rconResult?.message || 'Bot not in active room';
        } catch (e) {
          liveUpdateError = e.message || 'RCON unavailable';
        }
      } else {
        liveUpdated = true;
      }
    } else {
      liveUpdateError = 'Bot not linked — sync bots and try again';
    }

    const visualChanged = newName !== config.name || newFigure !== config.figure || newGender !== config.gender;
    res.json({ ok: true, personaUpdated, visualChanged, liveUpdated, liveUpdateError });
  });

  app.delete('/api/hotel/bots/:id', authRequired, async (req, res) => {
    const configId    = Number.parseInt(req.params.id, 10);
    const habboUserId = req.user.habbo_user_id;

    const [[config]] = await db.execute(
      'SELECT id, bot_id, name FROM ai_agent_configs WHERE id=? AND user_id=?',
      [configId, habboUserId]
    );
    if (!config) return res.status(404).json({ error: 'Not found' });

    let botRow = null;
    if (config.bot_id) {
      const [[b]] = await db.execute('SELECT id FROM bots WHERE id=? AND user_id=?', [config.bot_id, habboUserId]);
      botRow = b || null;
    }
    if (!botRow) {
      const [[b]] = await db.execute(
        `SELECT id FROM bots WHERE user_id=? AND LOWER(TRIM(name))=LOWER(TRIM(?)) ORDER BY id DESC LIMIT 1`,
        [habboUserId, config.name]
      );
      botRow = b || null;
    }

    let rconError = null;
    let rconResult = null;
    if (botRow) {
      try {
        rconResult = await rconCommand('deletebot', { bot_id: botRow.id });
        console.log(`[delete bot ${botRow.id}] RCON deletebot response:`, JSON.stringify(rconResult));
      } catch (e) {
        rconError = e?.message || String(e);
        console.error(`[delete bot ${botRow.id}] RCON deletebot failed: ${rconError}`);
      }
      await db.execute('DELETE FROM bots WHERE id=?', [botRow.id]);
    }

    await db.execute('DELETE FROM ai_agent_configs WHERE id=?', [configId]);
    res.json({ ok: true, rconResult, rconError, botRowId: botRow?.id ?? null });
  });
}
