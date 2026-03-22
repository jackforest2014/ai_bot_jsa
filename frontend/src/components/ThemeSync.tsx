import { useEffect } from 'react'

import { useThemeStore } from '@/store/themeStore'

/** 将 Zustand 主题同步到 `document.documentElement` 的 `dark` class（供 Tailwind `dark:`） */
export default function ThemeSync() {
  const colorMode = useThemeStore((s) => s.colorMode)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', colorMode === 'dark')
    root.style.colorScheme = colorMode === 'dark' ? 'dark' : 'light'
  }, [colorMode])

  return null
}
