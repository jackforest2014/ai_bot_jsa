/** 与 GET /api/user、PUT /api/user 对齐（preferences 由后端从 preferences_json 解析时字段名可能为 preferences） */
export interface User {
  id: string
  name: string
  email: string
  ai_nickname?: string
  preferences?: Record<string, unknown>
  created_at?: number
}
