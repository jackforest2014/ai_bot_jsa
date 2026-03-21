import type { CitationPayload, ToolResultMetaPayload } from '@/types/sse'

/** 对话消息（内存 / 可选本地缓存），供 SSE、useChatStream 使用 */
export type ChatRole = 'user' | 'assistant' | 'system'

/** 当前 assistant 消息上挂载的 SSE 结构化数据（技术方案 §5.3） */
export interface StreamMessageMeta {
  toolCalls: unknown[]
  toolResultMetas: ToolResultMetaPayload[]
  citations: CitationPayload[]
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt?: number
  streamMeta?: StreamMessageMeta
  /** 流式失败（任务 3.6），可消息级重试 */
  streamFailed?: boolean
  streamErrorMessage?: string
  /** 其它扩展（兼容旧字段） */
  meta?: Record<string, unknown>
}

export interface ChatStreamRequestBody {
  message: string
  conversation_id?: string
}
