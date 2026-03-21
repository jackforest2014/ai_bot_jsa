import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'

import { consumeChatStream } from '@/lib/chat-stream'
import type { ChatMessage, StreamMessageMeta } from '@/types/chat'
import type { CitationPayload, SseEvent, ToolResultMetaPayload } from '@/types/sse'
import type { ChatStatus } from '@/store/uiStore'
import { useUiStore } from '@/store/uiStore'

const emptyMeta = (): StreamMessageMeta => ({
  toolCalls: [],
  toolResultMetas: [],
  citations: [],
})

function intentionToChatStatus(intention: string): ChatStatus {
  const i = intention.toLowerCase()
  if (i.includes('research')) return 'researching'
  if (i.includes('search')) return 'searching'
  return 'thinking'
}

function parseIntentionPayload(data: unknown): string {
  if (typeof data === 'string') return data
  if (data && typeof data === 'object' && 'intention' in data) {
    return String((data as { intention: unknown }).intention ?? '')
  }
  return ''
}

function extractTokenChunk(data: unknown): string {
  if (typeof data === 'string') return data
  if (data && typeof data === 'object' && 'content' in data) {
    return String((data as { content: unknown }).content ?? '')
  }
  return ''
}

export interface UseChatStreamResult {
  messages: ChatMessage[]
  send: (text: string) => Promise<void>
  /** 重试指定用户消息对应的助手回复（替换其下一条 assistant 气泡） */
  retryAfterUserMessage: (userMessageId: string) => Promise<void>
  stop: () => void
  streaming: boolean
  error: string | null
}

/**
 * 对话流式：`consumeChatStream` + `AbortController`；错误 toast + 消息级重试（任务 3.6）。
 */
export function useChatStream(): UseChatStreamResult {
  const setChatStatus = useUiStore((s) => s.setChatStatus)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const assistantIdRef = useRef<string | null>(null)
  const conversationIdRef = useRef<string | undefined>(undefined)
  const messagesRef = useRef<ChatMessage[]>([])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const updateAssistantMeta = useCallback(
    (updater: (m: StreamMessageMeta) => StreamMessageMeta) => {
      const id = assistantIdRef.current
      if (!id) return
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m
          const base = m.streamMeta ?? emptyMeta()
          return { ...m, streamMeta: updater(base) }
        }),
      )
    },
    [],
  )

  const dispatchEvent = useCallback(
    (ev: SseEvent) => {
      if (ev.event === 'intention') {
        const intent = parseIntentionPayload(ev.data)
        if (intent) setChatStatus(intentionToChatStatus(intent))
        return
      }

      if (ev.event === 'tool_call') {
        updateAssistantMeta((m) => ({ ...m, toolCalls: [...m.toolCalls, ev.data] }))
        const name =
          ev.data && typeof ev.data === 'object'
            ? String((ev.data as { name?: string }).name ?? '')
            : ''
        if (name === 'search') setChatStatus('searching')
        return
      }

      if (ev.event === 'tool_result_meta' && ev.data && typeof ev.data === 'object') {
        const data = ev.data as ToolResultMetaPayload
        updateAssistantMeta((m) => ({
          ...m,
          toolResultMetas: [...m.toolResultMetas, data],
        }))
        return
      }

      if (ev.event === 'citation' && ev.data && typeof ev.data === 'object') {
        updateAssistantMeta((m) => ({
          ...m,
          citations: [...m.citations, ev.data as CitationPayload],
        }))
        return
      }

      if ((ev.event as string) === 'citations' && Array.isArray(ev.data)) {
        const list = ev.data as CitationPayload[]
        updateAssistantMeta((m) => ({ ...m, citations: [...m.citations, ...list] }))
        return
      }

      if (ev.event === 'token') {
        const chunk = extractTokenChunk(ev.data)
        const aid = assistantIdRef.current
        if (chunk && aid) {
          setMessages((prev) =>
            prev.map((m) => (m.id === aid ? { ...m, content: m.content + chunk } : m)),
          )
          const cur = useUiStore.getState().chatStatus
          if (cur !== 'searching' && cur !== 'researching') setChatStatus('thinking')
        }
        return
      }

      if (ev.event === 'done') {
        setChatStatus('idle')
      }
    },
    [setChatStatus, updateAssistantMeta],
  )

  const runAssistantStream = useCallback(
    async (userText: string, assistantId: string, ac: AbortController) => {
      assistantIdRef.current = assistantId
      setChatStatus('thinking')
      try {
        await consumeChatStream({
          message: userText,
          conversation_id: conversationIdRef.current,
          signal: ac.signal,
          onEvent: dispatchEvent,
        })
        setError(null)
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          setChatStatus('idle')
          return
        }
        const msg = e instanceof Error ? e.message : '对话请求失败'
        setError(msg)
        toast.error(msg)
        setChatStatus('idle')
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, streamFailed: true, streamErrorMessage: msg } : m,
          ),
        )
      } finally {
        if (abortRef.current === ac) abortRef.current = null
        assistantIdRef.current = null
        setStreaming(false)
        setChatStatus('idle')
      }
    },
    [dispatchEvent, setChatStatus],
  )

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || streaming) return

      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        createdAt: Date.now(),
      }
      const assistantId = crypto.randomUUID()
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        streamMeta: emptyMeta(),
      }

      setError(null)
      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setStreaming(true)
      await runAssistantStream(trimmed, assistantId, ac)
    },
    [runAssistantStream, streaming],
  )

  const retryAfterUserMessage = useCallback(
    async (userMessageId: string) => {
      if (streaming) return
      const prev = messagesRef.current
      const i = prev.findIndex((m) => m.id === userMessageId && m.role === 'user')
      if (i < 0) return
      const after = prev[i + 1]
      if (!after || after.role !== 'assistant') return
      const userText = prev[i].content.trim()
      if (!userText) return

      const newAssistantId = crypto.randomUUID()
      const freshAssistant: ChatMessage = {
        id: newAssistantId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        streamMeta: emptyMeta(),
      }

      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac

      setError(null)
      setMessages([...prev.slice(0, i + 1), freshAssistant, ...prev.slice(i + 2)])
      setStreaming(true)
      await runAssistantStream(userText, newAssistantId, ac)
    },
    [streaming, runAssistantStream],
  )

  return { messages, send, retryAfterUserMessage, stop, streaming, error }
}
