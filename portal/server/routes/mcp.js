// /api/mcp/* routes — health proxy, tokens, call logs.

function getHabboMcpBaseUrl() {
  if (process.env.HABBO_MCP_BASE_URL) return process.env.HABBO_MCP_BASE_URL.replace(/\/+$/, '');
  const mcp = process.env.HABBO_MCP_URL || 'http://habbo-mcp:3003/mcp';
  return mcp.replace(/\/mcp\/?$/, '').replace(/\/+$/, '');
}

export function registerMcpRoutes(app, ctx) {
  const {
    db,
    authRequired,
    getPortalUserByHabboUserId,
    sha256,
    encryptApiKey,
    createMcpToken,
    maskTokenPreview,
    PORTAL_MCP_TOKEN_TTL_DAYS,
    PORTAL_MCP_DEFAULT_TENANT,
  } = ctx;

  app.get('/api/mcp/health', authRequired, async (req, res) => {
    const base = getHabboMcpBaseUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(`${base}/healthz`, { signal: controller.signal });
      const body = await response.json().catch(() => null);
      res.status(200).json({
        reachable: true,
        http_status: response.status,
        ok: !!(body && body.ok),
        checks: body?.checks ?? null,
        version: body?.version ?? null,
        uptime_s: body?.uptime_s ?? null,
      });
    } catch (err) {
      res.status(200).json({
        reachable: false,
        ok: false,
        error: err.name === 'AbortError' ? 'timeout' : err.message,
      });
    } finally {
      clearTimeout(timer);
    }
  });

  app.get('/api/mcp/tokens', authRequired, async (req, res) => {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) {
      return res.status(404).json({ error: 'Portal user not found' });
    }

    const [rows] = await db.execute(
      `SELECT id, tenant_id, plan_tier, token_label, status, expires_at, last_used_at, created_at
       FROM portal_mcp_tokens
       WHERE portal_user_id = ?
       ORDER BY created_at DESC`,
      [portalUser.id]
    );

    const activeToken = rows.find(r => r.status === 'active' && new Date(r.expires_at) > new Date()) || null;
    const envKeyConfigured = !!(process.env.MCP_API_KEY && process.env.MCP_API_KEY !== 'change-me-to-a-secret');

    return res.json({
      ok: true,
      tier: portalUser.ai_tier,
      env_key_configured: envKeyConfigured,
      auth_source: activeToken ? 'user_token' : envKeyConfigured ? 'env_key' : 'none',
      tokens: rows.map((row) => ({
        id: row.id,
        tenant_id: row.tenant_id,
        plan_tier: row.plan_tier,
        token_label: row.token_label || '',
        status: row.status,
        expires_at: row.expires_at,
        last_used_at: row.last_used_at,
        created_at: row.created_at
      }))
    });
  });

  app.post('/api/mcp/tokens', authRequired, async (req, res) => {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) {
      return res.status(404).json({ error: 'Portal user not found' });
    }
    if (portalUser.ai_tier === 'basic') {
      return res.status(403).json({ error: 'MCP is available on Pro tier only' });
    }

    const label = String(req.body?.label || '').trim().slice(0, 64) || 'Default token';
    const ttlDays = Number.parseInt(req.body?.ttl_days || PORTAL_MCP_TOKEN_TTL_DAYS, 10);
    const safeTtlDays = Number.isFinite(ttlDays) ? Math.max(1, Math.min(3650, ttlDays)) : PORTAL_MCP_TOKEN_TTL_DAYS;
    const token = createMcpToken();
    const tokenHash = sha256(token);
    const tokenRawEncrypted = encryptApiKey(token);
    const expiresAt = new Date(Date.now() + safeTtlDays * 24 * 60 * 60 * 1000);
    const planTier = portalUser.ai_tier === 'enterprise' ? 'enterprise' : 'pro';
    const scopes = planTier === 'enterprise' ? ['*'] : [];

    const [result] = await db.execute(
      `INSERT INTO portal_mcp_tokens
        (portal_user_id, tenant_id, plan_tier, scopes_json, token_hash, token_raw_encrypted, token_label, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        portalUser.id,
        PORTAL_MCP_DEFAULT_TENANT,
        planTier,
        JSON.stringify(scopes),
        tokenHash,
        tokenRawEncrypted,
        label,
        expiresAt
      ]
    );

    return res.json({
      ok: true,
      token: {
        id: result.insertId,
        value: token,
        preview: maskTokenPreview(token),
        token_label: label,
        plan_tier: planTier,
        tenant_id: PORTAL_MCP_DEFAULT_TENANT,
        expires_at: expiresAt
      }
    });
  });

  app.delete('/api/mcp/tokens/:id', authRequired, async (req, res) => {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) {
      return res.status(404).json({ error: 'Portal user not found' });
    }

    const tokenId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(tokenId) || tokenId <= 0) {
      return res.status(400).json({ error: 'Invalid token ID' });
    }

    const [result] = await db.execute(
      `UPDATE portal_mcp_tokens
       SET status = 'revoked'
       WHERE id = ? AND portal_user_id = ?
       LIMIT 1`,
      [tokenId, portalUser.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Token not found' });
    }

    return res.json({ ok: true });
  });

  app.get('/api/mcp/calls', authRequired, async (req, res) => {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) {
      return res.status(404).json({ error: 'Portal user not found' });
    }

    const limit = Number.parseInt(req.query.limit || '50', 10);
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 50;

    const [rows] = await db.execute(
      `SELECT id, token_id, tenant_id, channel, plan_tier, tool_name, success, error_code, duration_ms, created_at
       FROM portal_mcp_call_logs
       WHERE portal_user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [portalUser.id, safeLimit]
    );

    return res.json({
      ok: true,
      calls: rows
    });
  });
}
