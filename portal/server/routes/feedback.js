// /api/feedback/* — user submissions and admin review.

export function registerFeedbackRoutes(app, ctx) {
  const { db, authRequired, permRequired, getPortalUserByHabboUserId } = ctx;

  app.post('/api/feedback', authRequired, async (req, res) => {
    try {
      const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
      if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });

      const type = String(req.body?.type || 'other').trim();
      const page = String(req.body?.page || '').trim().slice(0, 64);
      const detail = String(req.body?.detail || '').trim().slice(0, 120);
      const message = String(req.body?.message || '').trim();
      const answers = req.body?.answers || {};

      const validTypes = ['bug', 'idea', 'confused', 'other'];
      if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid type' });

      await db.execute(
        `INSERT INTO portal_user_feedback (portal_user_id, type, page, detail, message, answers_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [portalUser.id, type, page, detail, message, JSON.stringify(answers)]
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/feedback', authRequired, permRequired('admin.feedback'), async (req, res) => {
    try {
      const status = req.query.status || 'all';
      const validStatuses = ['open', 'reviewed', 'resolved'];
      const whereClause = validStatuses.includes(status) ? 'WHERE f.status = ?' : '';
      const params = validStatuses.includes(status) ? [status] : [];

      const [rows] = await db.execute(
        `SELECT f.id, f.type, f.page, f.detail, f.message, f.answers_json,
                f.status, f.admin_note, f.created_at,
                u.username, u.email
         FROM portal_user_feedback f
         JOIN portal_users u ON u.id = f.portal_user_id
         ${whereClause}
         ORDER BY f.created_at DESC
         LIMIT 200`,
        params
      );
      res.json({ ok: true, feedback: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.patch('/api/feedback/:id', authRequired, permRequired('admin.feedback'), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const status = String(req.body?.status || '').trim();
      const adminNote = String(req.body?.admin_note ?? '').trim();

      const validStatuses = ['open', 'reviewed', 'resolved'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      await db.execute(
        `UPDATE portal_user_feedback SET
           status = COALESCE(NULLIF(?, ''), status),
           admin_note = ?
         WHERE id = ?`,
        [status, adminNote, id]
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}
