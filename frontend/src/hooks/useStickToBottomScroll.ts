import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/** 距底部小于此值视为「贴在底部」，新消息/流式输出时自动跟随 */
const PIN_THRESHOLD_PX = 100

/**
 * 对话区纵向滚动：默认贴底；用户上滑阅读时暂停自动滚动，回到底部附近再恢复。
 * 使用 rAF 合并同一帧内多次内容更新，避免流式 token 下反复 scroll 造成抖动。
 */
export function useStickToBottomScroll(messages: unknown[]) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const rafRef = useRef<number | null>(null)

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedRef.current = gap <= PIN_THRESHOLD_PX
  }, [])

  const flushScroll = useCallback((force: boolean) => {
    const el = scrollRef.current
    if (!el) return
    if (!force && !pinnedRef.current) return
    el.scrollTop = el.scrollHeight
  }, [])

  const scheduleScroll = useCallback(
    (force: boolean) => {
      if (!force && !pinnedRef.current) return
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        flushScroll(force)
      })
    },
    [flushScroll],
  )

  useLayoutEffect(() => {
    scheduleScroll(false)
  }, [messages, scheduleScroll])

  useEffect(() => {
    const inner = contentRef.current
    if (!inner) return
    const ro = new ResizeObserver(() => {
      scheduleScroll(false)
    })
    ro.observe(inner)
    return () => ro.disconnect()
  }, [scheduleScroll])

  /** 发送前调用：强制贴底，确保用户消息出现在视区内 */
  const afterUserSentIntent = useCallback(() => {
    pinnedRef.current = true
    scheduleScroll(true)
  }, [scheduleScroll])

  return { scrollRef, contentRef, onScroll, afterUserSentIntent }
}
