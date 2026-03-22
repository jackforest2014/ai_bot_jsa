import { useMemo, type ReactNode } from 'react'

import Message from '@/components/chat/Message'
import type { ChatMessage } from '@/types/chat'

export interface MessageListProps {
  messages: ChatMessage[]
  /** 无消息时的占位 */
  emptyHint?: ReactNode
  className?: string
  /** 助手失败气泡上的「重试」：重试该条用户消息（任务 3.6） */
  onRetryAfterUser?: (userMessageId: string) => void
}

/**
 * 对话消息列表；虚拟滚动可选（技术方案 §9），当前以常规滚动容器为主（任务 3.2）。
 */
export default function MessageList({
  messages,
  emptyHint,
  className,
  onRetryAfterUser,
}: MessageListProps) {
  const nodes = useMemo(() => {
    return messages.map((m, i) => {
      let onRetry: (() => void) | undefined
      if (m.role === 'assistant' && m.streamFailed && onRetryAfterUser) {
        let userId: string | undefined
        for (let j = i - 1; j >= 0; j -= 1) {
          if (messages[j]?.role === 'user') {
            userId = messages[j].id
            break
          }
        }
        if (userId) onRetry = () => onRetryAfterUser(userId)
      }
      return <Message key={m.id} message={m} onRetry={onRetry} />
    })
  }, [messages, onRetryAfterUser])

  if (messages.length === 0) {
    return emptyHint ? <div className={className}>{emptyHint}</div> : null
  }

  return (
    <div className={className} role="log" aria-live="polite" aria-relevant="additions">
      <div className="space-y-3">{nodes}</div>
    </div>
  )
}
