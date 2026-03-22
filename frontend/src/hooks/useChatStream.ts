import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'

import { sessionsAPI } from '@/api/sessions'
import { consumeChatStream } from '@/lib/chat-stream'
import type { ChatMessage, StreamMessageMeta } from '@/types/chat'
import type { CitationPayload, SseEvent, ToolResultMetaPayload } from '@/types/sse'
import { useChatSessionStore } from '@/store/chatSessionStore'
import type { ChatStatus } from '@/store/uiStore'
import { useUiStore } from '@/store/uiStore'

const emptyMeta = (): StreamMessageMeta => ({
  toolCalls: [],
  toolResultMetas: [],
  citations: [],
})

/** 后端 SSE：任务类工具完成后推 meta，用于刷新右侧任务列表 */
const TASK_TOOL_SSE = new Set(['add_task', 'list_tasks', 'update_task', 'delete_task'])

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

/** 与后端 `event: status` 的 `phase` 对齐 */
function statusPhaseToHint(phase: string): string | null {
  switch (phase) {
    case 'memory_retrieving':
      return '检索记忆中…'
    case 'memory_skipped':
      return '记忆检索超时或失败，已跳过并继续回复…'
    case 'model_generating':
      return '模型生成中…'
    case 'tools_running':
      return '正在执行工具…'
    default:
      return null
  }
}

export interface UseChatStreamResult {
  messages: ChatMessage[]
  send: (text: string) => Promise<void>
  /** 重试指定用户消息对应的助手回复（替换其下一条 assistant 气泡） */
  retryAfterUserMessage: (userMessageId: string) => Promise<void>
  stop: () => void
  streaming: boolean
  error: string | null
  /** 流式阶段提示（输入框上方展示）；无提示时为 null */
  streamStatusHint: string | null
  /** 切换会话拉取历史期间为 true，避免未完成加载时发送导致状态被覆盖（任务 4.5） */
  historyLoading: boolean
  /** 任务类工具 SSE 每次完成递增，供任务侧栏静默刷新 */
  tasksRefreshTick: number
}

/**
 * 对话流式：`consumeChatStream` + `AbortController`；错误 toast + 消息级重试（任务 3.6）。
 */
export function useChatStream(): UseChatStreamResult {
  const setChatStatus = useUiStore((s) => s.setChatStatus)
  const activeSessionId = useChatSessionStore((s) => s.activeSessionId)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamStatusHint, setStreamStatusHint] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [tasksRefreshTick, setTasksRefreshTick] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const assistantIdRef = useRef<string | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  useEffect(() => {
    abortRef.current?.abort()
    setStreamStatusHint(null)
    if (!activeSessionId) {
      setMessages([])
      setError(null)
      setHistoryLoading(false)
      return
    }
    let cancelled = false
    setHistoryLoading(true)
    setMessages([])
    setError(null)
    sessionsAPI
      .messages(activeSessionId)
      .then((msgs) => {
        if (cancelled) return
        if (useChatSessionStore.getState().activeSessionId !== activeSessionId) return
        setMessages(msgs)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('加载历史消息失败')
          setMessages([])
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeSessionId])

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

      if (ev.event === 'status') {
        const raw = ev.data
        const phase =
          raw && typeof raw === 'object' && raw !== null && 'phase' in raw
            ? String((raw as { phase: unknown }).phase)
            : ''
        const hint = phase ? statusPhaseToHint(phase) : null
        setStreamStatusHint(hint)
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
        const tn = typeof data.tool === 'string' ? data.tool : ''
        if (TASK_TOOL_SSE.has(tn)) setTasksRefreshTick((x) => x + 1)
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

      /** 联网找图白名单清洗后的全文替换（避免流式阶段已生成背诵图链） */
      if (ev.event === 'assistant_content') {
        const raw = ev.data
        const content =
          raw && typeof raw === 'object' && raw !== null && 'content' in raw
            ? String((raw as { content: unknown }).content ?? '')
            : ''
        const aid = assistantIdRef.current
        if (aid) {
          setMessages((prev) => prev.map((m) => (m.id === aid ? { ...m, content } : m)))
        }
        return
      }

      if (ev.event === 'done') {
        setChatStatus('idle')
        setStreamStatusHint(null)
      }
    },
    [setChatStatus, updateAssistantMeta],
  )

  const runAssistantStream = useCallback(
    async (userText: string, assistantId: string, ac: AbortController, sessionId: string) => {
      assistantIdRef.current = assistantId
      setChatStatus('thinking')
      try {
        await consumeChatStream({
          message: userText,
          session_id: sessionId,
          signal: ac.signal,
          onEvent: dispatchEvent,
        })
        setError(null)
        void sessionsAPI
          .list()
          .then((list) => {
            if (Array.isArray(list)) useChatSessionStore.getState().setSessions(list)
          })
          .catch(() => {})
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
        setStreamStatusHint(null)
      }
    },
    [dispatchEvent, setChatStatus],
  )

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || streaming || historyLoading) return

      let sessionId: string
      try {
        sessionId = await useChatSessionStore.getState().ensureActiveSession()
      } catch (e) {
        const msg = e instanceof Error ? e.message : '无法创建或选中会话'
        toast.error(msg)
        return
      }

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
      setStreamStatusHint(null)
      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setStreaming(true)
      await runAssistantStream(trimmed, assistantId, ac, sessionId)
    },
    [runAssistantStream, streaming, historyLoading],
  )

  const retryAfterUserMessage = useCallback(
    async (userMessageId: string) => {
      if (streaming || historyLoading) return
      const prev = messagesRef.current
      const i = prev.findIndex((m) => m.id === userMessageId && m.role === 'user')
      if (i < 0) return
      const after = prev[i + 1]
      if (!after || after.role !== 'assistant') return
      const userText = prev[i].content.trim()
      if (!userText) return

      let sessionId: string
      try {
        sessionId = await useChatSessionStore.getState().ensureActiveSession()
      } catch (e) {
        const msg = e instanceof Error ? e.message : '无法创建或选中会话'
        toast.error(msg)
        return
      }

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
      setStreamStatusHint(null)
      setMessages([...prev.slice(0, i + 1), freshAssistant, ...prev.slice(i + 2)])
      setStreaming(true)
      await runAssistantStream(userText, newAssistantId, ac, sessionId)
    },
    [streaming, historyLoading, runAssistantStream],
  )

  return {
    messages,
    send,
    retryAfterUserMessage,
    stop,
    streaming,
    error,
    streamStatusHint,
    historyLoading,
    tasksRefreshTick,
  }
}
