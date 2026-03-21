import { useState } from 'react'

import { useTasks } from '@/hooks/useTasks'
import type { Task } from '@/types/task'

import TaskDetailPanel from './TaskDetailPanel'
import TaskItem from './TaskItem'

export interface TaskSidebarProps {
  /** 将快捷指令写入对话输入框 */
  onInsertSnippet: (text: string) => void
  disabled?: boolean
}

function buildInsertSnippet(task: Task): string {
  return `关于任务「${task.title}」（id: ${task.id}）：`
}

export default function TaskSidebar({ onInsertSnippet, disabled }: TaskSidebarProps) {
  const { tasks, loading, error, query, setQuery, create, complete, remove } = useTasks(
    {},
    { enabled: !disabled },
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [busyId, setBusyId] = useState<{ id: string; op: 'complete' | 'delete' } | null>(null)

  const selected = tasks.find((t) => t.id === selectedId) ?? null

  if (disabled) {
    return (
      <aside className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-6 text-center text-xs text-slate-500">
        登录后可管理任务侧栏
      </aside>
    )
  }

  return (
    <aside className="flex max-h-[min(70vh,640px)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-900">任务</h3>
        <div className="mt-2 space-y-2">
          <label className="block text-[11px] font-medium text-slate-600">
            状态
            <select
              value={query.status ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setQuery((q) => ({ ...q, status: v || undefined }))
              }}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-xs"
            >
              <option value="">全部</option>
              <option value="pending">pending</option>
              <option value="done">done</option>
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={query.project_id === null}
              onChange={(e) => {
                setQuery((q) => ({
                  ...q,
                  project_id: e.target.checked ? null : undefined,
                }))
              }}
            />
            仅未归属项目
          </label>
          <label className="block text-[11px] font-medium text-slate-600">
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
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-100"
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
            className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
          />
          <button
            type="submit"
            disabled={!newTitle.trim()}
            className="shrink-0 rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            添加
          </button>
        </form>
      </div>

      {error ? (
        <p className="px-3 py-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2">
        {loading && tasks.length === 0 ? (
          <p className="px-1 text-xs text-slate-500">加载中…</p>
        ) : null}
        {!loading && tasks.length === 0 ? (
          <p className="px-1 text-xs text-slate-500">暂无任务，可输入标题添加。</p>
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
