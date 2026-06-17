import jwt from 'jsonwebtoken';

// Centralized auth primitives for the portal boundary. Two mechanisms only:
//   1. User token  — a portal JWT carried either in the `agent_portal_session`
//      cookie (portal browser) OR an `Authorization: Bearer` header (the in-hotel
//      Nitro client). Same secret, same claims, one verify path.
//   2. Service token — a shared `X-Internal-Secret` header for machine-to-machine
//      calls (agent-trigger, habbo-ai-service, emulator -> portal).
//
// server.js builds this once with the configured secrets and passes the returned
// helpers into the route registrars via ctx, so no route re-implements auth.
export function createAuth({ jwtSecret, internalSecret, cookieSecure = false }) {
  const COOKIE_NAME = 'agent_portal_session';

  function readBearer(req) {
    const header = req.headers?.authorization || '';
    return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  }

  // Verify a portal user token. Cookie takes precedence, then a Bearer header.
  // Returns the decoded claims, or null when missing/invalid.
  function verifyUserToken(req) {
    const token = req.cookies?.[COOKIE_NAME] || readBearer(req);
    if (!token) return null;
    try {
      return jwt.verify(token, jwtSecret);
    } catch {
      return null;
    }
  }

  function authRequired(req, res, next) {
    const user = verifyUserToken(req);
    if (!user) return res.status(401).json({ error: 'Not logged in' });
    req.user = user;
    return next();
  }

  // Non-throwing variant for pages that branch on login state.
  function getSessionUser(req) {
    return verifyUserToken(req);
  }

  function issueAuthCookie(res, payload) {
    const token = jwt.sign(payload, jwtSecret, { expiresIn: '14d' });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure,
      maxAge: 14 * 24 * 60 * 60 * 1000,
    });
  }

  // Short-lived bearer token for the in-hotel Nitro client. Minted on the
  // emulator's behalf (it has already authenticated the user via SSO) and
  // relayed to the client through the AI settings packet. Same claim shape as
  // the cookie token so `verifyUserToken` accepts it transparently.
  function mintHotelToken(habboUserId, username = '') {
    return jwt.sign(
      { habbo_user_id: habboUserId, username, scope: 'hotel-client' },
      jwtSecret,
      { expiresIn: '24h' }
    );
  }

  function requireInternalSecret(req, res, next) {
    if (!internalSecret) {
      // Fail closed: if the secret is not configured, block all internal routes
      // rather than leaving them open. Set PORTAL_INTERNAL_SECRET in env to enable.
      return res.status(503).json({ error: 'Internal secret not configured on this server' });
    }
    if (req.headers['x-internal-secret'] !== internalSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return next();
  }

  return {
    verifyUserToken,
    authRequired,
    getSessionUser,
    issueAuthCookie,
    mintHotelToken,
    requireInternalSecret,
  };
}
