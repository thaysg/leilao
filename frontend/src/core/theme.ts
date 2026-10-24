import { create } from 'zustand'

type Theme = 'light' | 'dark'

const read = (): Theme => {
  const attr = document.documentElement.getAttribute('data-theme')
  return attr === 'dark' ? 'dark' : 'light'
}

interface ThemeState { theme: Theme; toggle: () => void }

export const useTheme = create<ThemeState>((set, get) => ({
  theme: read(),
  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('theme', next) } catch { /* storage may be blocked */ }
    set({ theme: next })
  },
}))
