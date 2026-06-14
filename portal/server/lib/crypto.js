import crypto from 'node:crypto';

export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// AES-256-GCM encryption for sensitive user data (API keys, MCP tokens).
// Falls back to JWT_SECRET-derived key when PORTAL_ENCRYPTION_KEY is unset.
function getEncryptionKey() {
  const portalKey = process.env.PORTAL_ENCRYPTION_KEY;
  const jwtSecret = process.env.JWT_SECRET || '';
  if (portalKey) {
    return crypto.createHash('sha256').update(portalKey).digest();
  }
  return crypto.createHash('sha256').update(jwtSecret + ':apikey-enc').digest();
}

export function encryptApiKey(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptApiKey(ciphertext) {
  try {
    const key = getEncryptionKey();
    const [ivHex, tagHex, dataHex] = ciphertext.split(':');
    if (!ivHex || !tagHex || !dataHex) throw new Error('invalid format');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

export function maskApiKey(key) {
  if (!key || key.length < 8) return '••••••••';
  return key.slice(0, 7) + '••••••••••••' + key.slice(-4);
}

export function createPasswordResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function createMcpToken() {
  return `mcp_${crypto.randomBytes(24).toString('hex')}`;
}

export function maskTokenPreview(token) {
  if (!token || token.length < 10) return '********';
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}
