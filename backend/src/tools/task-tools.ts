import type { TaskRepository, TaskRow } from '../db';
import { computeTaskScheduleZh } from '../tasks/task-schedule-zh';
import type { Tool, ToolExecuteResult } from './tool-registry';
import { ToolRegistry } from './tool-registry';
import {
  shanghaiEndOfDayUnixSec,
  shanghaiYmdFromMs,
} from './shanghai-calendar-tool';

type TaskToolName = 'add_task' | 'list_tasks' | 'update_task' | 'delete_task';

function jsonResult(payload: unknown) {
  return { output: JSON.stringify(payload) };
}

/** 带 `toolResultMeta`，供 SSE 通知前端刷新任务列表 */
function taskToolResult(tool: TaskToolName, payload: unknown): ToolExecuteResult {
  const { output } = jsonResult(payload);
  return { output, toolResultMeta: { tool } };
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

function readOptionalString(obj: Record<string, unknown>, key: string): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return undefined;
  const v = obj[key];
  if (v == null) return null;
  return typeof v === 'string' ? v : String(v);
}

/** undefined=未传；null=显式空 */
function readOptionalUnixSec(
  obj: Record<string, unknown>,
  key: string,
): number | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return undefined;
  const v = obj[key];
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return parseInt(v.trim(), 10);
  return undefined;
}

function detailToString(detail: unknown): string | null {
  if (detail == null) return null;
  if (typeof detail === 'string') return detail;
  return JSON.stringify(detail);
}

function createAddTaskTool(tasks: TaskRepository): Tool {
  return {
    name: 'add_task',
    description:
      '**必须调用本工具**才会在系统中创建任务；**禁止**在未调用 `add_task` 时向用户声称「已创建/已添加任务」。\n' +
      '**日期与 starts_at（与前端列表「起始」一致）**：只要从用户话里**能确定具体日期**（含「明天」「下周五」等），**必须**经 `resolve_shanghai_calendar` 换算后写入 `starts_at`（Unix 秒）；用户只说某日未给钟点则用该日东八区 00:00。**未传 `ends_at` 且 `starts_at` 已设**时，系统默认该日 23:59:00。完全无法确定日期时可不传 `starts_at`。会面/截止类：先算日期，再尽量追问起止时刻。\n' +
      '**摘要与描述**：创建时尽量填 `description`（一两句核心说明即可，约 50 字内亦可）；若无长描述，可在 `detail` 里放 `{"summary":"..."}` 字符串作列表/卡片摘要。\n' +
      '**project_id（项目）**：可选；仅当用户明确要归入某项目时传 UUID；**与 session 无关**；勿编造。',
    parametersSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '任务标题' },
        description: {
          type: 'string',
          description:
            '可选。一两句话概括任务要点（便于任务列表展示）；与 title 区分：title 短标签，description 稍展开',
        },
        detail: {
          type: 'object',
          description:
            '可选。结构化字段（如 subtasks）；也可含 summary 字符串：{"summary":"50字内核心摘要"}，在无长 description 时供前端展示',
        },
        status: { type: 'string', description: 'pending | done 等' },
        project_id: {
          type: 'string',
          description: '仅当用户明确要关联某项目时传已有项目 UUID；否则省略',
        },
        starts_at: {
          type: 'integer',
          description:
            '可选。能确定用户说的日期时**应填写**（先 resolve_shanghai_calendar）；前端列表显示为「起始」',
        },
        ends_at: {
          type: 'integer',
          description: '结束时刻 Unix 秒；可选，缺省且 starts_at 有时默认为当日晚 23:59:00',
        },
      },
      required: ['title'],
    },
    async execute(argsJson, ctx) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return taskToolResult('add_task', { ok: false, error: 'invalid_json' });
      }
      const title = readString(args, 'title')?.trim();
      if (!title) {
        return taskToolResult('add_task', { ok: false, error: 'title_required' });
      }
      const now = Math.floor(Date.now() / 1000);
      const id = crypto.randomUUID();
      const description = readOptionalString(args, 'description');
      const statusRaw = readString(args, 'status')?.trim();
      const projectId = readOptionalString(args, 'project_id');
      const detailStr = Object.prototype.hasOwnProperty.call(args, 'detail')
        ? detailToString(args.detail)
        : undefined;

      let startsAt = readOptionalUnixSec(args, 'starts_at');
      let endsAt = readOptionalUnixSec(args, 'ends_at');
      if (startsAt === undefined) startsAt = null;
      if (endsAt === undefined) endsAt = null;
      if (startsAt !== null && endsAt === null) {
        const { y, m, d } = shanghaiYmdFromMs(startsAt * 1000);
        endsAt = shanghaiEndOfDayUnixSec(y, m, d);
      }

      await tasks.insert({
        id,
        user_id: ctx.proxyForUserId ?? ctx.userId,
        session_id: ctx.sessionId === undefined ? null : ctx.sessionId,
        project_id: projectId === undefined ? null : projectId,
        title,
        description: description === undefined ? null : description,
        detail_json: detailStr === undefined ? null : detailStr,
        status: statusRaw || 'pending',
        starts_at: startsAt,
        ends_at: endsAt,
        created_at: now,
        updated_at: now,
      });

      const row = await tasks.findByIdForUser(id, ctx.proxyForUserId ?? ctx.userId);
      return taskToolResult('add_task', { ok: true, task: row ? summarizeTask(row) : { id } });
    },
  };
}

