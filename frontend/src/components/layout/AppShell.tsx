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
      className="fixed inset-0 z-40 bg-slate-950/70 md:hidden"
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
    <div className="flex min-h-screen bg-[#030712] bg-gradient-to-br from-slate-950 via-[#070b18] to-slate-950 text-slate-200">
      <MobileSidebarBackdrop />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="relative flex-1 p-3 sm:p-4 before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(rgba(34,211,238,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.035)_1px,transparent_1px)] before:bg-[length:28px_28px] before:opacity-70">
          <div className="relative z-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
