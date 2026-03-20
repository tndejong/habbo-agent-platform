import { useState, useEffect } from 'react'

const DIRECTIONS = [2, 3, 4, 3, 2, 1, 0, 1]

export function HabboFigure({ figure, size = 'md', animate = true, className = '' }) {
  const [dirIndex, setDirIndex] = useState(0)

  const sizes = {
    sm: { width: 40, height: 64 },
    md: { width: 64, height: 110 },
    lg: { width: 80, height: 140 },
  }
  const { width, height } = sizes[size] || sizes.md

  useEffect(() => {
    if (!animate) return
    const id = setInterval(() => setDirIndex(i => (i + 1) % DIRECTIONS.length), 600)
    return () => clearInterval(id)
  }, [animate])

  const dir = animate ? DIRECTIONS[dirIndex] : 2

  if (!figure) return (
    <div style={{ width, height }} className={`rounded bg-muted flex items-center justify-center ${className}`}>
      <span className="text-muted-foreground text-xs">?</span>
    </div>
  )

  return (
    <div style={{ width, height }} className={`relative flex-shrink-0 ${className}`}>
      <img
        src={`/api/figure?figure=${encodeURIComponent(figure)}&direction=${dir}&head_direction=${dir}&v=3`}
        alt="avatar"
        style={{ width, height, imageRendering: 'pixelated' }}
        className="absolute inset-0"
      />
    </div>
  )
}