function createListTasksTool(tasks: TaskRepository): Tool {
  return {
    name: 'list_tasks',
    description:
      '列出当前用户的任务，可按 status、project_id 过滤。应答时优先使用每条任务的 `starts_at`/`ends_at` 与 `schedule_zh`；若无则读 description。需要把「明天」等换算成公历时**先调用 resolve_shanghai_calendar**。**禁止**在向用户展示的正文中写「速查表第几行」「复制第N行」等内部提示。**禁止**因部分任务有日程、部分无，就断言「某日无任务」（见 system 规则 9）。',
    parametersSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        project_id: { type: 'string', description: '过滤项目；传空字符串表示仅无项目任务' },
      },
    },
    async execute(argsJson, ctx) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return taskToolResult('list_tasks', { ok: false, error: 'invalid_json' });
      }
      const status = readString(args, 'status')?.trim();
      let projectId: string | null | undefined;
      if (Object.prototype.hasOwnProperty.call(args, 'project_id')) {
        const p = args.project_id;
        if (p === null || p === '') projectId = null;
        else if (typeof p === 'string') projectId = p;
      }
      const list = await tasks.listByUserId(ctx.proxyForUserId ?? ctx.userId, {
        ...(status ? { status } : {}),
        ...(projectId !== undefined ? { projectId } : {}),
      });
      return taskToolResult('list_tasks', {
        ok: true,
        tasks: list.map(summarizeTask),
      });
    },
  };
}

function createUpdateTaskTool(tasks: TaskRepository): Tool {
  return {
    name: 'update_task',
    description:
      '按 task_id 更新。若用户补充或更正了**可解析的日期**，须写入 `starts_at`（先 `resolve_shanghai_calendar`），与列表「起始」一致；只更新 `starts_at` 且未传 `ends_at` 时，自动设为该日东八区 23:59:00。更新时尽量维护 `description` 或 `detail.summary` 作为摘要。',
    parametersSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        title: { type: 'string' },
        description: {
          type: 'string',
          description: '可选。一两句说明；无长文时可配合 detail.summary',
        },
        detail: {
          type: 'object',
          description: '可选。可含 {"summary":"..."} 作短摘要',
        },
        status: { type: 'string' },
        project_id: { type: 'string' },
        starts_at: {
          type: 'integer',
          description: '能确定日期时应更新；Unix 秒（东八区），对应列表「起始」',
        },
        ends_at: { type: 'integer' },
      },
      required: ['task_id'],
    },
    async execute(argsJson, ctx) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return taskToolResult('update_task', { ok: false, error: 'invalid_json' });
      }
      const taskId = readString(args, 'task_id')?.trim();
      if (!taskId) {
        return taskToolResult('update_task', { ok: false, error: 'task_id_required' });
      }
      const patch: Parameters<TaskRepository['updateForUser']>[2] = {
        updated_at: Math.floor(Date.now() / 1000),
      };
      if (typeof args.title === 'string') patch.title = args.title;
      if (Object.prototype.hasOwnProperty.call(args, 'description')) {
        const d = args.description;
        patch.description = d == null ? null : String(d);
      }
      if (Object.prototype.hasOwnProperty.call(args, 'status')) {
        const s = args.status;
        patch.status = typeof s === 'string' && s.trim() ? s.trim() : 'pending';
      }
      if (Object.prototype.hasOwnProperty.call(args, 'project_id')) {
        const p = args.project_id;
        patch.project_id = p == null || p === '' ? null : String(p);
      }
      if (Object.prototype.hasOwnProperty.call(args, 'detail')) {
        patch.detail_json = detailToString(args.detail);
      }

      if (Object.prototype.hasOwnProperty.call(args, 'starts_at')) {
        patch.starts_at = readOptionalUnixSec(args, 'starts_at') ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(args, 'ends_at')) {
        patch.ends_at = readOptionalUnixSec(args, 'ends_at') ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(args, 'starts_at') && !Object.prototype.hasOwnProperty.call(args, 'ends_at')) {
        const s = patch.starts_at;
        if (s != null) {
          const { y, m, d } = shanghaiYmdFromMs(s * 1000);
          patch.ends_at = shanghaiEndOfDayUnixSec(y, m, d);
        }
      }

      const ok = await tasks.updateForUser(taskId, ctx.proxyForUserId ?? ctx.userId, patch);
      if (!ok) return taskToolResult('update_task', { ok: false, error: 'not_found' });
      const row = await tasks.findByIdForUser(taskId, ctx.proxyForUserId ?? ctx.userId);
      return taskToolResult('update_task', { ok: true, task: row ? summarizeTask(row) : null });
    },
  };
}

