// /api/tier-requests/* — user submits an upgrade request, admins review.
import express from 'express';

export function registerTierRequestRoutes(app, ctx) {
  const {
    db,
    authRequired,
    permRequired,
    getPortalUserByHabboUserId,
    sendUpgradeRequestNotification,
    sendUpgradeDecisionEmail,
  } = ctx;

  app.use('/api/tier-requests', express.json({ limit: '16kb' }));

  app.post('/api/tier-requests', authRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });

      const requestedTier = String(req.body?.requested_tier || 'pro');
      if (!['pro', 'enterprise'].includes(requestedTier)) {
        return res.status(400).json({ error: 'requested_tier must be "pro" or "enterprise"' });
      }
      const motivation = String(req.body?.motivation || '').trim().slice(0, 1000);

      const [[existing]] = await db.execute(
        `SELECT id FROM tier_upgrade_requests WHERE portal_user_id = ? AND status = 'pending' LIMIT 1`,
        [portalUser.id]
      );
      if (existing) return res.status(409).json({ error: 'You already have a pending upgrade request.' });

      const [result] = await db.execute(
        `INSERT INTO tier_upgrade_requests (portal_user_id, requested_tier, motivation) VALUES (?,?,?)`,
        [portalUser.id, requestedTier, motivation]
      );

      sendUpgradeRequestNotification({
        request: { id: result.insertId, requested_tier: requestedTier, motivation },
        user: { username: portalUser.username, email: portalUser.email },
      }).catch((e) => console.warn('Upgrade request notification email failed:', e.message));

      res.json({ ok: true, id: result.insertId });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/tier-requests/mine', authRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
      const [[row]] = await db.execute(
        `SELECT id, requested_tier, motivation, status, admin_note, created_at
         FROM tier_upgrade_requests WHERE portal_user_id = ? ORDER BY created_at DESC LIMIT 1`,
        [portalUser.id]
      );
      res.json({ ok: true, request: row || null });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/tier-requests', authRequired, permRequired('admin.requests'), async (req, res) => {
    try {
      const status = req.query.status || 'pending';
      const [rows] = await db.execute(
        `SELECT r.id, r.requested_tier, r.motivation, r.status, r.admin_note, r.created_at,
                u.username, u.email, u.ai_tier AS current_tier
         FROM tier_upgrade_requests r
         JOIN portal_users u ON u.id = r.portal_user_id
         WHERE r.status = ?
         ORDER BY r.created_at ASC`,
        [status]
      );
      res.json({ ok: true, requests: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/tier-requests/:id/review', authRequired, permRequired('admin.requests'), async (req, res) => {
    try {
      const reviewerUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      const decision = String(req.body?.decision || '');
      const adminNote = String(req.body?.admin_note || '').trim().slice(0, 500);
      if (!['approved', 'denied'].includes(decision)) {
        return res.status(400).json({ error: 'decision must be "approved" or "denied"' });
      }

      const [[request]] = await db.execute(
        `SELECT r.*, u.username, u.email FROM tier_upgrade_requests r
         JOIN portal_users u ON u.id = r.portal_user_id
         WHERE r.id = ?`,
        [req.params.id]
      );
      if (!request) return res.status(404).json({ error: 'Request not found' });
      if (request.status !== 'pending') {
        return res.status(409).json({ error: `Request is already ${request.status}` });
      }

      await db.execute(
        `UPDATE tier_upgrade_requests SET status = ?, admin_note = ?, reviewed_by_user_id = ? WHERE id = ?`,
        [decision, adminNote, reviewerUser?.id || null, request.id]
      );

      if (decision === 'approved') {
        await db.execute(
          `UPDATE portal_users SET ai_tier = ? WHERE id = ?`,
          [request.requested_tier, request.portal_user_id]
        );
      }

      sendUpgradeDecisionEmail({
        toEmail: request.email,
        username: request.username,
        status: decision,
        requestedTier: request.requested_tier,
        adminNote,
      }).catch((e) => console.warn('Upgrade decision email failed:', e.message));

      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}
