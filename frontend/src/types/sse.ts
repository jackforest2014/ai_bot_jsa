/** 与后端 SSE 事件对齐（技术方案 §5.3） */

export type SseEventName =
  | 'token'
  | 'tool_call'
  | 'tool_result_meta'
  | 'citation'
  | 'intention'
  | 'done'
  | string

export interface ToolResultMetaPayload {
  tool?: string
  query?: string
  results?: Array<{
    title?: string
    url?: string
    snippet?: string
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export interface CitationPayload {
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
