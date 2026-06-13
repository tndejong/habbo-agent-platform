// /api/auth/* — register, login, forgot/reset password, logout, me.
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';

export function registerAuthRoutes(app, ctx) {
  const {
    db,
    authRequired,
    createHabboUser,
    issueAuthCookie,
    sendWelcomeEmail,
    sendPasswordResetEmail,
    createPasswordResetToken,
    sha256,
    getPortalUserByHabboUserId,
    PORTAL_RESET_TOKEN_TTL_MINUTES,
    PORTAL_PUBLIC_URL,
  } = ctx;

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts, please try again later.' },
  });

  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const hotelEnabled = req.body?.hotel_enabled === false ? 0 : 1;

    if (!email || !username || !password) {
      return res.status(400).json({ error: 'email, username and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/^[a-zA-Z0-9_]{2,32}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 2-32 chars: letters, numbers, underscore' });
    }

    try {
      const [existing] = await db.execute(
        'SELECT id FROM portal_users WHERE email = ? OR username = ? LIMIT 1',
        [email, username]
      );
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Email or username already registered' });
      }

      const habboUser = await createHabboUser(username);
      const passwordHash = await bcrypt.hash(password, 12);

      const [insertResult] = await db.execute(
        'INSERT INTO portal_users (email, username, password_hash, habbo_user_id, habbo_username, hotel_enabled) VALUES (?, ?, ?, ?, ?, ?)',
        [email, username, passwordHash, habboUser.id, habboUser.username, hotelEnabled]
      );

      issueAuthCookie(res, {
        email,
        username,
        habbo_user_id: habboUser.id,
        habbo_username: habboUser.username,
        portal_user_id: insertResult.insertId,
      });

      sendWelcomeEmail({ toEmail: email, username }).catch((e) =>
        console.warn('Welcome email failed:', e.message)
      );

      return res.json({
        ok: true,
        user: { email, username, habbo_username: habboUser.username, ai_tier: 'basic' },
      });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Registration failed' });
    }
  });

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const login = String(req.body?.login || '').trim();
    const password = String(req.body?.password || '');
    if (!login || !password) {
      return res.status(400).json({ error: 'login and password are required' });
    }

    const [rows] = await db.execute(
      `SELECT id, email, username, password_hash, habbo_user_id, habbo_username, ai_tier
       FROM portal_users
       WHERE email = ? OR username = ?
       LIMIT 1`,
      [login.toLowerCase(), login]
    );
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    issueAuthCookie(res, {
      email: user.email,
      username: user.username,
      habbo_user_id: user.habbo_user_id,
      habbo_username: user.habbo_username,
      portal_user_id: user.id,
    });

    return res.json({
      ok: true,
      user: {
        email: user.email,
        username: user.username,
        habbo_username: user.habbo_username,
        ai_tier: user.ai_tier || 'basic',
      },
    });
  });

  app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const genericResponse = {
      ok: true,
      message: 'If an account exists for this email, a reset link has been sent.',
    };

    try {
      const [rows] = await db.execute(
        'SELECT id, email, username FROM portal_users WHERE email = ? LIMIT 1',
        [email]
      );
      const user = rows[0];
      if (!user) {
        return res.json(genericResponse);
      }

      const token = createPasswordResetToken();
      const tokenHash = sha256(token);
      const expiresAt = new Date(Date.now() + PORTAL_RESET_TOKEN_TTL_MINUTES * 60 * 1000);

      await db.execute(
        'INSERT INTO portal_password_resets (portal_user_id, token_hash, expires_at, requested_ip) VALUES (?, ?, ?, ?)',
        [user.id, tokenHash, expiresAt, req.ip || '']
      );

      const resetUrl = new URL('/', PORTAL_PUBLIC_URL);
      resetUrl.searchParams.set('reset', '1');
      resetUrl.searchParams.set('token', token);
      resetUrl.searchParams.set('email', user.email);

      await sendPasswordResetEmail({
        toEmail: user.email,
        username: user.username,
        resetUrl: resetUrl.toString(),
      });

      return res.json(genericResponse);
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to process reset request' });
    }
  });

  app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');

    if (!email || !token || !password) {
      return res.status(400).json({ error: 'email, token and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    try {
      const [rows] = await db.execute(
        `SELECT r.id AS reset_id, u.id AS user_id
         FROM portal_password_resets r
         INNER JOIN portal_users u ON u.id = r.portal_user_id
         WHERE u.email = ?
           AND r.token_hash = ?
           AND r.used_at IS NULL
           AND r.expires_at > NOW()
         ORDER BY r.created_at DESC
         LIMIT 1`,
        [email, sha256(token)]
      );
      const match = rows[0];
      if (!match) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      await db.execute('UPDATE portal_users SET password_hash = ? WHERE id = ? LIMIT 1', [passwordHash, match.user_id]);
      await db.execute('UPDATE portal_password_resets SET used_at = NOW() WHERE id = ? LIMIT 1', [match.reset_id]);
      await db.execute(
        'UPDATE portal_password_resets SET used_at = NOW() WHERE portal_user_id = ? AND used_at IS NULL',
        [match.user_id]
      );

      return res.json({ ok: true, message: 'Password reset successful. You can now log in with the new password.' });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to reset password' });
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie('agent_portal_session');
    res.json({ ok: true });
  });

  app.get('/api/auth/me', authRequired, async (req, res) => {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    const [[habboUser]] = await db.execute('SELECT look FROM users WHERE id = ? LIMIT 1', [req.user.habbo_user_id]);
    const [[keyRow]] = await db.execute(
      'SELECT id FROM portal_user_api_keys WHERE portal_user_id = ? AND provider = ? LIMIT 1',
      [portalUser?.id, 'anthropic']
    );
    const [[mcpRow]] = await db.execute(
      `SELECT id FROM portal_mcp_tokens WHERE portal_user_id = ? AND status = 'active' LIMIT 1`,
      [portalUser?.id]
    );

    res.json({
      ok: true,
      user: {
        email: req.user.email,
        username: req.user.username,
        habbo_username: req.user.habbo_username,
        ai_tier: portalUser?.ai_tier || 'basic',
        is_developer: portalUser?.is_developer || 0,
        figure: habboUser?.look || null,
        has_anthropic_key: !!keyRow,
        has_mcp_token: !!mcpRow,
        habboConnected: portalUser ? !!portalUser.hotel_enabled : true,
        default_user_team_id: portalUser?.default_user_team_id ?? null,
      },
    });
  });
}
