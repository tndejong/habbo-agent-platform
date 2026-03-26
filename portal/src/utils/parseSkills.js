/**
 * Unified skills parser — handles both new (JSON slug array) and legacy
 * (free-text bullet / comma list) capabilities formats.
 *
 * @param {string|null|undefined} raw
 * @param {{ max?: number, stripDetail?: boolean }} opts
 * @returns {string[]}
 */
export function parseSkillSlugs(raw) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return []
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.filter(s => typeof s === 'string' && s.trim())
  } catch { /* not JSON — fall through to legacy */ }
  return []
}

/**
 * Parse capabilities into display labels. Resolves slugs against a catalog
 * if provided; otherwise falls back to title-casing the slug itself.
 *
 * @param {string|null|undefined} raw
 * @param {Array<{slug:string, title:string}>} [catalog]
 * @param {{ max?: number }} [opts]
 * @returns {string[]}
 */
export function parseSkills(raw, catalog = [], { max = Infinity } = {}) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return []

  // New format: JSON slug array
  try {
    const slugs = JSON.parse(raw)
    if (Array.isArray(slugs)) {
      const labels = slugs.map(slug => {
        const match = catalog.find(s => s.slug === slug)
        return match ? match.title : slugToTitle(slug)
      }).filter(Boolean)
      return max === Infinity ? labels : labels.slice(0, max)
    }
  } catch { /* fall through */ }

  // Legacy: newline / comma / semicolon separated bullets
  const parts = raw
    .split(/[\n,;]+/)
    .map(s => s.replace(/^[-*•]\s*/, '').split('(')[0].trim())
    .filter(Boolean)
  return max === Infinity ? parts : parts.slice(0, max)
}

function slugToTitle(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
