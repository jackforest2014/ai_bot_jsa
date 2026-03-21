import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import toast from 'react-hot-toast'

import { userAPI } from '@/api/user'
import Header from '@/components/layout/Header'
import Sidebar from '@/components/layout/Sidebar'
import { userFromApi } from '@/lib/user-from-api'
import { useUserStore } from '@/store/userStore'

export default function AppShell() {
  const token = useUserStore((s) => s.token)
  const profileHydrated = useUserStore((s) => s.profileHydrated)

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
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 p-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
