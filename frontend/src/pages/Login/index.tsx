import type { FormEvent } from 'react'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'

import { ApiError } from '@/api/client'
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

  const DEV_LOCAL_USER_ID = 'local-dev-user'

  async function handleDevLogin() {
    setSubmitting(true)
    try {
      useUserStore.getState().setToken(DEV_LOCAL_USER_ID)
      const raw = await userAPI.getUser()
      useUserStore.getState().setUser(userFromApi(raw))
      toast.success('已用本地开发用户登录（须已在 D1 执行 seed）')
      navigate(afterLoginPath, { replace: true })
    } catch (e) {
      useUserStore.getState().clearUser()
      if (e instanceof TypeError || (e instanceof Error && e.message === 'Failed to fetch')) {
        toast.error(
          '无法连接后端。请确认 backend 已 `npm run dev`；本地开发建议 frontend/.env 里 VITE_API_BASE 留空（走 Vite 代理）。若填写了 http://127.0.0.1:8787，需使用已含 CORS 的后端（请重启 wrangler）。',
          { duration: 10000 },
        )
      } else if (e instanceof ApiError && e.status === 401) {
        toast.error(
          `后端返回 401：Bearer 中的用户 id 须在「当前请求打到的那份」D1 中存在。本地 wrangler：backend 执行 npm run db:seed:dev-user；线上 Worker：须对远程 D1 执行 npm run db:seed:dev-user:remote。自检 curl 请用与前端相同的 Worker 域名。`,
          { duration: 12000 },
        )
      } else {
        toast.error(
          `一键登录失败。仍可尝试在 backend 执行 npm run db:seed:dev-user 后重试（令牌 ${DEV_LOCAL_USER_ID}）。`,
          { duration: 8000 },
        )
      }
    } finally {
      setSubmitting(false)
    }
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
        onClick={() => void handleDevLogin()}
        disabled={submitting}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
      >
        {submitting ? '验证中…' : '本地开发一键登录（local-dev-user）'}
      </button>
      <p className="mt-2 text-xs text-slate-500">
        首次使用请在 <code className="rounded bg-slate-100 px-1">backend/</code> 运行{' '}
        <code className="rounded bg-slate-100 px-1">npm run db:seed:dev-user</code>。
      </p>
    </div>
  )
}
