// Single source of truth for team-tasks parsing and integration detection.
// Imported by BOTH the React frontend and the Express backend — keep this
// file pure JS (no React, no Node-specific APIs) so it's safe in both.

// Keywords used to detect which integrations a team requires. When you change
// one entry here, both the frontend (pre-flight UI warning) and the backend
// (server-side deploy gate) update at the same time.
export const INTEGRATION_KEYWORDS = {
  notion:    ['notion'],
  linear:    ['linear.app', 'linear mcp'],
  atlassian: ['atlassian', 'jira', 'confluence'],
  airtable:  ['airtable'],
  supabase:  ['supabase'],
  resend:    ['resend'],
  github:    ['github'],
  slack:     ['slack mcp', 'slack integration'],
};

// Parse a team's tasks_json — defensive against the "double-stringified"
// shape that saveTeamRoomId used to produce before that bug got fixed.
export function parseTeamTasksJson(team) {
  try {
    let v = JSON.parse(team?.tasks_json || '[]');
    let guard = 0;
    while (typeof v === 'string' && guard++ < 5) {
      try { v = JSON.parse(v); } catch { break; }
    }
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Scan a team's task titles/descriptions, member capabilities/prompts and the
// orchestrator prompt for keywords from INTEGRATION_KEYWORDS. Returns an
// array of integration slugs (e.g. ['notion', 'github']).
//
// Accepts a team object — pass `{ ...team, tasks_json: '' }` if you need to
// bypass task detection (e.g. session_goal mode where the goal overrides
// preset tasks).
export function detectRequiredIntegrations(team, members) {
  const texts = [];
  const tasks = parseTeamTasksJson(team);
  texts.push(...tasks.map(t => `${t.title || ''} ${t.description || ''}`));
  if (members) {
    texts.push(...members.map(m => `${m.capabilities || ''} ${m.prompt || ''}`));
  }
  if (team?.orchestrator_prompt) texts.push(team.orchestrator_prompt);
  const combined = texts.join(' ').toLowerCase();
  return Object.entries(INTEGRATION_KEYWORDS)
    .filter(([, kws]) => kws.some(kw => combined.includes(kw)))
    .map(([name]) => name);
}
