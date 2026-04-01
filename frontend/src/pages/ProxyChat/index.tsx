import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import { apiUrl } from '@/api/client'

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

async function fetchProxyInfo(uuid: string): Promise<ProxyInfo> {
  const res = await fetch(apiUrl(`/api/proxy/${uuid}/info`))
  if (!res.ok) throw new Error('无效的代理链接')
  return res.json() as Promise<ProxyInfo>
}

async function createGuestSession(uuid: string): Promise<SessionInfo> {
  // 1. Register an anonymous guest user
  const loginRes = await fetch(apiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `访客_${uuid}_${Date.now()}` }),
  })
  if (!loginRes.ok) throw new Error('初始化访客失败')
  const loginData = (await loginRes.json()) as { token: string; user: { id: string } }

  // 2. Create a session linked to proxy owner
  const sessionRes = await fetch(apiUrl('/api/sessions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginData.token}`,
    },
    body: JSON.stringify({ proxy_uuid: uuid }),
  })
  if (!sessionRes.ok) throw new Error('创建访客会话失败')
  const sessionData = (await sessionRes.json()) as { id: string }
  return { id: sessionData.id, token: loginData.token }
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

  useEffect(() => {
    if (!uuid) return
    Promise.all([fetchProxyInfo(uuid), createGuestSession(uuid)])
      .then(([info, sess]) => {
        setProxyInfo(info)
        setSession(sess)
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

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          const data = part.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const evt = JSON.parse(data) as { type?: string; text?: string }
            if (evt.type === 'text' && typeof evt.text === 'string') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + evt.text } : m,
                ),
              )
            }
          } catch {
            /* skip */
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
    setMessages([])
    setStreaming(false)
    setLoading(true)
    setSession(null)
    if (uuid) {
      createGuestSession(uuid)
        .then(setSession)
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
