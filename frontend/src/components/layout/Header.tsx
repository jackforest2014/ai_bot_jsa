import { useNavigate } from 'react-router-dom'

import { useUiStore } from '@/store/uiStore'
import { useUserStore } from '@/store/userStore'

export default function Header() {
  const navigate = useNavigate()
  const globalLoading = useUiStore((s) => s.globalLoading)
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const clearUser = useUserStore((s) => s.clearUser)

  function handleLogout() {
    clearUser()
    navigate('/login', { replace: true })
  }

  return (
    <header className="relative border-b border-cyan-500/20 bg-slate-950/90 px-4 py-3 shadow-[0_1px_0_0_rgba(34,211,238,0.06)] backdrop-blur-md">
      {globalLoading ? (
        <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-cyan-400/40" aria-hidden />
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => toggleSidebar()}
            className="min-h-10 min-w-10 touch-manipulation rounded-md border border-cyan-500/25 bg-slate-900/50 px-2 py-2 text-sm text-cyan-100 hover:bg-cyan-500/10 md:min-h-0 md:min-w-0 md:py-1"
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
          >
            {sidebarCollapsed ? '»' : '«'}
          </button>
          <h1 className="truncate bg-gradient-to-r from-cyan-200 via-sky-300 to-indigo-300 bg-clip-text text-lg font-semibold text-transparent">
            AI Bot
          </h1>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="min-h-10 shrink-0 touch-manipulation rounded-md border border-cyan-500/25 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/10 md:min-h-0 md:py-1.5"
        >
          退出登录
        </button>
      </div>
    </header>
  )
}
