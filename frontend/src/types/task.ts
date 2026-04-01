/** 与后端 tasks 表及 /api/tasks 对齐 */
export interface Task {
  id: string
  title: string
  description?: string | null
  /** 结构化子任务/详情，API 可能返回 JSON 字符串或已解析对象 */
  detail_json?: string | null
  detail?: unknown
  status?: string
  project_id?: string | null
  /** 访客代理会话中 LLM 创建任务时，自动绑定到对应的 session_id */
  session_id?: string | null
  /** Unix 秒，东八区墙钟语义 */
  starts_at?: number | null
  ends_at?: number | null
  /**
   * REST / list_tasks 只读：有 starts_at 或 ends_at 时为东八区「起 — 止」文案，否则 null
   * （与后端 `computeTaskScheduleZh` 一致）
   */
  schedule_zh?: string | null
  created_at?: number
  updated_at?: number
}
