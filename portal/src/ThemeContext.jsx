import { createContext, useContext, useEffect, useState } from 'react'

// Storage key — must match the inline script in portal/index.html
const STORAGE_KEY = 'portal-theme'

const THEMES = ['dark', 'light', 'abyss']

function applyTheme(theme) {
  const html = document.documentElement
  html.classList.remove('dark', 'abyss')
  if (theme === 'dark')  html.classList.add('dark')
  if (theme === 'abyss') html.classList.add('dark', 'abyss')
}

const ThemeContext = createContext({ theme: 'dark', cycleTheme: () => {} })

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return THEMES.includes(saved) ? saved : 'dark'
    } catch {
      return 'dark'
    }
  })

  useEffect(() => {
    applyTheme(theme)
    try { localStorage.setItem(STORAGE_KEY, theme) } catch {}
  }, [theme])

  function cycleTheme() {
    setTheme(t => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length])
  }

  function setThemeByName(name) {
    if (THEMES.includes(name)) setTheme(name)
  }

  // Keep backwards-compatible toggleTheme alias
  function toggleTheme() { cycleTheme() }

  return (
    <ThemeContext.Provider value={{ theme, cycleTheme, toggleTheme, setThemeByName }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
