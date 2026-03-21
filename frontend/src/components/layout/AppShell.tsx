import { Outlet } from 'react-router-dom'

import Header from '@/components/layout/Header'
import Sidebar from '@/components/layout/Sidebar'

export default function AppShell() {
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
