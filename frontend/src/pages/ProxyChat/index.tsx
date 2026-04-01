import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import { apiUrl } from '@/api/client'
import { useUserStore } from '@/store/userStore'

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface ProxyInfo {
  proxy_uuid: string
  nickname?: string
}

interface SessionInfo {
  id: string
  token: string
}

/** 本地 sessionStorage key：按 uuid 隔离，刷新页面可复用同一个访客身份 */
function storageKey(uuid: string) {
  return `proxy_guest_session_${uuid}`
}

function loadStoredSession(uuid: string): SessionInfo | null {
  try {
    const raw = sessionStorage.getItem(storageKey(uuid))
    if (!raw) return null
    return JSON.parse(raw) as SessionInfo
  } catch {
    return null
  }
}

function saveSession(uuid: string, sess: SessionInfo) {
  try {
    sessionStorage.setItem(storageKey(uuid), JSON.stringify(sess))
  } catch {
    /* ignore quota errors */
  }
}

function clearSession(uuid: string) {
  try {
    sessionStorage.removeItem(storageKey(uuid))
  } catch {
    /* ignore */
  }
}

async function fetchProxyInfo(uuid: string): Promise<ProxyInfo> {
  const res = await fetch(apiUrl(`/api/proxy/${uuid}/info`))
  if (!res.ok) throw new Error('无效的代理链接')
  return res.json() as Promise<ProxyInfo>
}

async function createProxySession(uuid: string, existingToken: string | null): Promise<SessionInfo> {
  let tokenToUse = existingToken
  if (!tokenToUse) {
    // 匿名访客注册
    const guestName = `访客_${uuid}_${crypto.randomUUID().slice(0, 8)}`
    const loginRes = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: guestName }),
    })
    if (!loginRes.ok) throw new Error('初始化访客失败')
    const loginData = (await loginRes.json()) as { token: string; user: { id: string } }
    tokenToUse = loginData.token
  }

  const sessionRes = await fetch(apiUrl('/api/sessions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenToUse}`,
    },
    body: JSON.stringify({ proxy_uuid: uuid }),
  })
  if (!sessionRes.ok) throw new Error('创建访客会话失败')
  const sessionData = (await sessionRes.json()) as { id: string }
  return { id: sessionData.id, token: tokenToUse }
}

