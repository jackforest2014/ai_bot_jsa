import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/** 距底部小于此值视为「贴在底部」，新消息/流式输出时自动跟随 */
const PIN_THRESHOLD_PX = 100

/**
 * 对话区纵向滚动：默认贴底；用户上滑阅读时暂停自动滚动。
 *
 * - **新消息行**（条数或末条 id 变化）或 **流式已结束**：在 `useLayoutEffect` 里**同步**贴底，保证用户气泡立刻进视口。
 * - **流式仅增长同一条助手内容**：不在 layout 里反复改 `scrollTop`，交给 **ResizeObserver + 每帧最多一次 rAF**
 *   跟滚，合并同一帧内多次高度变化，减轻 Markdown/高亮重排带来的上下抖。
 * - 程序化滚底时短暂忽略 `scroll` 事件，避免误判「贴底」状态。
 */
function tailMessageId(messages: unknown[]): unknown {
  if (messages.length === 0) return undefined
  const m = messages[messages.length - 1] as { id?: unknown }
  return m?.id
}

export function useStickToBottomScroll(messages: unknown[], streaming: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const streamingRef = useRef(streaming)
  streamingRef.current = streaming
  const prevListSigRef = useRef<{ len: number; tailId: unknown }>({ len: 0, tailId: undefined })
  const ignoreScrollEventsRef = useRef(false)
  /** 流式阶段 RO 触发的跟滚，与 layout 同步贴底共用，便于取消重复 rAF */
  const pendingStreamRafRef = useRef<number | null>(null)

  const cancelPendingStreamRaf = useCallback(() => {
    if (pendingStreamRafRef.current != null) {
      cancelAnimationFrame(pendingStreamRafRef.current)
      pendingStreamRafRef.current = null
    }
  }, [])

  const scrollToBottomSync = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    ignoreScrollEventsRef.current = true
    el.scrollTop = el.scrollHeight - el.clientHeight
    requestAnimationFrame(() => {
      ignoreScrollEventsRef.current = false
    })
  }, [])

  /** 流式跟滚：已贴底则不改 scrollTop，减轻亚像素/重排带来的来回拽动 */
  const nudgeToBottomIfNeeded = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const target = el.scrollHeight - el.clientHeight
    if (target - el.scrollTop <= 2) return
    ignoreScrollEventsRef.current = true
    el.scrollTop = target
    requestAnimationFrame(() => {
      ignoreScrollEventsRef.current = false
    })
  }, [])

  const onScroll = useCallback(() => {
    if (ignoreScrollEventsRef.current) return
    const el = scrollRef.current
    if (!el) return
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedRef.current = gap <= PIN_THRESHOLD_PX
  }, [])

  useLayoutEffect(() => {
    const len = messages.length
    const tailId = tailMessageId(messages)
    const prev = prevListSigRef.current
    const listStructuralChange = len !== prev.len || tailId !== prev.tailId
    prevListSigRef.current = { len, tailId }

    if (!pinnedRef.current) return

    if (listStructuralChange || !streaming) {
      cancelPendingStreamRaf()
      scrollToBottomSync()
    }
  }, [messages, streaming, cancelPendingStreamRaf, scrollToBottomSync])

  useEffect(() => {
    const contentEl = contentRef.current
    if (!contentEl) return

    const scheduleStreamFollow = () => {
      if (!pinnedRef.current || !streamingRef.current) return
      if (pendingStreamRafRef.current != null) return
      pendingStreamRafRef.current = requestAnimationFrame(() => {
        pendingStreamRafRef.current = null
        if (!pinnedRef.current || !streamingRef.current) return
        nudgeToBottomIfNeeded()
      })
    }

    const ro = new ResizeObserver(scheduleStreamFollow)
    ro.observe(contentEl)
    return () => {
      ro.disconnect()
      cancelPendingStreamRaf()
    }
  }, [cancelPendingStreamRaf, nudgeToBottomIfNeeded])

  /** 发送前调用：恢复「贴底」；新消息入列后的贴底由 layout effect 同步完成 */
  const afterUserSentIntent = useCallback(() => {
    pinnedRef.current = true
  }, [])

  return { scrollRef, contentRef, onScroll, afterUserSentIntent }
}
