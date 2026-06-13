import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Zap, Check, X } from 'lucide-react'
import { useSkillsCatalog } from '../../utils/useSkillsCatalog'
import { useEscapeKey } from '../../utils/useEscapeKey'
import { SkillDetail } from '../MarketplaceView'

const CATEGORY_COLORS = {
  hotel:         'bg-blue-500/10 text-blue-400 border-blue-500/20',
  research:      'bg-violet-500/10 text-violet-400 border-violet-500/20',
  coordination:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  communication: 'bg-green-500/10 text-green-400 border-green-500/20',
  general:       'bg-secondary text-muted-foreground border-border',
}

export function SkillDetailModal({ slug, onClose }) {
  const { catalog } = useSkillsCatalog()
  useEscapeKey(onClose, !!slug)
  if (!slug) return null
  const skill = catalog.find(s => s.slug === slug) || { slug, title: slug.replace(/-/g, ' ') }
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-background border border-border rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-end px-5 pt-4 flex-shrink-0">
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pb-6 overflow-y-auto">
          <SkillDetail skill={skill} onBack={onClose} />
        </div>
      </div>
    </div>,
    document.body
  )
}

export function SkillBrowser({ selectedSlugs, onChange }) {
  const { catalog, loading } = useSkillsCatalog()
  const [activeCategory, setActiveCategory] = useState('all')
  const [openSkill, setOpenSkill] = useState(null)

  const categories = useMemo(() => {
    const cats = [...new Set(catalog.map(s => s.category))].sort()
    return ['all', ...cats]
  }, [catalog])

  const visible = activeCategory === 'all'
    ? catalog
    : catalog.filter(s => s.category === activeCategory)

  function toggle(slug) {
    onChange(
      selectedSlugs.includes(slug)
        ? selectedSlugs.filter(s => s !== slug)
        : [...selectedSlugs, slug]
    )
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading skills…
    </div>
  )

  if (catalog.length === 0) return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Zap className="w-6 h-6 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground">No skills available</p>
      <p className="text-xs text-muted-foreground">Add skill files to the agents/skills/ folder to get started.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`text-[11px] px-2.5 py-1 rounded-full border capitalize transition-colors ${
              activeCategory === cat
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {visible.map(skill => {
          const selected = selectedSlugs.includes(skill.slug)
          const catColor = CATEGORY_COLORS[skill.category] || CATEGORY_COLORS.general
          return (
            <div
              key={skill.slug}
              onClick={() => toggle(skill.slug)}
              className={`rounded-lg border transition-colors cursor-pointer ${
                selected
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border bg-card hover:border-primary/20'
              }`}
            >
              <div className="flex items-start gap-3 p-3">
                <button
                  onClick={e => { e.stopPropagation(); toggle(skill.slug) }}
                  className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border transition-colors ${
                    selected
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border hover:border-primary/60'
                  }`}
                >
                  {selected && <Check className="w-3 h-3" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{skill.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${catColor}`}>
                      {skill.category}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      skill.difficulty === 'beginner'
                        ? 'border-success/20 bg-success/10 text-success'
                        : 'border-warning/20 bg-warning/10 text-warning'
                    }`}>
                      {skill.difficulty}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{skill.description}</p>
                  <button
                    onClick={e => { e.stopPropagation(); setOpenSkill(skill.slug) }}
                    className="text-[11px] text-primary hover:underline mt-1.5"
                  >
                    View full skill →
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <SkillDetailModal slug={openSkill} onClose={() => setOpenSkill(null)} />
    </div>
  )
}
