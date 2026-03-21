import { useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { setStoredToken } from '@/router/guards'

interface LoginLocationState {
  from?: { pathname: string; search?: string }
}

function resolveRedirectTarget(searchParams: URLSearchParams, state?: LoginLocationState): string {
  const q = searchParams.get('from')
  if (q && q.startsWith('/') && !q.startsWith('//')) return q
  const s = state?.from
  if (s?.pathname?.startsWith('/') && !s.pathname.startsWith('//')) {
    return `${s.pathname}${s.search ?? ''}`
  }
  return '/'
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const state = location.state as LoginLocationState | null

  const afterLoginPath = useMemo(
    () => resolveRedirectTarget(searchParams, state ?? undefined),
    [searchParams, state],
  )

  function handleDevLogin() {
    setStoredToken('dev-token')
    navigate(afterLoginPath, { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold text-slate-900">登录</h1>
      <p className="mt-2 text-slate-600">
        正式登录流程在阶段二对接 API。开发阶段可点击下方按钮写入本地 token 并进入应用。
      </p>
      <button
        type="button"
        onClick={handleDevLogin}
        className="mt-6 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
      >
        模拟登录（开发）
      </button>
    </div>
  )
}
