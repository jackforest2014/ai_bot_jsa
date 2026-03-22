import { useMemo, type ReactNode } from 'react'

import Message from '@/components/chat/Message'
import type { ChatMessage } from '@/types/chat'

export interface MessageListProps {
  messages: ChatMessage[]
  /** 无消息时的占位 */
  emptyHint?: ReactNode
  className?: string
  /** 流式生成中为 true 时关闭 aria-live，减少读屏/浏览器对频繁 DOM 更新的额外处理，利于滚动稳定 */
  streaming?: boolean
  /** 重试该条用户消息对应的助手回复：清空当前助手气泡并重新流式生成（任务 3.6 / 气泡旁重试） */
  onRetryAfterUser?: (userMessageId: string) => void
  /** 为 true 时禁用用户气泡旁的「重新生成」（如正在流式或加载历史） */
  regenerateAssistantDisabled?: boolean
}

/**
 * 对话消息列表；虚拟滚动可选（技术方案 §9），当前以常规滚动容器为主（任务 3.2）。
 */
export default function MessageList({
  messages,
  emptyHint,
  className,
  streaming = false,
  onRetryAfterUser,
  regenerateAssistantDisabled = false,
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
      let onRegenerateReply: (() => void) | undefined
      if (m.role === 'user' && onRetryAfterUser && messages[i + 1]?.role === 'assistant') {
        onRegenerateReply = () => onRetryAfterUser(m.id)
      }
      return (
        <Message
          key={m.id}
          message={m}
          onRetry={onRetry}
          onRegenerateReply={onRegenerateReply}
          regenerateAssistantDisabled={regenerateAssistantDisabled}
        />
      )
    })
  }, [messages, onRetryAfterUser, regenerateAssistantDisabled])

  if (messages.length === 0) {
    return emptyHint ? <div className={className}>{emptyHint}</div> : null
  }

  return (
    <div
      className={className}
      role="log"
      aria-live={streaming ? 'off' : 'polite'}
      aria-relevant="additions"
    >
      <div className="space-y-3">{nodes}</div>
    </div>
  )
}
