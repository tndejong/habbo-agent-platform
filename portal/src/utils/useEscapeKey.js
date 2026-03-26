import { useEffect } from 'react'

/**
 * Calls `onEscape` when the Escape key is pressed.
 * Pass `active = false` to disable the listener (e.g. when no modal is open).
 */
export function useEscapeKey(onEscape, active = true) {
  useEffect(() => {
    if (!active) return
    const handler = (e) => { if (e.key === 'Escape') onEscape() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onEscape, active])
}
