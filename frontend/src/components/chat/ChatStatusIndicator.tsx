import type { ChatStatus } from '@/store/uiStore'
import { useUiStore } from '@/store/uiStore'

const LABELS: Record<ChatStatus, string> = {
  idle: '',
  thinking: '正在思考…',
  searching: '正在搜索…',
  researching: '正在整理研究结果…',
}

/** 与 SSE `intention` / `useChatStream` 驱动的 `uiStore.chatStatus` 联动（任务 3.1） */
export default function ChatStatusIndicator() {
  const chatStatus = useUiStore((s) => s.chatStatus)
  const text = LABELS[chatStatus]
  if (!text) return null
  return (
    <div
      className="flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-200/85"
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.55)] dark:bg-cyan-400 dark:shadow-[0_0_8px_rgba(34,211,238,0.7)]" />
      {text}
    </div>
  )
}
