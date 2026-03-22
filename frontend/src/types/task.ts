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
  /** Unix 秒，东八区墙钟语义 */
  starts_at?: number | null
  ends_at?: number | null
  created_at?: number
  updated_at?: number
}
