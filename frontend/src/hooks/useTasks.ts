import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'

import { createTask, deleteTask, listTasks, updateTask, type TaskListQuery } from '@/api/tasks'
import type { Task } from '@/types/task'

export interface UseTasksOptions {
  /** 为 false 时不请求列表（例如未登录侧栏占位） */
  enabled?: boolean
}

export interface RefreshTasksOptions {
  /** 为 true 时不切换 loading，避免侧栏在对话触发的刷新时闪烁 */
  silent?: boolean
}

export interface UseTasksResult {
  tasks: Task[]
  loading: boolean
  error: string | null
  query: TaskListQuery
  setQuery: (q: TaskListQuery | ((prev: TaskListQuery) => TaskListQuery)) => void
  refresh: (opts?: RefreshTasksOptions) => Promise<void>
  create: (title: string) => Promise<Task | null>
  complete: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

export function useTasks(
  initialQuery: TaskListQuery = {},
  options?: UseTasksOptions,
): UseTasksResult {
  const enabled = options?.enabled ?? true
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState<TaskListQuery>(initialQuery)

  const refresh = useCallback(async (opts?: RefreshTasksOptions) => {
    if (!enabled) return
    const silent = opts?.silent === true
    if (!silent) setLoading(true)
    setError(null)
    try {
      const list = await listTasks(query)
      setTasks(list)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '加载任务失败'
      setError(msg)
      toast.error(msg)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [enabled, query])

  useEffect(() => {
    if (!enabled) {
      setTasks([])
      setError(null)
      setLoading(false)
      return
    }
    void refresh()
  }, [enabled, refresh])

  const create = useCallback(
    async (title: string) => {
      const t = title.trim()
      if (!t) return null
      try {
        const row = await createTask({ title: t, status: 'pending' })
        await refresh()
        toast.success('已创建任务')
        return row
      } catch (e) {
        const msg = e instanceof Error ? e.message : '创建失败'
        toast.error(msg)
        return null
      }
    },
    [refresh],
  )

  const complete = useCallback(
    async (id: string) => {
      try {
        await updateTask(id, { status: 'done' })
        await refresh()
        toast.success('已标记完成')
      } catch (e) {
        const msg = e instanceof Error ? e.message : '更新失败'
        toast.error(msg)
      }
    },
    [refresh],
  )

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteTask(id)
        await refresh()
        toast.success('已删除')
      } catch (e) {
        const msg = e instanceof Error ? e.message : '删除失败'
        toast.error(msg)
      }
    },
    [refresh],
  )

  return { tasks, loading, error, query, setQuery, refresh, create, complete, remove }
}
