import { useState, useEffect } from 'react'

const DIRECTIONS = [0, 1, 2, 3, 4, 5, 6, 7]
// All 8 directions — preload all frames for instant switching
const UNIQUE_DIRS = DIRECTIONS

export function HabboFigure({ figure, size = 'md', animate = true, className = '' }) {
  const [dirIndex, setDirIndex] = useState(0)

  const sizes = {
    sm: { width: 40, height: 64 },
    md: { width: 64, height: 110 },
    lg: { width: 80, height: 140 },
    xl: { width: 100, height: 175 },
  }
  const { width, height } = sizes[size] || sizes.md

  useEffect(() => {
    if (!animate || !figure) return
    const id = setInterval(() => setDirIndex(i => (i + 1) % DIRECTIONS.length), 600)
    return () => clearInterval(id)
  }, [animate, figure])

  const currentDir = animate ? DIRECTIONS[dirIndex] : 2

  if (!figure) return (
    <div style={{ width, height }} className={`rounded bg-muted flex items-center justify-center flex-shrink-0 ${className}`}>
      <span className="text-muted-foreground text-xs">?</span>
    </div>
  )

  // Render all unique directions stacked — only current one is visible.
  // This preloads every frame so direction changes are instant with no flash.
  return (
    <div style={{ width, height, position: 'relative' }} className={`flex-shrink-0 ${className}`}>
      {UNIQUE_DIRS.map(dir => (
        <img
          key={dir}
          src={`/api/figure?figure=${encodeURIComponent(figure)}&direction=${dir}&head_direction=${dir}&v=4`}
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
