import { Hono } from 'hono';
import type { Env } from '../env';
import { getDb, UserRepository, type UserRow } from '../db';
import { signUserJwt } from '../auth/jwt-hs256';

function userToAuthJson(user: UserRow) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    ai_nickname: user.ai_nickname,
    proxy_uuid: user.proxy_uuid ?? null,
  };
}

export const authRoutes = new Hono<{ Bindings: Env }>();

/** GET /api/auth/profile-exists?name= */
authRoutes.get('/profile-exists', async (c) => {
  const nameRaw = c.req.query('name')?.trim();
  if (!nameRaw) {
    return c.json({ error: '缺少 name', code: 'VALIDATION_ERROR' }, 400);
  }
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const existing = await users.findByName(nameRaw);
  return c.json({ exists: !!existing });
});

/** POST /api/auth/login */
authRoutes.post('/login', async (c) => {
  const secret = c.env.JWT_SECRET?.trim();
  if (!secret) {
    return c.json({ error: '未配置 JWT_SECRET', code: 'JWT_NOT_CONFIGURED' }, 503);
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
  const nameRaw = o.name;
  if (typeof nameRaw !== 'string' || !nameRaw.trim()) {
    return c.json({ error: 'name 不能为空', code: 'VALIDATION_ERROR' }, 400);
  }
  const name = nameRaw.trim();

  let emailNorm: string | null = null;
  if (typeof o.email === 'string') {
    const t = o.email.trim();
    emailNorm = t === '' ? null : t;
  } else if (o.email === null) {
    emailNorm = null;
  }

  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);

  const existing = await users.findByName(name);
  if (existing) {
    const token = await signUserJwt(existing.id, secret);
    return c.json({
      token,
      user: userToAuthJson(existing),
      is_new_user: false,
    });
  }

  if (emailNorm) {
    const byEmail = await users.findByEmail(emailNorm);
    if (byEmail) {
      return c.json({ error: '邮箱已被使用', code: 'CONFLICT' }, 409);
    }
  }

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await users.insert({
    id,
    name,
    email: emailNorm,
    ai_nickname: '助手',
    created_at: now,
    preferences_json: null,
  });

  const created = await users.findById(id);
  if (!created) {
    return c.json({ error: '创建用户失败', code: 'INTERNAL' }, 500);
  }
  const token = await signUserJwt(created.id, secret);
  return c.json({
    token,
    user: userToAuthJson(created),
    is_new_user: true,
  });
});
