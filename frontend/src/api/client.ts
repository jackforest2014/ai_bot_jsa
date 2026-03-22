import { TOKEN_STORAGE_KEY } from '@/router/guards'
import { useUserStore } from '@/store/userStore'

const API_BASE = import.meta.env.VITE_API_BASE?.replace(/\/$/, '') ?? ''

const MAX_NETWORK_RETRIES = 2
const MSG_413 = '单文件不超过 64MB'
const DEFAULT_ERR = '请求失败'

export class ApiError extends Error {
  status?: number
  body?: unknown
  constructor(message: string, status?: number, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof Error && e.name === 'AbortError')
}

function loginRedirectPath(): string {
  if (window.location.pathname === '/login') return '/login'
  const path = `${window.location.pathname}${window.location.search}`
  return `/login?from=${encodeURIComponent(path)}`
}

function redirectToLogin(): void {
  useUserStore.getState().clearUser()
  window.location.assign(loginRedirectPath())
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { raw: text }
  }
}

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE}${p}`
}

/** 与 `request()` 一致的 Bearer，供 SSE 等非 JSON fetch 使用 */
export function authHeaders(): Headers {
  const headers = new Headers()
  const token =
    useUserStore.getState().token?.trim() || localStorage.getItem(TOKEN_STORAGE_KEY)?.trim()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return headers
}

export async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = apiUrl(endpoint.startsWith('/') ? endpoint : `/${endpoint}`)

  const exec = async (): Promise<Response> => {
    const headers = new Headers(options?.headers)
    const token =
      useUserStore.getState().token?.trim() || localStorage.getItem(TOKEN_STORAGE_KEY)?.trim()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (options?.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    return fetch(url, { ...options, headers })
  }

  let response!: Response
  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
    try {
      response = await exec()
      break
    } catch (e) {
      if (!isNetworkError(e) || attempt === MAX_NETWORK_RETRIES) throw e
    }
  }

  if (response.status === 401) {
    // 登录页正在校验令牌时不应清 token 并整页跳转，否则与表单自身的 clearUser 冲突且难以排查
    if (window.location.pathname !== '/login') {
      redirectToLogin()
    }
    throw new ApiError('未授权，请重新登录', 401)
  }

  if (!response.ok) {
    const errBody = await parseJsonSafe(response)
    const obj = errBody as { error?: string }
    let message = obj.error || DEFAULT_ERR
    if (response.status === 413) message = MSG_413
    const err = new ApiError(message, response.status, errBody)
    throw err
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}
