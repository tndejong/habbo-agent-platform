// Skills catalog — reads agents/skills/*/SKILL.md files from disk each call
// so edits are picked up without restarting the portal.
import path from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, '../../../agents/skills');

/** Parse YAML frontmatter + markdown body from a SKILL.md string. */
function parseSkillFile(slug, raw) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) return null;
  const meta = {};
  for (const line of fmMatch[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (!key) continue;
    if (val.startsWith('[') && val.endsWith(']')) {
      meta[key] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    } else if (val === '>') {
      meta[key] = '';
    } else {
      meta[key] = val.replace(/^['"]|['"]$/g, '');
    }
  }
  const descLines = [];
  let inDesc = false;
  for (const line of fmMatch[1].split('\n')) {
    if (/^description:\s*>/.test(line)) { inDesc = true; continue; }
    if (inDesc && /^\s{2,}/.test(line)) { descLines.push(line.trim()); continue; }
    if (inDesc && line.trim() && !/^\s/.test(line)) inDesc = false;
  }
  if (descLines.length) meta.description = descLines.join(' ');

  return {
    slug,
    name: meta.name || slug,
    title: meta.title || slug,
    description: meta.description || '',
    category: meta.category || 'general',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    mcp_tools: Array.isArray(meta.mcp_tools) ? meta.mcp_tools : [],
    requires_integration: meta.requires_integration || null,
    difficulty: meta.difficulty || 'beginner',
    version: meta.version || '1.0',
    body: fmMatch[2].trim(),
  };
}

export function loadSkillsCatalog() {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const skillFile = path.join(SKILLS_DIR, d.name, 'SKILL.md');
      if (!existsSync(skillFile)) return null;
      try {
        return parseSkillFile(d.name, readFileSync(skillFile, 'utf8'));
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function skillSlugsToCapabilities(slugs) {
  if (!Array.isArray(slugs) || slugs.length === 0) return '';
  const catalog = loadSkillsCatalog();
  return slugs
    .map(slug => {
      const skill = catalog.find(s => s.slug === slug);
      return skill ? `- ${skill.title}` : `- ${slug}`;
    })
    .join('\n');
}

export function collectRequiredIntegrations(resolvedMembers) {
  return [...new Set(resolvedMembers.flatMap(m => m.required_integrations || []))];
}

export function resolvePersonaSkills(member) {
  let capabilities = member.capabilities || '';
  let extraPrompt = '';
  let requiredIntegrations = [];
  try {
    const slugs = JSON.parse(capabilities);
    if (Array.isArray(slugs) && slugs.length > 0) {
      const catalog = loadSkillsCatalog();
      const resolved = slugs.map(slug => catalog.find(s => s.slug === slug)).filter(Boolean);
      capabilities = resolved.map(s => `- ${s.title}`).join('\n');
      requiredIntegrations = resolved.map(s => s.requires_integration).filter(Boolean);
      if (resolved.length > 0) {
        extraPrompt = '\n\n## Skills\n\n' + resolved.map(s =>
          `### ${s.title}\n\n${s.body}`
        ).join('\n\n---\n\n');
      }
    }
  } catch { /* legacy free-text capabilities — use as-is */ }
  return {
    ...member,
    capabilities,
    prompt: (member.prompt || '') + extraPrompt,
    required_integrations: requiredIntegrations,
  };
}
