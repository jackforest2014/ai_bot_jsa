import { apiUrl } from '@/api/client'
import type { User } from '@/types/user'

export interface AuthLoginBody {
  name: string
  email?: string | null
}

export interface AuthLoginResponse {
  token: string
  user: User
  is_new_user: boolean
}

/** 不携带 Bearer；用于登录前调用 */
async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (!text) {
    if (!res.ok) throw new Error(res.status === 401 ? '未授权' : '请求失败')
    return undefined as T
  }
  const data = JSON.parse(text) as T
  if (!res.ok) {
    const err = (data as { error?: string }).error || '请求失败'
    throw new Error(err)
  }
  return data
}

/**
 * 匿名昵称登录（技术方案 §5.0、后端 §5.0）。
 * 不使用全局 `request()`，避免附带旧 token。
 */
export async function authLogin(body: AuthLoginBody): Promise<AuthLoginResponse> {
  const res = await fetch(apiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: body.name.trim(),
      ...(body.email !== undefined && body.email !== ''
        ? { email: body.email?.trim() || null }
        : {}),
    }),
  })
  return parseJsonResponse<AuthLoginResponse>(res)
}

/** GET /api/auth/profile-exists?name= */
export async function authProfileExists(name: string): Promise<{ exists: boolean }> {
  const q = new URLSearchParams({ name: name.trim() })
  const res = await fetch(apiUrl(`/api/auth/profile-exists?${q.toString()}`))
  return parseJsonResponse<{ exists: boolean }>(res)
}
