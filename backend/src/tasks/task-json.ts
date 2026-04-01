import type { TaskRow } from '../db';
import { computeTaskScheduleZh } from './task-schedule-zh';

/** REST 与工具 `summarizeTask` 对齐：将 `detail_json` 解析为 `detail`，并附只读 `schedule_zh` */
export function taskRowToApi(row: TaskRow): Record<string, unknown> {
  let detail: unknown;
  if (row.detail_json?.trim()) {
    try {
      detail = JSON.parse(row.detail_json) as unknown;
    } catch {
      detail = undefined;
    }
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    detail: detail ?? null,
    status: row.status,
    project_id: row.project_id ?? null,
    session_id: row.session_id ?? null,
    starts_at: row.starts_at ?? null,
    ends_at: row.ends_at ?? null,
    schedule_zh: computeTaskScheduleZh(row),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * 请求体中 `detail` 与 `detail_json` 映射到列 `detail_json`。
 * 返回 `undefined` 表示不修改该字段（仅用于 PATCH 语义时）；此处 PUT 全量字段由路由层处理。
 */
export function bodyToDetailJsonString(body: Record<string, unknown>): string | null | undefined {
  if (Object.prototype.hasOwnProperty.call(body, 'detail')) {
    const v = body.detail;
    if (v == null) return null;
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'detail_json')) {
    const v = body.detail_json;
    if (v == null) return null;
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  }
  return undefined;
}
