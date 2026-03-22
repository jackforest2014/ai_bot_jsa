import { request } from '@/api/client'
import type { Task } from '@/types/task'

/** 与 GET /api/tasks 查询参数一致：`project_id` 为空字符串表示仅 `project_id IS NULL` */
export type TaskListQuery = {
  status?: string
  project_id?: string | null
}

function buildTaskListQuery(q?: TaskListQuery): string {
  const p = new URLSearchParams()
  if (q?.status?.trim()) p.set('status', q.status.trim())
  if (q?.project_id !== undefined) {
    p.set('project_id', q.project_id === null ? '' : q.project_id)
  }
  const qs = p.toString()
  return qs ? `?${qs}` : ''
}

export async function listTasks(q?: TaskListQuery): Promise<Task[]> {
  return request<Task[]>(`/api/tasks${buildTaskListQuery(q)}`)
}

export type TaskCreateBody = {
  title: string
  description?: string | null
  detail?: unknown
  detail_json?: string | null
  status?: string
  project_id?: string | null
  starts_at?: number | null
  ends_at?: number | null
}

export async function createTask(body: TaskCreateBody): Promise<Task> {
  return request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(body) })
}

export type TaskUpdateBody = {
  title?: string
  description?: string | null
  status?: string
  project_id?: string | null
  detail?: unknown
  detail_json?: string | null
  starts_at?: number | null
  ends_at?: number | null
}

export async function updateTask(id: string, body: TaskUpdateBody): Promise<Task> {
  return request<Task>(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) })
}

export async function deleteTask(id: string): Promise<void> {
  await request(`/api/tasks/${id}`, { method: 'DELETE' })
}

/** 与技术方案 §5.2 命名一致 */
export const tasksAPI = {
  list: listTasks,
  create: createTask,
  update: updateTask,
  delete: deleteTask,
}