export default function ProxyPage() {
  const { uuid } = useParams<{ uuid: string }>()
  const [proxyInfo, setProxyInfo] = useState<ProxyInfo | null>(null)
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initError, setInitError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  // 防止 React StrictMode 双重调用导致并发注册冲突
  const initStarted = useRef(false)

  useEffect(() => {
    if (!uuid || initStarted.current) return
    initStarted.current = true

    // 优先复用 sessionStorage 中已存在的代理身份
    // 但如果用户当前已经全局登录，且存储的 token 不是该用户的（比如之前是作为匿名访客访问的），则需要忽略旧 session 为其重建
    const tokenFromStore = useUserStore.getState().token
    const stored = loadStoredSession(uuid)
    const shouldCreateNew = !stored || (tokenFromStore && stored.token !== tokenFromStore)

    const init = shouldCreateNew
      ? Promise.all([fetchProxyInfo(uuid), createProxySession(uuid, tokenFromStore)])
      : Promise.all([fetchProxyInfo(uuid), Promise.resolve(stored!)])

    init
      .then(([info, sess]) => {
        setProxyInfo(info)
        setSession(sess)
        saveSession(uuid, sess)

        if (stored) {
          fetch(apiUrl(`/api/sessions/${sess.id}/messages?limit=100`), {
            headers: { Authorization: `Bearer ${sess.token}` },
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((data: any) => {
              if (data && Array.isArray(data.messages)) {
                setMessages(
                  data.messages.map((m: any) => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                  }))
                )
              }
            })
            .catch(() => {
              /* ignore history load errors */
            })
        }
      })
      .catch((e) => setInitError(e instanceof Error ? e.message : '初始化失败'))
      .finally(() => setLoading(false))
  }, [uuid])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const send = async (text: string) => {
    if (!session || streaming || !text.trim()) return
    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: 'user', content: text.trim() }
    setMessages((prev) => [...prev, userMsg])
    setStreaming(true)
    setError(null)

    const assistantId = crypto.randomUUID()
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch(apiUrl('/api/chat/stream'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ message: text.trim(), session_id: session.id }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        throw new Error(`请求失败 (${res.status})`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          // SSE 块可能是单行 `data: {...}` 或多行 `event: token\ndata: {...}`
          // 统一提取 data: 行
          const dataLine = part
            .split('\n')
            .find((l) => l.startsWith('data: '))
          if (!dataLine) continue
          const data = dataLine.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const evt = JSON.parse(data) as { type?: string; text?: string; content?: string }
            // 兼容两种格式：{ type:'text', text:'...' } 或 { content:'...' }（event: token 时）
            const chunk = evt.text ?? evt.content ?? null
            if (typeof chunk === 'string' && chunk) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + chunk } : m,
                ),
              )
            }
          } catch {
            /* skip malformed SSE chunk */
          }
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError(e instanceof Error ? e.message : '发送失败')
      }
    } finally {
      setStreaming(false)
    }
  }

  const handleReset = () => {
    abortRef.current?.abort()
    if (uuid) clearSession(uuid)
    setMessages([])
    setStreaming(false)
    setSession(null)
    setLoading(true)
    setInitError(null)
    initStarted.current = false
    if (uuid) {
      const currentToken = useUserStore.getState().token
      createProxySession(uuid, currentToken)
        .then((sess) => {
          setSession(sess)
          saveSession(uuid, sess)
        })
        .catch((e) => setInitError(e instanceof Error ? e.message : '重新初始化失败'))
        .finally(() => setLoading(false))
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <p className="text-sm text-slate-400">正在初始化代理频道…</p>
      </div>
    )
  }

  if (initError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-6 py-4 text-center">
          <p className="text-sm font-medium text-red-200">{initError}</p>
          <p className="mt-1 text-xs text-red-300/70">请检查代理链接是否有效。</p>
          <button
            type="button"
            onClick={handleReset}
            className="mt-3 rounded-md border border-red-400/40 bg-red-900/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-800/40"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-cyan-500/15 bg-slate-950/80 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-slate-600 text-sm font-bold text-white shadow-[0_0_12px_rgba(34,211,238,0.3)]">
            AI
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">
              {proxyInfo?.nickname ?? 'AI 助理'}
            </p>
            <p className="text-xs text-slate-500">专属对话频道</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-md border border-slate-600/60 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-slate-100"
        >
          重新开始
        </button>
      </header>

      {/* Message Area */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="mx-auto mt-8 max-w-sm text-center">
            <div className="mb-4 text-4xl">👋</div>
            <p className="text-sm text-slate-400">
              你好！我是 <strong className="text-slate-200">{proxyInfo?.nickname ?? 'AI 助理'}</strong>
              ，有什么我可以帮到你的？
            </p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-cyan-600 text-white shadow-[0_0_16px_rgba(34,211,238,0.15)]'
                  : 'border border-cyan-500/15 bg-slate-800/70 text-slate-100 shadow-sm'
              }`}
            >
              {m.content || (streaming && m.role === 'assistant' ? '…' : '')}
            </div>
          </div>
        ))}

        {error && (
          <p className="text-center text-xs text-red-400" role="alert">
            {error}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-cyan-500/15 bg-slate-950/80 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            rows={1}
            className="min-h-[2.25rem] flex-1 resize-none rounded-xl border border-slate-700/80 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-0"
            placeholder="输入消息，Enter 发送…"
            value={draft}
            disabled={streaming || !session}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(draft)
                setDraft('')
              }
            }}
          />
          <button
            type="button"
            disabled={streaming || !draft.trim() || !session}
            onClick={() => {
              void send(draft)
              setDraft('')
            }}
            className="rounded-xl border border-cyan-500/40 bg-gradient-to-r from-cyan-700 to-cyan-600 px-4 py-2 text-sm font-medium text-white shadow-[0_0_16px_rgba(34,211,238,0.2)] hover:from-cyan-600 hover:to-cyan-500 disabled:opacity-40"
          >
            {streaming ? '…' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}
