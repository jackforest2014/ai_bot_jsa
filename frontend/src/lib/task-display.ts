import type { Task } from '@/types/task'

function formatUnixSec(sec: number): string {
  const ms = sec < 1e12 ? sec * 1000 : sec
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** 列表用：优先计划开始 `starts_at`，否则用 `created_at` */
export function formatTaskListStart(task: Task): { text: string; title: string } {
  if (task.starts_at != null && Number.isFinite(task.starts_at)) {
    return {
      text: formatUnixSec(task.starts_at),
      title: '计划开始时间（starts_at）',
    }
  }
  if (task.created_at != null && Number.isFinite(task.created_at)) {
    return {
      text: formatUnixSec(task.created_at),
      title: '任务创建时间（未设置 starts_at 时作为起始参考）',
    }
  }
  return { text: '—', title: '' }
}

export function clampText(s: string, maxChars: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= maxChars) return t
  return `${t.slice(0, maxChars)}…`
}

const SNIPPET_MAX = 50

/**
 * 列表「核心内容」：`description` → `detail.summary` / `detail.note` → 首条子任务标题
 */
export function taskListCoreSnippet(task: Task, maxChars = SNIPPET_MAX): string | null {
  const desc = typeof task.description === 'string' ? task.description.trim() : ''
  if (desc) return clampText(desc, maxChars)

  const d = task.detail
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    const o = d as Record<string, unknown>
    const summary = o.summary
    if (typeof summary === 'string' && summary.trim()) return clampText(summary.trim(), maxChars)
    const note = o.note
    if (typeof note === 'string' && note.trim()) return clampText(note.trim(), maxChars)
    const subtasks = o.subtasks
    if (Array.isArray(subtasks) && subtasks.length > 0) {
      const first = subtasks[0]
      if (first && typeof first === 'object') {
        const title = (first as { title?: string }).title
        if (typeof title === 'string' && title.trim()) return clampText(title.trim(), maxChars)
      }
    }
  }
  return null
}
