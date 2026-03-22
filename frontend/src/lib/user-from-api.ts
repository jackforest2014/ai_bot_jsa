import type { User } from '@/types/user'

/** 将 GET /api/user 等返回的 JSON 规范为 `User`（技术方案 §5.2） */
export function userFromApi(raw: unknown): User {
  if (!raw || typeof raw !== 'object') throw new TypeError('Invalid user payload')
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id : ''
  if (!id) throw new TypeError('Invalid user: missing id')
  const name = typeof o.name === 'string' ? o.name : ''
  let email: string | null | undefined
  if (o.email === null || o.email === undefined) email = o.email ?? null
  else if (typeof o.email === 'string') email = o.email
  else email = null
  const ai_nickname = typeof o.ai_nickname === 'string' ? o.ai_nickname : undefined
  let preferences: Record<string, unknown> | undefined
  if (o.preferences && typeof o.preferences === 'object' && !Array.isArray(o.preferences)) {
    preferences = o.preferences as Record<string, unknown>
  }
  const created_at = typeof o.created_at === 'number' ? o.created_at : undefined
  const emailNorm =
    email === undefined || email === null ? email : email.trim() === '' ? null : email
  return { id, name, email: emailNorm, ai_nickname, preferences, created_at }
}
