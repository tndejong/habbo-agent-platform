import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

// Guards this service's HTTP endpoints with the shared service secret. Only the
// emulator (machine-to-machine) calls these, so they must carry X-Internal-Secret.
export function requireServiceSecret(req: Request, res: Response, next: NextFunction): void {
  if (!config.portal.internalSecret) {
    // Fail closed: no secret configured means no internal access.
    res.status(503).json({ ok: false, error: 'Service secret not configured' });
    return;
  }
  if (req.headers['x-internal-secret'] !== config.portal.internalSecret) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }
  next();
}
