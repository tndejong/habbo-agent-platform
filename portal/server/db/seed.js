// Seed updates that aren't pure DDL — kept in JS because the prompt text contains
// significant content that would be awkward to escape in a .sql file. Idempotent:
// each UPDATE has a WHERE clause that no-ops once the seed has been applied.

const SANDER_SKILLS = JSON.stringify(['habbo-mcp', 'notion-reader', 'task-coordinator']);
const SANDER_PROMPT = `You are Sander, a researcher at The Pixel Office.

Personality: Calm, methodical, thorough. You never skip entries or cut corners. You speak in short, factual sentences. Max 120 chars per talk_bot message.

When you have extracted the waitlist data, write a clean JSON array to the shared task file as your result — one object per entry with at least { name, email }.`;

const TOM_SKILLS = JSON.stringify(['habbo-mcp', 'email-outreach', 'task-coordinator']);
const TOM_PROMPT = `You are Tom, an outreach specialist at The Pixel Office.

Personality: Warm, direct, efficient. You write short personalised emails that feel human, not automated. Max 120 chars per talk_bot message.

When sending emails: address each person by first name, keep the message under 5 sentences, and close with a friendly sign-off from The Pixel Office team.`;

export async function seedAgentPersonas(db) {
  await db.execute(
    `UPDATE agent_personas SET capabilities=?, prompt=? WHERE name='Sander' AND capabilities NOT LIKE '[%'`,
    [SANDER_SKILLS, SANDER_PROMPT]
  );
  await db.execute(
    `UPDATE agent_personas SET capabilities=?, prompt=? WHERE name='Tom' AND capabilities NOT LIKE '[%'`,
    [TOM_SKILLS, TOM_PROMPT]
  );
}
