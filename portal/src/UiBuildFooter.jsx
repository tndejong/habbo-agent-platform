import { useState, useEffect } from 'react'

const BUNDLED_VERSION = import.meta.env.VITE_APP_VERSION || 'dev'

function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' })
        if (!res.ok) return
        const { version } = await res.json()
        if (version && version !== BUNDLED_VERSION) setUpdateAvailable(true)
      } catch { /* network unavailable — ignore */ }
    }

    check()
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  return updateAvailable
}

export function UiBuildFooter() {
  const updateAvailable = useVersionCheck()
  return (
    <>
      {updateAvailable && (
        <div className="shrink-0 bg-primary text-primary-foreground text-[11px] font-medium py-1.5 px-4 flex items-center justify-center gap-3">
          <span>Nieuwe versie beschikbaar</span>
          <button
            onClick={() => window.location.reload()}
            className="underline underline-offset-2 font-semibold hover:opacity-80"
          >
            Vernieuwen
          </button>
        </div>
      )}
      <footer className="border-t border-border py-2 px-4 text-center text-[10px] text-muted-foreground shrink-0">
        v{BUNDLED_VERSION}
      </footer>
    </>
  )
}
