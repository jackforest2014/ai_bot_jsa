import type { Task } from '@/types/task'

export interface TaskItemProps {
  task: Task
  selected: boolean
  onSelect: () => void
  onInsertSnippet: () => void
  onComplete: () => void
  onDelete: () => void
  busy?: 'complete' | 'delete'
}

export default function TaskItem({
  task,
  selected,
  onSelect,
  onInsertSnippet,
  onComplete,
  onDelete,
  busy,
}: TaskItemProps) {
  const status = task.status ?? 'pending'
  const done = status === 'done'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={`rounded-md border px-2 py-2 text-left text-sm transition-colors ${
        selected ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-900 line-clamp-2">{task.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                done ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
              }`}
            >
              {status}
            </span>
            {task.project_id ? (
              <span className="truncate text-[10px] text-slate-500" title={task.project_id}>
                项目 {task.project_id.slice(0, 8)}…
              </span>
            ) : (
              <span className="text-[10px] text-slate-400">未归属项目</span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onInsertSnippet()
          }}
          className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          插入指令
        </button>
        <button
          type="button"
          disabled={done || busy === 'complete'}
          onClick={(e) => {
            e.stopPropagation()
            onComplete()
          }}
          className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === 'complete' ? '…' : '完成'}
        </button>
        <button
          type="button"
          disabled={busy === 'delete'}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800 hover:bg-red-100 disabled:opacity-40"
        >
          {busy === 'delete' ? '…' : '删除'}
        </button>
      </div>
    </div>
  )
}
