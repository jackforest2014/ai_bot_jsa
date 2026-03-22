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
        selected
          ? 'border-cyan-500/50 bg-cyan-50 shadow-sm dark:border-cyan-500/45 dark:bg-cyan-950/40 dark:shadow-[0_0_16px_rgba(34,211,238,0.12)]'
          : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700/80 dark:bg-slate-900/50 dark:hover:border-slate-600 dark:hover:bg-slate-900/70'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-800 line-clamp-2 dark:text-slate-100">{task.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                done
                  ? 'border border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:border-emerald-500/35 dark:bg-emerald-950/50 dark:text-emerald-200'
                  : 'border border-amber-500/40 bg-amber-50 text-amber-900 dark:border-amber-500/35 dark:bg-amber-950/45 dark:text-amber-100'
              }`}
            >
              {status}
            </span>
            {task.project_id ? (
              <span className="truncate text-[10px] text-slate-500" title={task.project_id}>
                项目 {task.project_id.slice(0, 8)}…
              </span>
            ) : (
              <span className="text-[10px] text-slate-500">未归属项目</span>
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
          className="rounded border border-slate-600/80 bg-slate-900/70 px-2 py-0.5 text-xs text-slate-200 hover:border-cyan-500/35 hover:text-cyan-100"
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
          className="rounded border border-emerald-500/50 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900 hover:bg-emerald-100/90 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-500/40 dark:bg-emerald-950/45 dark:text-emerald-100 dark:hover:bg-emerald-950/65"
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
          className="rounded border border-red-400/60 bg-red-50 px-2 py-0.5 text-xs text-red-800 hover:bg-red-100/90 disabled:opacity-40 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
        >
          {busy === 'delete' ? '…' : '删除'}
        </button>
      </div>
    </div>
  )
}
