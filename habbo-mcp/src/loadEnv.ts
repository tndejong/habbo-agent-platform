import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

// Load .env from habbo-mcp directory (single source of truth), regardless of cwd.
// This module must be imported first so env is set before config/auth/server run.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.join(__dirname, '..', '.env') });
