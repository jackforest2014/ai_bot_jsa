/**
 * SSE 消费：`apiUrl('/api/chat/stream')` + `AbortSignal` 中止（技术方案 §5.3）。
 */
import type { SseEvent } from '@/types/sse'
import { apiUrl } from '@/api/client'
import { TOKEN_STORAGE_KEY } from '@/router/guards'
import { useUserStore } from '@/store/userStore'

export type ChatStreamEventHandler = (event: SseEvent) => void

function redirectToLogin(): void {
  useUserStore.getState().clearUser()
  if (window.location.pathname === '/login') {
    window.location.assign('/login')
    return
  }
  const path = `${window.location.pathname}${window.location.search}`
  window.location.assign(`/login?from=${encodeURIComponent(path)}`)
}

function parseSseBlock(block: string): SseEvent | null {
  const lines = block.split('\n')
  let eventName = 'message'
  const dataParts: string[] = []
  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataParts.push(line.slice(5).trimStart())
    }
  }
  if (dataParts.length === 0) return null
  const raw = dataParts.join('\n')
  let data: unknown = raw
  try {
    data = JSON.parse(raw) as unknown
  } catch {
    /* 非 JSON 时保留原文 */
  }
  return { event: eventName, data } as SseEvent
}

function flushSseBuffer(
  buffer: string,
  onEvent: ChatStreamEventHandler,
): { rest: string; consumed: boolean } {
  let rest = buffer
  let consumed = false
  for (;;) {
    const idx = rest.indexOf('\n\n')
    if (idx === -1) break
    const block = rest.slice(0, idx)
    rest = rest.slice(idx + 2)
    const parsed = parseSseBlock(block)
    if (parsed) {
      consumed = true
      onEvent(parsed)
    }
  }
  return { rest, consumed }
}

export interface ConsumeChatStreamOptions {
  message: string
  conversation_id?: string
  signal: AbortSignal
  onEvent: ChatStreamEventHandler
}

export async function consumeChatStream(options: ConsumeChatStreamOptions): Promise<void> {
  const { message, conversation_id, signal, onEvent } = options
  const token =
    useUserStore.getState().token?.trim() || localStorage.getItem(TOKEN_STORAGE_KEY)?.trim()
  const headers = new Headers({
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  })
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(apiUrl('/api/chat/stream'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message,
      ...(conversation_id ? { conversation_id } : {}),
    }),
    signal,
  })

  if (res.status === 401) {
    redirectToLogin()
    throw new Error('未授权，请重新登录')
  }

  if (!res.ok) {
    const text = await res.text()
    let msg = `请求失败（${res.status}）`
    try {
      const j = JSON.parse(text) as { error?: string }
      if (j.error) msg = j.error
    } catch {
      if (text) msg = text.slice(0, 200)
    }
    throw new Error(msg)
  }

  const body = res.body
  if (!body) return

  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const { rest } = flushSseBuffer(buf, onEvent)
      buf = rest
    }
    if (buf.trim()) flushSseBuffer(buf + '\n\n', onEvent)
  } finally {
    reader.releaseLock()
  }
}
