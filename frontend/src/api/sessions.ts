import { request } from '@/api/client'
import { sortChatMessagesByTimeline } from '@/lib/chat-message-order'
import type { ChatMessage, ChatSession } from '@/types/chat'

function mapMessageFromApi(raw: unknown): ChatMessage {
  if (!raw || typeof raw !== 'object') {
    return { id: crypto.randomUUID(), role: 'user', content: '' }
  }
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' && o.id ? o.id : crypto.randomUUID()
  const roleRaw = o.role
  const role =
    roleRaw === 'user' || roleRaw === 'assistant' || roleRaw === 'system' ? roleRaw : 'user'
  const content = typeof o.content === 'string' ? o.content : ''
  const createdAt =
    typeof o.created_at === 'number'
      ? o.created_at
      : typeof o.createdAt === 'number'
        ? o.createdAt
        : undefined
  return { id, role, content, createdAt }
}

export const sessionsAPI = {
  list: () => request<ChatSession[]>('/api/sessions'),
  listInbox: () => request<ChatSession[]>('/api/sessions/inbox'),

  create: () =>
    request<ChatSession>('/api/sessions', {
      method: 'POST',
    }),

  messages: (sessionId: string, q?: { cursor?: string; limit?: number }) => {
    const p = new URLSearchParams()
    if (q?.cursor) p.set('cursor', q.cursor)
    if (q?.limit != null) p.set('limit', String(q.limit))
    const qs = p.toString()
    return request<{ messages?: unknown[]; next_cursor?: string | null }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/messages${qs ? `?${qs}` : ''}`,
    ).then((body) => {
      const rows = body?.messages
      const list = Array.isArray(rows) ? rows.map(mapMessageFromApi) : []
      return sortChatMessagesByTimeline(list)
    })
  },

  rename: (sessionId: string, title: string) =>
    request<ChatSession>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),

  /** DELETE 成功时后端返回 204 */
  remove: (sessionId: string) =>
    request<void>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    }),
}
