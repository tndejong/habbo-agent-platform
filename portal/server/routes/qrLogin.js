// /api/auth/qr/* — cross-device QR login. A desktop browser starts a ticket,
// an already-logged-in phone scans the encoded URL and approves it, and the
// desktop exchanges the confirmed ticket for its own session cookie. The
// approving device never receives the cookie — Set-Cookie only ever lands on
// whichever device made the request, so /exchange must be called by the
// desktop itself.
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';

const TICKET_TTL_MS = 3 * 60 * 1000;

function generateTicket() {
  return crypto.randomBytes(32).toString('hex');
}

function generateShortCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function registerQrLoginRoutes(app, ctx) {
  const { db, authRequired, issueAuthCookie, sha256 } = ctx;

  const startLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts, please try again later.' },
  });

  const statusLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down.' },
  });

  app.post('/api/auth/qr/start', startLimiter, async (req, res) => {
    const ticket = generateTicket();
    const shortCode = generateShortCode();
    const expiresAt = new Date(Date.now() + TICKET_TTL_MS);

    await db.execute(
      `INSERT INTO qr_login_tickets (ticket_hash, short_code, expires_at, requested_ip, requested_user_agent)
       VALUES (?, ?, ?, ?, ?)`,
      [sha256(ticket), shortCode, expiresAt, req.ip || '', String(req.headers['user-agent'] || '').slice(0, 255)]
    );

    return res.json({ ok: true, ticket, short_code: shortCode, expires_in: Math.floor(TICKET_TTL_MS / 1000) });
  });

  app.get('/api/auth/qr/:ticket/status', statusLimiter, async (req, res) => {
    const [rows] = await db.execute(
      `SELECT status FROM qr_login_tickets WHERE ticket_hash = ? LIMIT 1`,
      [sha256(req.params.ticket)]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Unknown ticket' });

    return res.json({ ok: true, status: row.status });
  });

  app.get('/api/auth/qr/:ticket/info', authRequired, async (req, res) => {
    const [rows] = await db.execute(
      `SELECT short_code, requested_ip, requested_user_agent, created_at
       FROM qr_login_tickets
       WHERE ticket_hash = ? AND status = 'pending' AND expires_at > NOW()
       LIMIT 1`,
      [sha256(req.params.ticket)]
    );
    const row = rows[0];
    if (!row) return res.status(410).json({ error: 'Ticket expired or already used' });

    return res.json({
      ok: true,
      short_code: row.short_code,
      requested_ip: row.requested_ip,
      requested_user_agent: row.requested_user_agent,
      requested_at: row.created_at,
    });
  });

  app.post('/api/auth/qr/:ticket/approve', authRequired, async (req, res) => {
    const [result] = await db.execute(
      `UPDATE qr_login_tickets
       SET status = 'confirmed', portal_user_id = ?, confirmed_at = NOW()
       WHERE ticket_hash = ? AND status = 'pending' AND expires_at > NOW()
       LIMIT 1`,
      [req.user.portal_user_id, sha256(req.params.ticket)]
    );
    if (result.affectedRows === 0) {
      return res.status(410).json({ error: 'Ticket expired or already used' });
    }

    return res.json({ ok: true });
  });

  app.post('/api/auth/qr/:ticket/exchange', async (req, res) => {
    const [rows] = await db.execute(
      `SELECT t.id AS ticket_id, u.id AS user_id, u.email, u.username, u.habbo_user_id, u.habbo_username
       FROM qr_login_tickets t
       INNER JOIN portal_users u ON u.id = t.portal_user_id
       WHERE t.ticket_hash = ? AND t.status = 'confirmed' AND t.expires_at > NOW()
       LIMIT 1`,
      [sha256(req.params.ticket)]
    );
    const match = rows[0];
    if (!match) {
      return res.status(410).json({ error: 'Ticket expired, not yet confirmed, or already used' });
    }

    issueAuthCookie(res, {
      email: match.email,
      username: match.username,
      habbo_user_id: match.habbo_user_id,
      habbo_username: match.habbo_username,
      portal_user_id: match.user_id,
    });

    await db.execute(`UPDATE qr_login_tickets SET status = 'used', used_at = NOW() WHERE id = ? LIMIT 1`, [match.ticket_id]);

    return res.json({ ok: true });
  });
}
