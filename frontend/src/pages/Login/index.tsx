import type { FormEvent } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'

import { ApiError } from '@/api/client'
import { authLogin, authProfileExists } from '@/api/auth'
import MorphingWireframeCanvas from '@/components/login/MorphingWireframeCanvas'
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
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [nameExists, setNameExists] = useState<boolean | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [tokenInput, setTokenInput] = useState('')

  const afterLoginPath = useMemo(
    () => resolveRedirectTarget(searchParams, state ?? undefined),
    [searchParams, state],
  )

  const primaryLabel = useMemo(() => {
    if (submitting) return '登录中…'
    if (nameExists === true) return '欢迎回来'
    if (nameExists === false) return '开始吧'
    return '进入'
  }, [nameExists, submitting])

  const onNameBlur = useCallback(async () => {
    const n = name.trim()
    if (!n) {
      setNameExists(null)
      return
    }
    try {
      const { exists } = await authProfileExists(n)
      setNameExists(exists)
    } catch {
      setNameExists(null)
    }
  }, [name])

  async function handleAnonymousSubmit(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) {
      toast.error('请输入显示名称')
      return
    }
    setSubmitting(true)
    try {
      const emailTrim = email.trim()
      const res = await authLogin({
        name: n,
        ...(emailTrim ? { email: emailTrim } : {}),
      })
      useUserStore.getState().setToken(res.token)
      useUserStore.getState().setUser(userFromApi(res.user))
      toast.success(res.is_new_user ? '欢迎加入' : '欢迎回来')
      navigate(afterLoginPath, { replace: true })
    } catch (err) {
      useUserStore.getState().clearUser()
      const msg = err instanceof Error ? err.message : '登录失败'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

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
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-slate-950 via-[#060b14] to-slate-950 text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(34,211,238,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.12) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
        aria-hidden
      />
      <div className="pointer-events-none absolute -left-32 top-1/4 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-1/4 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />

      <div className="relative z-10 mx-auto grid min-h-screen max-w-6xl md:grid-cols-[1fr_minmax(0,26rem)]">
        <div className="relative min-h-[200px] md:min-h-screen">
          <MorphingWireframeCanvas className="absolute inset-0 h-full w-full" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent md:bg-gradient-to-r md:from-transparent md:via-slate-950/40 md:to-slate-950" />
          <div className="relative hidden h-full flex-col justify-center p-8 md:flex">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.4em] text-cyan-400/90">
              Interface
            </p>
            <h2 className="mt-3 text-3xl font-extralight tracking-wide text-white">神经会话终端</h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
              流式推理 · 会话持久化 · 文件工作区联动。单次显示名称即建立身份密钥。
            </p>
          </div>
        </div>

        <div className="relative flex flex-col justify-center px-4 py-10 md:py-12 md:pr-8">
          <div className="mx-auto w-full max-w-md md:mx-0">
        <h1 className="text-2xl font-semibold tracking-tight text-white">开始对话</h1>
        <p className="mt-2 text-sm text-slate-400">
          输入显示名称即可登录（同名即同一账号）。邮箱选填，可在设置或对话中再补充。
        </p>

        <form onSubmit={(e) => void handleAnonymousSubmit(e)} className="mt-8 flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="login-name">
              显示名称 <span className="text-red-400">*</span>
            </label>
            <input
              id="login-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setNameExists(null)
              }}
              onBlur={() => void onNameBlur()}
              autoComplete="username"
              className="mt-1.5 w-full rounded-lg border border-slate-600/80 bg-slate-900/80 px-3 py-2.5 text-sm text-white shadow-inner placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="例如：小林"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="login-email">
              邮箱（选填）
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="mt-1.5 w-full rounded-lg border border-slate-600/80 bg-slate-900/80 px-3 py-2.5 text-sm text-white shadow-inner placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="name@example.com"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-500/25 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {primaryLabel}
          </button>
        </form>

        {import.meta.env.DEV ? (
          <details className="mt-10 rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-slate-400">
            <summary className="cursor-pointer text-xs font-medium text-slate-300">
              开发调试：令牌登录
            </summary>
            <form onSubmit={(e) => void handleTokenSubmit(e)} className="mt-3 flex flex-col gap-2">
              <textarea
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                rows={2}
                className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                placeholder="Bearer Token"
              />
              <button
                type="submit"
                disabled={submitting}
                className="rounded bg-slate-700 px-3 py-1.5 text-xs text-white hover:bg-slate-600 disabled:opacity-50"
              >
                用令牌登录
              </button>
            </form>
            <button
              type="button"
              onClick={() => void handleDevLogin()}
              disabled={submitting}
              className="mt-2 w-full rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              一键 local-dev-user
            </button>
            <p className="mt-2 text-[0.65rem] text-slate-500">
              首次请在 backend 执行 <code className="text-slate-400">npm run db:seed:dev-user</code>
            </p>
          </details>
        ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
