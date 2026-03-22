import { NavLink, useLocation } from 'react-router-dom'

import SessionList from '@/components/chat/SessionList'
import { useUiStore } from '@/store/uiStore'
import { useUserStore } from '@/store/userStore'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-md px-3 py-2 text-sm font-medium ${
    isActive
      ? 'bg-cyan-500/20 text-cyan-900 ring-1 ring-cyan-500/40 shadow-sm dark:bg-cyan-500/15 dark:text-cyan-100 dark:ring-cyan-400/35 dark:shadow-[0_0_24px_-12px_rgba(34,211,238,0.45)]'
      : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/90 dark:hover:text-slate-200'
  }`

function closeSidebarOnMobile() {
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
    useUiStore.getState().setSidebarCollapsed(true)
  }
}

export default function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const sessionListPanelOpen = useUiStore((s) => s.sessionListPanelOpen)
  const toggleSessionListPanel = useUiStore((s) => s.toggleSessionListPanel)
  const location = useLocation()
  const token = useUserStore((s) => s.token)

  const showSessionPanel = location.pathname === '/' && Boolean(token?.trim())

  const asideClass =
    'border-r border-slate-200 bg-white/95 p-3 shadow-md transition-transform duration-200 ease-out motion-reduce:transition-none dark:border-cyan-500/15 dark:bg-slate-950/95 dark:shadow-[4px_0_24px_-12px_rgba(0,0,0,0.5)] ' +
    // 小屏：抽屉覆盖主区；md+：参与 flex 流式布局
    'fixed inset-y-0 left-0 z-50 w-56 max-w-[min(100vw-2rem,18rem)] overflow-y-auto shadow-xl md:relative md:z-auto md:h-full md:max-h-full md:min-h-0 md:max-w-none md:shrink-0 md:overflow-y-auto md:shadow-none ' +
    (collapsed
      ? '-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden md:border-transparent md:p-0 md:min-w-0 md:shadow-none'
      : 'translate-x-0 md:w-56')

  return (
    <aside className={asideClass} aria-hidden={collapsed}>
      <nav className="flex flex-col gap-1">
        <NavLink to="/" end className={linkClass} onClick={closeSidebarOnMobile}>
          对话
        </NavLink>
        {showSessionPanel ? (
          <div className="mt-1 border-t border-slate-200 pt-2 dark:border-cyan-500/15">
            <button
              type="button"
              onClick={() => toggleSessionListPanel()}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-200"
              aria-expanded={sessionListPanelOpen}
            >
              <span>会话列表</span>
              <span className="text-slate-500 dark:text-slate-400" aria-hidden>
                {sessionListPanelOpen ? '▼' : '▶'}
              </span>
            </button>
            {sessionListPanelOpen ? (
              <div className="mt-2 pl-0.5">
                <SessionList />
              </div>
            ) : null}
          </div>
        ) : null}
        <NavLink to="/settings" className={linkClass} onClick={closeSidebarOnMobile}>
          设置
        </NavLink>
      </nav>
    </aside>
  )
}
