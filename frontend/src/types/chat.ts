/** 对话消息（内存 / 可选本地缓存），供后续 SSE、useChat 使用 */
export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt?: number
  /** 挂载 tool_result_meta / citation 等扩展（阶段三） */
  meta?: Record<string, unknown>
}
