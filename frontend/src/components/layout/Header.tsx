import { useNavigate } from 'react-router-dom'

import { useUiStore } from '@/store/uiStore'
import { useThemeStore } from '@/store/themeStore'
import { useUserStore } from '@/store/userStore'

export default function Header() {
  const navigate = useNavigate()
  const globalLoading = useUiStore((s) => s.globalLoading)
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const clearUser = useUserStore((s) => s.clearUser)
  const colorMode = useThemeStore((s) => s.colorMode)
  const toggleColorMode = useThemeStore((s) => s.toggleColorMode)

  function handleLogout() {
    clearUser()
    navigate('/login', { replace: true })
  }

  return (
    <header className="relative border-b border-slate-200/90 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md dark:border-cyan-500/20 dark:bg-slate-950/90 dark:shadow-[0_1px_0_0_rgba(34,211,238,0.06)]">
      {globalLoading ? (
        <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-cyan-400/40" aria-hidden />
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => toggleSidebar()}
            className="min-h-10 min-w-10 touch-manipulation rounded-md border border-slate-300 bg-slate-100 px-2 py-2 text-sm text-slate-800 hover:bg-slate-200 dark:border-cyan-500/25 dark:bg-slate-900/50 dark:text-cyan-100 dark:hover:bg-cyan-500/10 md:min-h-0 md:min-w-0 md:py-1"
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
          >
            {sidebarCollapsed ? '»' : '«'}
          </button>
          <h1 className="truncate bg-gradient-to-r from-cyan-700 via-sky-700 to-indigo-700 bg-clip-text text-lg font-semibold text-transparent dark:from-cyan-200 dark:via-sky-300 dark:to-indigo-300">
            AI Bot
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => toggleColorMode()}
            className="min-h-10 touch-manipulation rounded-md border border-slate-300 bg-slate-100 px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-200 dark:border-cyan-500/25 dark:bg-transparent dark:text-cyan-100 dark:hover:bg-cyan-500/10 md:min-h-0 md:py-1.5"
            title={colorMode === 'dark' ? '切换为亮色' : '切换为暗色'}
            aria-label={colorMode === 'dark' ? '切换为亮色主题' : '切换为暗色主题'}
          >
            {colorMode === 'dark' ? '☀' : '☾'}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="min-h-10 shrink-0 touch-manipulation rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200 dark:border-cyan-500/25 dark:text-cyan-100 dark:hover:bg-cyan-500/10 md:min-h-0 md:py-1.5"
          >
            退出登录
          </button>
        </div>
      </div>
    </header>
  )
}
