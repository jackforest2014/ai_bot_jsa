import { Hono } from 'hono';
import { AppError } from '../errors/app-errors';
import type { Env } from '../env';
import { getDb, UserRepository, type UserRow } from '../db';
import { requireUserFromBearer } from '../auth/resolve-user';

function parsePreferences(raw: string | null | undefined): Record<string, unknown> | undefined {
  if (!raw?.trim()) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function userToJson(user: UserRow) {
  const preferences = parsePreferences(user.preferences_json);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    ai_nickname: user.ai_nickname,
    ...(preferences !== undefined ? { preferences } : {}),
    created_at: user.created_at,
  };
}

export const userRoutes = new Hono<{ Bindings: Env }>();

userRoutes.get('/', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users);
  return c.json(userToJson(user));
});

userRoutes.put('/', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users);

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

  const patch: Parameters<UserRepository['update']>[1] = {};

  if (typeof o.name === 'string') {
    const name = o.name.trim();
    if (!name) {
      return c.json({ error: 'name 不能为空', code: 'VALIDATION_ERROR' }, 400);
    }
    patch.name = name;
  }

  if (typeof o.email === 'string') {
    const email = o.email.trim();
    if (!email) {
      return c.json({ error: 'email 不能为空', code: 'VALIDATION_ERROR' }, 400);
    }
    if (email !== user.email) {
      const taken = await users.findByEmail(email);
      if (taken && taken.id !== user.id) {
        throw new AppError('邮箱已被使用', { code: 'CONFLICT', statusCode: 409 });
      }
    }
    patch.email = email;
  }

  if (Object.prototype.hasOwnProperty.call(o, 'preferences')) {
    const p = o.preferences;
    if (p == null) {
      patch.preferences_json = null;
    } else if (typeof p === 'object' && !Array.isArray(p)) {
      patch.preferences_json = JSON.stringify(p);
    } else {
      return c.json({ error: 'preferences 须为对象', code: 'VALIDATION_ERROR' }, 400);
    }
  }

  if (Object.keys(patch).length === 0) {
    return c.json(userToJson(user));
  }

  await users.update(user.id, patch);
  const next = await users.findById(user.id);
  if (!next) {
    return c.json({ error: '用户不存在', code: 'NOT_FOUND' }, 404);
  }
  return c.json(userToJson(next));
});

userRoutes.put('/ai-name', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求体须为 JSON', code: 'VALIDATION_ERROR' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return c.json({ error: '无效请求体', code: 'VALIDATION_ERROR' }, 400);
  }
  const nickname = (body as { nickname?: unknown }).nickname;
  if (typeof nickname !== 'string' || !nickname.trim()) {
    return c.json({ error: 'nickname 不能为空', code: 'VALIDATION_ERROR' }, 400);
  }

  await users.update(user.id, { ai_nickname: nickname.trim() });
  const next = await users.findById(user.id);
  if (!next) {
    return c.json({ error: '用户不存在', code: 'NOT_FOUND' }, 404);
  }
  return c.json(userToJson(next));
});
