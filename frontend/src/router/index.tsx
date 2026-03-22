import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import RequireAuth from '@/components/auth/RequireAuth'
import AppShell from '@/components/layout/AppShell'

/** 阶段六 6.5：主业务页按需分割，减轻首屏 JS */
const ChatPage = lazy(() => import('@/pages/Chat/index'))
const FileWorkspace = lazy(() => import('@/pages/Files/FileWorkspace'))
const SettingsPage = lazy(() => import('@/pages/Settings/index'))
const LoginPage = lazy(() => import('@/pages/Login/index'))

function RouteFallback() {
  return <div className="flex min-h-[40vh] items-center justify-center text-slate-500">加载中…</div>
}

export default function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<AppShell />}>
            <Route index element={<ChatPage />} />
            <Route path="workspace" element={<FileWorkspace />} />
            <Route path="files" element={<Navigate to="/workspace" replace />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
