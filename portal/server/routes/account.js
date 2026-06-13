// /api/account/* — default team, API keys, phone number, password change.
// Also /api/my/hotel-enabled (lives semantically with account settings).
import bcrypt from 'bcryptjs';

export function registerAccountRoutes(app, ctx) {
  const {
    db,
    authRequired,
    getPortalUserByHabboUserId,
    encryptApiKey,
    decryptApiKey,
    maskApiKey,
  } = ctx;

  app.get('/api/account/default-team', authRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [teams] = await db.execute(
        'SELECT id, name FROM user_teams WHERE portal_user_id = ? ORDER BY name ASC',
        [portalUser.id]
      );
      res.json({
        ok: true,
        default_user_team_id: portalUser.default_user_team_id ?? null,
        teams,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/account/default-team', authRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const raw = req.body?.default_user_team_id;
      if (raw === null || raw === undefined || raw === '') {
        await db.execute('UPDATE portal_users SET default_user_team_id = NULL WHERE id = ?', [portalUser.id]);
        return res.json({ ok: true, default_user_team_id: null });
      }
      const tid = Number(raw);
      if (!Number.isFinite(tid) || tid <= 0) return res.status(400).json({ error: 'Invalid team id' });
      const [[t]] = await db.execute(
        'SELECT id FROM user_teams WHERE id = ? AND portal_user_id = ?',
        [tid, portalUser.id]
      );
      if (!t) return res.status(404).json({ error: 'Team not found' });
      await db.execute('UPDATE portal_users SET default_user_team_id = ? WHERE id = ?', [tid, portalUser.id]);
      res.json({ ok: true, default_user_team_id: tid });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/account/api-keys', authRequired, async (req, res) => {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });

    const [rows] = await db.execute(
      'SELECT provider, api_key_encrypted, updated_at FROM portal_user_api_keys WHERE portal_user_id = ?',
      [portalUser.id]
    );

    res.json({
      ok: true,
      keys: rows.map(r => {
        const plain = decryptApiKey(r.api_key_encrypted);
        return { provider: r.provider, masked: plain ? maskApiKey(plain) : '(unreadable)', updated_at: r.updated_at };
      }),
    });
  });

  app.post('/api/account/api-keys', authRequired, async (req, res) => {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });

    const { provider = 'anthropic', api_key } = req.body;
    if (!api_key || typeof api_key !== 'string' || api_key.trim().length < 10) {
      return res.status(400).json({ error: 'Invalid API key' });
    }

    const encrypted = encryptApiKey(api_key.trim());

    await db.execute(
      `INSERT INTO portal_user_api_keys (portal_user_id, provider, api_key_encrypted)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE api_key_encrypted = VALUES(api_key_encrypted), updated_at = CURRENT_TIMESTAMP`,
      [portalUser.id, provider, encrypted]
    );

    res.json({ ok: true, message: 'API key saved' });
  });

  app.delete('/api/account/api-keys/:provider', authRequired, async (req, res) => {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });

    await db.execute(
      'DELETE FROM portal_user_api_keys WHERE portal_user_id = ? AND provider = ?',
      [portalUser.id, req.params.provider]
    );

    res.json({ ok: true, message: 'API key removed' });
  });

  app.get('/api/account/phone', authRequired, async (req, res) => {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    res.json({ ok: true, phone_number: portalUser.phone_number ?? null });
  });

  app.post('/api/account/phone', authRequired, async (req, res) => {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });

    const raw = String(req.body?.phone_number || '').trim();
    if (!/^\+[1-9]\d{7,14}$/.test(raw)) {
      return res.status(400).json({ error: 'Phone number must be in E.164 format (e.g. +31612345678)' });
    }

    try {
      await db.execute('UPDATE portal_users SET phone_number = ? WHERE id = ?', [raw, portalUser.id]);
      res.json({ ok: true, phone_number: raw });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This phone number is already registered to another account' });
      throw err;
    }
  });

  app.delete('/api/account/phone', authRequired, async (req, res) => {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    await db.execute('UPDATE portal_users SET phone_number = NULL WHERE id = ?', [portalUser.id]);
    res.json({ ok: true });
  });

  app.patch('/api/my/hotel-enabled', authRequired, async (req, res) => {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    const enabled = req.body?.hotel_enabled === false ? 0 : 1;
    await db.execute('UPDATE portal_users SET hotel_enabled = ? WHERE id = ?', [enabled, portalUser.id]);
    res.json({ ok: true, hotel_enabled: !!enabled });
  });

  app.post('/api/account/password', authRequired, async (req, res) => {
    const currentPassword = String(req.body?.current_password || '');
    const newPassword     = String(req.body?.new_password || '');

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'current_password and new_password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const [rows] = await db.execute(
      'SELECT id, password_hash FROM portal_users WHERE habbo_user_id = ? LIMIT 1',
      [req.user.habbo_user_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!match) return res.status(400).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 12);
    await db.execute('UPDATE portal_users SET password_hash = ? WHERE id = ?', [newHash, rows[0].id]);

    res.json({ ok: true, message: 'Password updated successfully' });
  });
}
