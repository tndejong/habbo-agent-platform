import { useState, useEffect } from 'react'

const DIRECTIONS = [0, 1, 2, 3, 4, 5, 6, 7]
const UNIQUE_DIRS = DIRECTIONS

// Default figures per figure_type — used when a persona has no custom figure string
export const DEFAULT_FIGURES = {
  'agent-m':  'hd-180-1.ch-215-62.lg-275-62.sh-305-62.hr-100-61.ha-1003-62',
  'agent-f':  'hd-600-10.ch-255-80.lg-282-80.sh-290-80.hr-3163-80.ha-3242-80',
  'agent-m2': 'hd-180-7.ch-210-66.lg-280-66.sh-300-66.hr-3012-61',
  'agent-f2': 'hd-600-1.ch-808-62.lg-716-62.sh-725-62.hr-507-61',
}

/** Resolve a figure string — falls back to DEFAULT_FIGURES[figureType] if figure is empty */
export function resolveFigure(figure, figureType) {
  if (figure && figure.trim()) return figure
  return DEFAULT_FIGURES[figureType] || DEFAULT_FIGURES['agent-m']
}

export function HabboFigure({ figure, figureType, size = 'md', animate = true, className = '' }) {
  const resolvedFigure = resolveFigure(figure, figureType)
  const [dirIndex, setDirIndex] = useState(0)

  const sizes = {
    sm: { width: 40, height: 64 },
    md: { width: 64, height: 110 },
    lg: { width: 80, height: 140 },
    xl: { width: 100, height: 175 },
  }
  const { width, height } = sizes[size] || sizes.md

  useEffect(() => {
    if (!animate || !resolvedFigure) return
    const id = setInterval(() => setDirIndex(i => (i + 1) % DIRECTIONS.length), 600)
    return () => clearInterval(id)
  }, [animate, resolvedFigure])

  const currentDir = animate ? DIRECTIONS[dirIndex] : 2

  if (!resolvedFigure) return (
    <div style={{ width, height }} className={`rounded bg-muted flex items-center justify-center flex-shrink-0 ${className}`}>
      <span className="text-muted-foreground text-xs">?</span>
    </div>
  )

  return (
    <div style={{ width, height, position: 'relative' }} className={`flex-shrink-0 ${className}`}>
      {UNIQUE_DIRS.map(dir => (
        <img
          key={dir}
          src={`/api/figure?figure=${encodeURIComponent(resolvedFigure)}&direction=${dir}&head_direction=${dir}&v=4`}
          alt=""
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'center center',
            imageRendering: 'pixelated',
            opacity: dir === currentDir ? 1 : 0,
            transition: 'opacity 0.06s ease',
          }}
        />
      ))}
    </div>
  )
}
