import type { TaskRepository, TaskRow } from '../db';
import type { Tool } from './tool-registry';
import { ToolRegistry } from './tool-registry';

function jsonResult(payload: unknown) {
  return { output: JSON.stringify(payload) };
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

function detailToString(detail: unknown): string | null {
  if (detail == null) return null;
  if (typeof detail === 'string') return detail;
  return JSON.stringify(detail);
}

function createAddTaskTool(tasks: TaskRepository): Tool {
  return {
    name: 'add_task',
    description:
      '创建任务。可传 detail 对象承载子任务等结构化字段（写入 detail_json）。',
    parametersSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '任务标题' },
        description: { type: 'string', description: '任务描述' },
        detail: { type: 'object', description: '结构化详情，如 subtasks' },
        status: { type: 'string', description: 'pending | done 等' },
        project_id: { type: 'string', description: '可选项目 ID' },
      },
      required: ['title'],
    },
    async execute(argsJson, ctx) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return jsonResult({ ok: false, error: 'invalid_json' });
      }
      const title = readString(args, 'title')?.trim();
      if (!title) {
        return jsonResult({ ok: false, error: 'title_required' });
      }
      const now = Math.floor(Date.now() / 1000);
      const id = crypto.randomUUID();
      const description = readOptionalString(args, 'description');
      const statusRaw = readString(args, 'status')?.trim();
      const projectId = readOptionalString(args, 'project_id');
      const detailStr = Object.prototype.hasOwnProperty.call(args, 'detail')
        ? detailToString(args.detail)
        : undefined;

      await tasks.insert({
        id,
        user_id: ctx.userId,
        project_id: projectId === undefined ? null : projectId,
        title,
        description: description === undefined ? null : description,
        detail_json: detailStr === undefined ? null : detailStr,
        status: statusRaw || 'pending',
        created_at: now,
        updated_at: now,
      });

      const row = await tasks.findByIdForUser(id, ctx.userId);
      return jsonResult({ ok: true, task: row ? summarizeTask(row) : { id } });
    },
  };
}

function createListTasksTool(tasks: TaskRepository): Tool {
  return {
    name: 'list_tasks',
    description: '列出当前用户的任务，可按 status、project_id 过滤。',
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
        return jsonResult({ ok: false, error: 'invalid_json' });
      }
      const status = readString(args, 'status')?.trim();
      let projectId: string | null | undefined;
      if (Object.prototype.hasOwnProperty.call(args, 'project_id')) {
        const p = args.project_id;
        if (p === null || p === '') projectId = null;
        else if (typeof p === 'string') projectId = p;
      }
      const list = await tasks.listByUserId(ctx.userId, {
        ...(status ? { status } : {}),
        ...(projectId !== undefined ? { projectId } : {}),
      });
      return jsonResult({
        ok: true,
        tasks: list.map(summarizeTask),
      });
    },
  };
}

function createUpdateTaskTool(tasks: TaskRepository): Tool {
  return {
    name: 'update_task',
    description: '按 task_id 更新任务字段；可更新 detail 对象（写入 detail_json）。',
    parametersSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        detail: { type: 'object' },
        status: { type: 'string' },
        project_id: { type: 'string' },
      },
      required: ['task_id'],
    },
    async execute(argsJson, ctx) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return jsonResult({ ok: false, error: 'invalid_json' });
      }
      const taskId = readString(args, 'task_id')?.trim();
      if (!taskId) {
        return jsonResult({ ok: false, error: 'task_id_required' });
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

      const ok = await tasks.updateForUser(taskId, ctx.userId, patch);
      if (!ok) return jsonResult({ ok: false, error: 'not_found' });
      const row = await tasks.findByIdForUser(taskId, ctx.userId);
      return jsonResult({ ok: true, task: row ? summarizeTask(row) : null });
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
        return jsonResult({ ok: false, error: 'invalid_json' });
      }
      const taskId = readString(args, 'task_id')?.trim();
      if (!taskId) {
        return jsonResult({ ok: false, error: 'task_id_required' });
      }
      const ok = await tasks.deleteForUser(taskId, ctx.userId);
      return jsonResult({ ok, deleted: ok });
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
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    detail: detail ?? null,
    status: row.status,
    project_id: row.project_id ?? null,
    updated_at: row.updated_at,
  };
}

/** 注册 add_task / list_tasks / update_task / delete_task（任务 2.7） */
export function registerTaskTools(registry: ToolRegistry, tasks: TaskRepository): void {
  registry.register(createAddTaskTool(tasks));
  registry.register(createListTasksTool(tasks));
  registry.register(createUpdateTaskTool(tasks));
  registry.register(createDeleteTaskTool(tasks));
}
