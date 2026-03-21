/** 与后端 SSE 事件对齐（技术方案 §5.3） */

export type SseEventName =
  | 'token'
  | 'tool_call'
  | 'tool_result_meta'
  | 'citation'
  | 'intention'
  | 'status'
  | 'done'
  | string

export interface ToolResultMetaPayload {
  tool?: string
  query?: string
  /** Serper 软限/降级等后端文案（任务 3.6 / PRD 2.6.2） */
  notice?: string
  quota_warning?: string
  degraded?: boolean
  /** 后端技术方案 §5.1 使用 `items` 列表 */
  items?: Array<{
    title?: string
    url?: string
    snippet?: string
    date?: string | null
    [key: string]: unknown
  }>
  results?: Array<{
    title?: string
    url?: string
    snippet?: string
    [key: string]: unknown
  }>
  raw_ref?: string
  [key: string]: unknown
}

export interface CitationPayload {
  kind?: string
  file_id?: string
  filename?: string
  semantic_type?: string
  excerpt?: string
  score?: number
  [key: string]: unknown
}

export type SseEvent =
  | { event: 'token'; data: string }
  | { event: 'tool_call'; data: unknown }
  | { event: 'tool_result_meta'; data: ToolResultMetaPayload }
  | { event: 'citation'; data: CitationPayload }
  | { event: 'intention'; data: string }
  | { event: 'done'; data?: unknown }
  | { event: string; data: unknown }
