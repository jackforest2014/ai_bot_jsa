import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import toast from 'react-hot-toast'

import { userAPI } from '@/api/user'
import Header from '@/components/layout/Header'
import Sidebar from '@/components/layout/Sidebar'
import { userFromApi } from '@/lib/user-from-api'
import { useChatSessionStore } from '@/store/chatSessionStore'
import { useUiStore } from '@/store/uiStore'
import { useUserStore } from '@/store/userStore'

function MobileSidebarBackdrop() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed)
  if (collapsed) return null
  return (
    <button
      type="button"
      aria-label="关闭导航菜单"
      className="fixed inset-0 z-40 bg-slate-900/50 dark:bg-slate-950/70 md:hidden"
      onClick={() => setSidebarCollapsed(true)}
    />
  )
}

export default function AppShell() {
  const token = useUserStore((s) => s.token)
  const profileHydrated = useUserStore((s) => s.profileHydrated)

  /** 会话列表只依赖有效 Bearer，勿等待 `/api/user`；否则 JWT 刷新后 user 被清空时会话永远不拉取 */
  useEffect(() => {
    if (!token?.trim()) return
    void useChatSessionStore.getState().bootstrap()
  }, [token])

  useEffect(() => {
    if (!token || profileHydrated) return
    let cancelled = false
    useUserStore.setState({ profileLoading: true })
    userAPI
      .getUser()
      .then((raw) => {
        if (cancelled) return
        useUserStore.getState().setUser(userFromApi(raw))
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('获取用户信息失败，请检查网络或访问令牌')
          useUserStore.setState({ profileHydrated: true })
        }
      })
      .finally(() => {
        if (!cancelled) useUserStore.setState({ profileLoading: false })
      })
    return () => {
      cancelled = true
    }
  }, [token, profileHydrated])

  return (
    <div className="flex min-h-screen min-h-0 bg-gradient-to-br from-slate-100 via-white to-slate-200 text-slate-800 dark:bg-[#030712] dark:from-slate-950 dark:via-[#070b18] dark:to-slate-950 dark:text-slate-200 md:h-[100dvh] md:max-h-[100dvh] md:overflow-hidden">
      <MobileSidebarBackdrop />
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:overflow-hidden">
        <Header />
        <main className="relative min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.06)_1px,transparent_1px)] before:bg-[length:28px_28px] before:opacity-80 dark:before:bg-[linear-gradient(rgba(34,211,238,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.035)_1px,transparent_1px)] dark:before:opacity-70">
          <div className="relative z-10 mx-auto min-h-[min(100%,calc(100vh-5rem))] w-full max-w-[1800px] p-3 text-slate-800 sm:p-4 dark:mx-0 dark:max-w-none dark:p-3 dark:text-slate-200">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
