import { v4 as uuidv4 } from 'uuid';
import { execute, queryOne } from '../db.js';
import { getConfig } from '../config.js';

export async function createPlayer(params: {
  username: string;
  figure?: string;
  gender?: string;
  motto?: string;
}): Promise<{ user_id: number; username: string; login_url: string }> {
  const {
    username,
    figure = 'hd-180-1.ch-210-66.lg-270-110.sh-300-91.ha-1012-110.hr-828-61',
    gender = 'M',
    motto = '',
  } = params;

  // Check username not taken
  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM users WHERE username = ? LIMIT 1',
    [username]
  );
  if (existing) {
    throw new Error(`Username "${username}" is already taken`);
  }

  const ticket = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  const mail = `${username}@agent.habbo`;

  const result = await execute(
    `INSERT INTO users (username, password, mail, look, gender, motto, rank,
      credits, pixels, points, account_created, last_login, last_online,
      online, auth_ticket, ip_register, ip_current, real_name)
    VALUES (?, '', ?, ?, ?, ?, 1, 2500, 500, 10, ?, 0, 0, '0', ?, '127.0.0.1', '127.0.0.1', 'agent')`,
    [username, mail, figure, gender.toUpperCase(), motto, now, ticket]
  );

  return {
    user_id: result.insertId,
    username,
    login_url: `${getConfig().habboBaseUrl}?sso=${ticket}`,
  };
}

export async function generateSsoTicket(username: string): Promise<string> {
  const ticket = uuidv4();
  await execute('UPDATE users SET auth_ticket = ? WHERE username = ?', [ticket, username]);
  return `${getConfig().habboBaseUrl}?sso=${ticket}`;
}