function createConfirmToolCreationTool(tasks: TaskRepository): Tool {
  return {
    name: 'confirm_tool_creation',
    description:
      '**服务端校验工具**：在 `add_task` 返回 `task.id` 后调用，从数据库确认该任务已归属当前用户落库。若需**重试** `add_task`，**必须先**用本工具对上一轮 `task_id` 再确认：若 `ok:true` 则**禁止**再次 `add_task`；若 `ok:false` 且原因为未找到再重试。可选 `title_hint` 用于防止误用他人 `task_id`（须与库中标题一致或为子串）。返回 JSON 仅供模型判断；**勿**在面向用户的正文中写出本工具名。',
    parametersSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'add_task 成功响应中的任务 UUID' },
        title_hint: {
          type: 'string',
          description:
            '可选；若提供则须与库中 title 完全相同或为其子串，否则返回 title_mismatch',
        },
      },
      required: ['task_id'],
    },
    async execute(argsJson, ctx) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return jsonResult({ ok: false, reason: 'invalid_json' });
      }
      const taskId = readString(args, 'task_id')?.trim();
      if (!taskId) {
        return jsonResult({ ok: false, reason: 'task_id_required' });
      }
      const row = await tasks.findByIdForUser(taskId, ctx.proxyForUserId ?? ctx.userId);
      if (!row) {
        return jsonResult({ ok: false, reason: 'not_found' });
      }
      const hint = readString(args, 'title_hint')?.trim();
      if (hint) {
        const t = row.title ?? '';
        if (t !== hint && !t.includes(hint)) {
          return jsonResult({ ok: false, reason: 'title_mismatch' });
        }
      }
      const payload = { ok: true as const, task: summarizeTask(row) };
      const { output } = jsonResult(payload);
      return { output, toolResultMeta: { tool: 'confirm_tool_creation' } };
    },
  };
}

function createDeleteTaskTool(tasks: TaskRepository): Tool {
  return {
    name: 'delete_task',
    description: '按 task_id 删除任务。',
    parametersSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
    },
    async execute(argsJson, ctx) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return taskToolResult('delete_task', { ok: false, error: 'invalid_json' });
      }
      const taskId = readString(args, 'task_id')?.trim();
      if (!taskId) {
        return taskToolResult('delete_task', { ok: false, error: 'task_id_required' });
      }
      const ok = await tasks.deleteForUser(taskId, ctx.proxyForUserId ?? ctx.userId);
      return taskToolResult('delete_task', { ok, deleted: ok });
    },
  };
}

function summarizeTask(row: TaskRow) {
  let detail: unknown;
  if (row.detail_json?.trim()) {
    try {
      detail = JSON.parse(row.detail_json) as unknown;
    } catch {
      detail = row.detail_json;
    }
  }
  const starts = row.starts_at ?? null;
  const ends = row.ends_at ?? null;
  const schedule_zh = computeTaskScheduleZh(row);
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    detail: detail ?? null,
    status: row.status,
    project_id: row.project_id ?? null,
    starts_at: starts,
    ends_at: ends,
    schedule_zh,
    updated_at: row.updated_at,
  };
}

/** 注册 add_task / list_tasks / update_task / delete_task（任务 2.7） */
export function registerTaskTools(registry: ToolRegistry, tasks: TaskRepository): void {
  registry.register(createAddTaskTool(tasks));
  registry.register(createListTasksTool(tasks));
  registry.register(createUpdateTaskTool(tasks));
  registry.register(createConfirmToolCreationTool(tasks));
  registry.register(createDeleteTaskTool(tasks));
}
