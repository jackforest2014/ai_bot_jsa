import type { TaskRow } from '../db';

/** 东八区可读时间串，供 `schedule_zh` 与工具摘要一致 */
export function formatScheduleZh(sec: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(sec * 1000);
}

/** 与 `summarizeTask` / REST 对齐：有任一端点则生成「起 — 止」中文说明 */
export function computeTaskScheduleZh(row: Pick<TaskRow, 'starts_at' | 'ends_at'>): string | null {
  const starts = row.starts_at ?? null;
  const ends = row.ends_at ?? null;
  if (starts == null && ends == null) return null;
  const a = starts != null ? formatScheduleZh(starts) : '未设开始';
  const b = ends != null ? formatScheduleZh(ends) : '未设结束';
  return `${a} — ${b}`;
}
