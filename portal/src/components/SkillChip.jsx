import * as Tooltip from '@radix-ui/react-tooltip'
import { useSkillsCatalog } from '../utils/useSkillsCatalog'

const CATEGORY_COLORS = {
  hotel:         'bg-blue-500/10 text-blue-400 border-blue-500/20',
  research:      'bg-violet-500/10 text-violet-400 border-violet-500/20',
  coordination:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  communication: 'bg-green-500/10 text-green-400 border-green-500/20',
  general:       'bg-secondary text-muted-foreground border-border',
}

/**
 * Renders a skill slug as a styled chip with a hover tooltip.
 * The tooltip shows category, difficulty, and a short description.
 * Clicking "View full skill →" calls onViewFull(slug).
 *
 * Requires <TooltipProvider> to be mounted above in the tree (done in App.jsx).
 *
 * @param {{ slug: string, title?: string, onViewFull?: (slug: string) => void, className?: string }} props
 */
export function SkillChip({ slug, title, onViewFull, className = '' }) {
  const { catalog } = useSkillsCatalog()
  const skill = catalog.find(s => s.slug === slug)
  const label = skill?.title ?? title ?? slug.replace(/-/g, ' ')
  const catColor = CATEGORY_COLORS[skill?.category] || CATEGORY_COLORS.general

  const chipClass = `inline-flex items-center text-[11px] bg-primary/10 text-foreground/90 px-2.5 py-1 rounded-full border border-primary/15 transition-colors ${onViewFull ? 'cursor-pointer hover:bg-primary/20 hover:border-primary/30' : 'cursor-default'} ${className}`

  // If no catalog entry or no action, render a plain non-interactive chip
  if (!skill) {
    return <span className={chipClass}>{label}</span>
  }

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        {onViewFull ? (
          <button
            type="button"
            onClick={() => onViewFull(slug)}
            className={chipClass}
          >
            {label}
          </button>
        ) : (
          <span className={chipClass}>{label}</span>
        )}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-64 rounded-xl border border-border bg-popover shadow-xl p-3 space-y-2 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-semibold text-foreground leading-snug">{skill.title}</span>
            <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
              {skill.category && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${catColor}`}>
                  {skill.category}
                </span>
              )}
              {skill.difficulty && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  skill.difficulty === 'beginner'
                    ? 'border-green-500/20 bg-green-500/10 text-green-400'
                    : 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400'
                }`}>
                  {skill.difficulty}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          {skill.description && (
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
              {skill.description}
            </p>
          )}

          {/* MCP tools (compact) */}
          {skill.mcp_tools?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {skill.mcp_tools.map(t => (
                <code key={t} className="text-[10px] bg-secondary border border-border rounded px-1.5 py-0.5 text-muted-foreground font-mono">
                  {t}
                </code>
              ))}
            </div>
          )}

          {/* Requires integration */}
          {skill.requires_integration && (
            <p className="text-[10px] text-amber-400/80 leading-snug">
              ⚠ Requires {skill.requires_integration === 'habbo-mcp' ? 'Habbo MCP key' : skill.requires_integration}
            </p>
          )}

          {onViewFull && (
            <p className="text-[10px] text-muted-foreground/60 pt-0.5">Click chip to view full skill</p>
          )}

          <Tooltip.Arrow className="fill-border" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
