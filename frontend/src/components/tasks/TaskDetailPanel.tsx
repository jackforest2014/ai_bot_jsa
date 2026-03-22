import { useMemo, useState } from 'react'

import type { Task } from '@/types/task'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function extractSubtasks(detail: unknown): unknown[] | null {
  if (!isRecord(detail)) return null
  const st = detail.subtasks
  return Array.isArray(st) ? st : null
}

const shanghaiTime: Intl.DateTimeFormatOptions = {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}

function formatTaskInstant(sec?: number | null): string | null {
  if (sec == null) return null
  return new Date(sec * 1000).toLocaleString('zh-CN', shanghaiTime)
}

export interface TaskDetailPanelProps {
  task: Task | null
}

/** 展示 `detail` / 子任务结构，与对话区互补（技术方案 §3） */
export default function TaskDetailPanel({ task }: TaskDetailPanelProps) {
  const [showRaw, setShowRaw] = useState(false)

  const subtasks = useMemo(() => (task ? extractSubtasks(task.detail) : null), [task])

  if (!task) {
    return (
      <div className="border-t border-cyan-500/25 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500 dark:border-cyan-500/15 dark:bg-slate-950/50">
        选择一条任务可查看详情与子任务
      </div>
    )
  }

  const rawJson =
    task.detail !== undefined && task.detail !== null ? JSON.stringify(task.detail, null, 2) : null

  return (
    <div className="border-t border-slate-200 bg-slate-50/90 px-3 py-2 dark:border-slate-700/60 dark:bg-slate-900/40">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">任务详情</span>
        {rawJson ? (
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="text-xs text-sky-700 hover:underline dark:text-sky-400 dark:hover:text-sky-300"
          >
            {showRaw ? '收起 JSON' : '查看 JSON'}
          </button>
        ) : null}
      </div>
      {task.starts_at != null || task.ends_at != null ? (
        <div className="mb-2 space-y-0.5 text-xs text-slate-700 dark:text-slate-300">
          {formatTaskInstant(task.starts_at) ? (
            <p>
              <span className="text-slate-500 dark:text-slate-500">开始 </span>
              {formatTaskInstant(task.starts_at)}
            </p>
          ) : null}
          {formatTaskInstant(task.ends_at) ? (
            <p>
              <span className="text-slate-500 dark:text-slate-500">结束 </span>
              {formatTaskInstant(task.ends_at)}
            </p>
          ) : null}
        </div>
      ) : null}

      {task.description ? (
        <p className="mb-2 text-xs whitespace-pre-wrap text-slate-600 dark:text-slate-400">
          {task.description}
        </p>
      ) : (
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">无描述</p>
      )}

      {subtasks && subtasks.length > 0 ? (
        <ul className="mb-2 list-inside list-decimal space-y-1 text-xs text-slate-800 dark:text-slate-200">
          {subtasks.map((item, i) => (
            <li key={i} className="break-words">
              {typeof item === 'string'
                ? item
                : isRecord(item) && typeof item.title === 'string'
                  ? item.title
                  : JSON.stringify(item)}
            </li>
          ))}
        </ul>
      ) : null}

      {showRaw && rawJson ? (
        <pre className="max-h-40 overflow-auto rounded border border-slate-300 bg-white p-2 text-[11px] leading-snug text-slate-800 dark:border-slate-600/80 dark:bg-slate-900/80 dark:text-slate-200">
          {rawJson}
        </pre>
      ) : null}

      {!subtasks && !rawJson ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">无结构化 detail</p>
      ) : null}

      <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-500">
        更新于 {task.updated_at ? new Date(task.updated_at * 1000).toLocaleString() : '—'}
      </p>
    </div>
  )
}
