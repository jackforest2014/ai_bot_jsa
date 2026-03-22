import { useEffect, useState } from 'react'

import { useTasks } from '@/hooks/useTasks'
import type { Task } from '@/types/task'

import TaskDetailPanel from './TaskDetailPanel'
import TaskItem from './TaskItem'

export interface TaskSidebarProps {
  /** 将快捷指令写入对话输入框 */
  onInsertSnippet: (text: string) => void
  disabled?: boolean
  /** 对话中任务类工具 SSE 完成后递增，触发侧栏静默拉取列表 */
  tasksRefreshTick?: number
}

function buildInsertSnippet(task: Task): string {
  return `关于任务「${task.title}」（id: ${task.id}）：`
}

export default function TaskSidebar({
  onInsertSnippet,
  disabled,
  tasksRefreshTick = 0,
}: TaskSidebarProps) {
  const { tasks, loading, error, query, setQuery, create, complete, remove, refresh } = useTasks(
    {},
    { enabled: !disabled },
  )

  useEffect(() => {
    if (disabled || tasksRefreshTick <= 0) return
    const id = window.setTimeout(() => {
      void refresh({ silent: true })
    }, 120)
    return () => window.clearTimeout(id)
  }, [disabled, tasksRefreshTick, refresh])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [busyId, setBusyId] = useState<{ id: string; op: 'complete' | 'delete' } | null>(null)

  const selected = tasks.find((t) => t.id === selectedId) ?? null

  /** 与 GET /api/tasks 一致：任一非默认条件都会缩小列表 */
  const hasActiveFilters =
    Boolean(query.status?.trim()) || query.project_id !== undefined

  const clearFilters = () => setQuery({})

  if (disabled) {
    return (
      <aside className="rounded-lg border border-dashed border-cyan-400/50 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500 dark:border-cyan-500/25 dark:bg-slate-950/40">
        登录后可管理任务侧栏
      </aside>
    )
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg border border-cyan-500/35 bg-white/90 shadow-md backdrop-blur-sm dark:border-cyan-500/20 dark:bg-slate-950/60 dark:shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
      <div className="border-b border-cyan-500/25 px-3 py-2 dark:border-cyan-500/15">
        <h3 className="bg-gradient-to-r from-cyan-700 to-slate-700 bg-clip-text text-sm font-semibold text-transparent dark:from-cyan-200 dark:to-slate-300">
          任务
        </h3>
        <div className="mt-2 space-y-2">
          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
            状态
            <select
              value={query.status ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setQuery((q) => ({ ...q, status: v || undefined }))
              }}
              className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-600/80 dark:bg-slate-900/70 dark:text-slate-100"
            >
              <option value="">全部</option>
              <option value="pending">pending</option>
              <option value="done">done</option>
            </select>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-[11px] text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={query.project_id === null}
              onChange={(e) => {
                setQuery((q) => ({
                  ...q,
                  project_id: e.target.checked ? null : undefined,
                }))
              }}
            />
            <span>
              仅未归属项目
              <span className="mt-0.5 block font-normal text-slate-500 dark:text-slate-500">
                勾选后只请求「无 project_id」的任务；有条目带了项目 ID 时不会出现在列表里。
              </span>
            </span>
          </label>
          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
            项目 ID
            <input
              type="text"
              value={
                query.project_id === null || query.project_id === undefined ? '' : query.project_id
              }
              onChange={(e) => {
                const v = e.target.value.trim()
                setQuery((q) => ({
                  ...q,
                  project_id: v === '' ? undefined : v,
                }))
              }}
              disabled={query.project_id === null}
              placeholder="可选，过滤 project_id"
              className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 placeholder:text-slate-400 disabled:opacity-50 dark:border-slate-600/80 dark:bg-slate-900/70 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </label>
        </div>
        <form
          className="mt-2 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            void (async () => {
              const row = await create(newTitle)
              if (row) {
                setNewTitle('')
                setSelectedId(row.id)
              }
            })()
          }}
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="新建任务标题"
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 placeholder:text-slate-400 dark:border-slate-600/80 dark:bg-slate-900/70 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={!newTitle.trim()}
            className="shrink-0 rounded border border-cyan-500/50 bg-cyan-100 px-2 py-1 text-xs font-medium text-cyan-900 hover:bg-cyan-200/80 disabled:opacity-40 dark:border-cyan-500/40 dark:bg-cyan-900/40 dark:text-cyan-100 dark:hover:bg-cyan-900/55"
          >
            添加
          </button>
        </form>
      </div>

      {error ? (
        <p className="px-3 py-1 text-xs text-red-600 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      {hasActiveFilters ? (
        <div className="mx-2 mt-1 flex flex-wrap items-center gap-2 rounded-md border border-amber-300/70 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/30 dark:text-amber-100">
          <span className="min-w-0 flex-1 leading-snug">
            当前列表已筛选：
            {query.status?.trim() ? (
              <span className="font-medium"> 状态={query.status}</span>
            ) : null}
            {query.project_id === null ? (
              <span className="font-medium"> 仅无项目</span>
            ) : null}
            {typeof query.project_id === 'string' && query.project_id.trim() ? (
              <span className="font-medium"> 指定 project_id</span>
            ) : null}
            {loading ? null : (
              <span className="text-amber-800/90 dark:text-amber-200/80">（{tasks.length} 条）</span>
            )}
          </span>
          <button
            type="button"
            onClick={clearFilters}
            className="shrink-0 rounded border border-amber-400/80 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-900/50 dark:text-amber-100 dark:hover:bg-amber-900/70"
          >
            显示全部
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2">
        {loading && tasks.length === 0 ? (
          <p className="px-1 text-xs text-slate-600 dark:text-slate-500">加载中…</p>
        ) : null}
        {!loading && tasks.length === 0 ? (
          <p className="px-1 text-xs text-slate-600 dark:text-slate-500">
            {hasActiveFilters
              ? '当前筛选条件下没有任务。可点击上方「显示全部」或调整筛选。'
              : '暂无任务，可输入标题添加。'}
          </p>
        ) : null}
        {tasks.map((t) => (
          <TaskItem
            key={t.id}
            task={t}
            selected={selectedId === t.id}
            onSelect={() => setSelectedId(t.id)}
            onInsertSnippet={() => onInsertSnippet(buildInsertSnippet(t))}
            onComplete={async () => {
              setBusyId({ id: t.id, op: 'complete' })
              try {
                await complete(t.id)
              } finally {
                setBusyId(null)
              }
            }}
            onDelete={async () => {
              setBusyId({ id: t.id, op: 'delete' })
              try {
                await remove(t.id)
                if (selectedId === t.id) setSelectedId(null)
              } finally {
                setBusyId(null)
              }
            }}
            busy={busyId?.id === t.id ? busyId.op : undefined}
          />
        ))}
      </div>

      <TaskDetailPanel task={selected} />
    </aside>
  )
}
