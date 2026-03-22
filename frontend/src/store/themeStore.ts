import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ColorMode = 'dark' | 'light'

interface ThemeState {
  colorMode: ColorMode
  setColorMode: (m: ColorMode) => void
  toggleColorMode: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      colorMode: 'dark',
      setColorMode: (colorMode) => set({ colorMode }),
      toggleColorMode: () =>
        set((s) => ({ colorMode: s.colorMode === 'dark' ? 'light' : 'dark' })),
    }),
    { name: 'ai-bot-theme', partialize: (s) => ({ colorMode: s.colorMode }) },
  ),
)
