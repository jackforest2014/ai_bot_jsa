import type { FormEvent } from 'react'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'

import { userAPI } from '@/api/user'
import { userFromApi } from '@/lib/user-from-api'
import { useUserStore } from '@/store/userStore'

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

function normalizePastedToken(raw: string): string {
  const t = raw.trim()
  if (t.toLowerCase().startsWith('bearer ')) return t.slice(7).trim()
  return t
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const state = location.state as LoginLocationState | null
  const [tokenInput, setTokenInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const afterLoginPath = useMemo(
    () => resolveRedirectTarget(searchParams, state ?? undefined),
    [searchParams, state],
  )

  async function handleTokenSubmit(e: FormEvent) {
    e.preventDefault()
    const t = normalizePastedToken(tokenInput)
    if (!t) {
      toast.error('请输入访问令牌')
      return
    }
    setSubmitting(true)
    try {
      useUserStore.getState().setToken(t)
      const raw = await userAPI.getUser()
      useUserStore.getState().setUser(userFromApi(raw))
      toast.success('登录成功')
      navigate(afterLoginPath, { replace: true })
    } catch {
      useUserStore.getState().clearUser()
      toast.error('令牌无效或无法连接服务器')
    } finally {
      setSubmitting(false)
    }
  }

  function handleDevLogin() {
    useUserStore.getState().setToken('dev-token')
    useUserStore.getState().setUser({
      id: 'dev-user',
      name: '',
      email: '',
      ai_nickname: '助手',
      preferences: {},
    })
    useUserStore.setState({ profileHydrated: true, profileLoading: false })
    toast.success('已使用开发占位用户（资料未全量）')
    navigate(afterLoginPath, { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold text-slate-900">登录</h1>
      <p className="mt-2 text-slate-600">
        使用后端签发的 Bearer 令牌建立会话（技术方案 §8.2）。提交后将请求{' '}
        <code className="rounded bg-slate-100 px-1 text-sm">GET /api/user</code>{' '}
        校验并写入本地状态。
      </p>

      <form onSubmit={handleTokenSubmit} className="mt-6 flex flex-col gap-3">
        <label className="text-sm font-medium text-slate-700" htmlFor="access-token">
          访问令牌
        </label>
        <textarea
          id="access-token"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          rows={3}
          autoComplete="off"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          placeholder="粘贴 Bearer Token（不含「Bearer 」前缀亦可）"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {submitting ? '验证中…' : '登录'}
        </button>
      </form>

      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase text-slate-400">
          <span className="bg-slate-50 px-2">或</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleDevLogin}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
      >
        模拟登录（开发 · 空资料态演示）
      </button>
    </div>
  )
}
