import { Hono } from 'hono';
import { getDb, TaskRepository, UserRepository } from '../db';
import type { Env } from '../env';
import { requireUserFromBearer } from '../auth/resolve-user';
import { bodyToDetailJsonString, taskRowToApi } from '../tasks/task-json';
import { shanghaiEndOfDayUnixSec, shanghaiYmdFromMs } from '../tools/shanghai-calendar-tool';

function readBodyUnixField(o: Record<string, unknown>, key: string): number | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(o, key)) return undefined;
  const v = o[key];
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return parseInt(v.trim(), 10);
  return undefined;
}

export const taskRoutes = new Hono<{ Bindings: Env }>();

taskRoutes.get('/', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const tasks = new TaskRepository(db);

  const status = c.req.query('status')?.trim();
  const projectRaw = c.req.query('project_id');
  let projectId: string | null | undefined;
  if (projectRaw !== undefined) {
    projectId = projectRaw === '' ? null : projectRaw;
  }

  const list = await tasks.listByUserId(user.id, {
    ...(status ? { status } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
  });
  return c.json(list.map((row) => taskRowToApi(row)));
});

taskRoutes.post('/', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const tasks = new TaskRepository(db);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求体须为 JSON', code: 'VALIDATION_ERROR' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return c.json({ error: '无效请求体', code: 'VALIDATION_ERROR' }, 400);
  }
  const o = body as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title.trim() : '';
  if (!title) {
    return c.json({ error: 'title 不能为空', code: 'VALIDATION_ERROR' }, 400);
  }

  const description =
    typeof o.description === 'string'
      ? o.description
      : o.description == null
        ? null
        : String(o.description);
  const status =
    typeof o.status === 'string' && o.status.trim() ? o.status.trim() : 'pending';
  const projectId =
    o.project_id === null || o.project_id === ''
      ? null
      : typeof o.project_id === 'string'
        ? o.project_id
        : undefined;

  const detailJson = bodyToDetailJsonString(o);
  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();

  const sRaw = readBodyUnixField(o, 'starts_at');
  const eRaw = readBodyUnixField(o, 'ends_at');
  if (sRaw === undefined && Object.prototype.hasOwnProperty.call(o, 'starts_at') && o.starts_at != null) {
    return c.json({ error: 'starts_at 须为整数 Unix 秒', code: 'VALIDATION_ERROR' }, 400);
  }
  if (eRaw === undefined && Object.prototype.hasOwnProperty.call(o, 'ends_at') && o.ends_at != null) {
    return c.json({ error: 'ends_at 须为整数 Unix 秒', code: 'VALIDATION_ERROR' }, 400);
  }
  const starts_at = sRaw === undefined ? null : sRaw;
  let ends_at: number | null;
  if (eRaw === undefined) {
    if (starts_at !== null) {
      const { y, m, d } = shanghaiYmdFromMs(starts_at * 1000);
      ends_at = shanghaiEndOfDayUnixSec(y, m, d);
    } else {
      ends_at = null;
    }
  } else {
    ends_at = eRaw;
  }

  await tasks.insert({
    id,
    user_id: user.id,
    project_id: projectId === undefined ? null : projectId,
    title,
    description: description === undefined ? null : description,
    detail_json: detailJson === undefined ? null : detailJson,
    status,
    starts_at,
    ends_at,
    created_at: now,
    updated_at: now,
  });

  const row = await tasks.findByIdForUser(id, user.id);
  return c.json(row ? taskRowToApi(row) : { id }, 201);
});

taskRoutes.put('/:id', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const tasks = new TaskRepository(db);
  const id = c.req.param('id')?.trim();
  if (!id) {
    return c.json({ error: '无效 id', code: 'VALIDATION_ERROR' }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求体须为 JSON', code: 'VALIDATION_ERROR' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return c.json({ error: '无效请求体', code: 'VALIDATION_ERROR' }, 400);
  }
  const o = body as Record<string, unknown>;

  const patch: Parameters<TaskRepository['updateForUser']>[2] = {
    updated_at: Math.floor(Date.now() / 1000),
  };

  if (typeof o.title === 'string') {
    const t = o.title.trim();
    if (!t) {
      return c.json({ error: 'title 不能为空', code: 'VALIDATION_ERROR' }, 400);
    }
    patch.title = t;
  }

  if (Object.prototype.hasOwnProperty.call(o, 'description')) {
    const d = o.description;
    patch.description = d == null ? null : String(d);
  }

  if (typeof o.status === 'string' && o.status.trim()) {
    patch.status = o.status.trim();
  }

  if (Object.prototype.hasOwnProperty.call(o, 'project_id')) {
    const p = o.project_id;
    patch.project_id = p == null || p === '' ? null : String(p);
  }

  const detailJson = bodyToDetailJsonString(o);
  if (detailJson !== undefined) {
    patch.detail_json = detailJson;
  }

  if (Object.prototype.hasOwnProperty.call(o, 'starts_at')) {
    const s = readBodyUnixField(o, 'starts_at');
    if (s === undefined && o.starts_at != null) {
      return c.json({ error: 'starts_at 须为整数 Unix 秒', code: 'VALIDATION_ERROR' }, 400);
    }
    patch.starts_at = s ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(o, 'ends_at')) {
    const e = readBodyUnixField(o, 'ends_at');
    if (e === undefined && o.ends_at != null) {
      return c.json({ error: 'ends_at 须为整数 Unix 秒', code: 'VALIDATION_ERROR' }, 400);
    }
    patch.ends_at = e ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(o, 'starts_at') && !Object.prototype.hasOwnProperty.call(o, 'ends_at')) {
    const s = patch.starts_at;
    if (s != null) {
      const { y, m, d } = shanghaiYmdFromMs(s * 1000);
      patch.ends_at = shanghaiEndOfDayUnixSec(y, m, d);
    }
  }

  if (Object.keys(patch).length === 1 && patch.updated_at !== undefined) {
    return c.json({ error: '无有效更新字段', code: 'VALIDATION_ERROR' }, 400);
  }

  const ok = await tasks.updateForUser(id, user.id, patch);
  if (!ok) {
    return c.json({ error: '任务不存在', code: 'NOT_FOUND' }, 404);
  }
  const row = await tasks.findByIdForUser(id, user.id);
  return c.json(row ? taskRowToApi(row) : { id });
});

taskRoutes.delete('/:id', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const tasks = new TaskRepository(db);
  const id = c.req.param('id')?.trim();
  if (!id) {
    return c.json({ error: '无效 id', code: 'VALIDATION_ERROR' }, 400);
  }
  const ok = await tasks.deleteForUser(id, user.id);
  if (!ok) {
    return c.json({ error: '任务不存在', code: 'NOT_FOUND' }, 404);
  }
  return new Response(null, { status: 204 });
});
