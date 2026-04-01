import { Hono } from 'hono';
import type { Env } from '../env';
import {
  ConversationRepository,
  SessionRepository,
  UserRepository,
  getDb,
  type ChatSessionRow,
} from '../db';
import { requireUserFromBearer } from '../auth/resolve-user';

function sessionToJson(s: ChatSessionRow) {
  return {
    id: s.id,
    title: s.title,
    title_source: s.title_source,
    proxy_for_user_id: s.proxy_for_user_id,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

export const sessionRoutes = new Hono<{ Bindings: Env }>();

sessionRoutes.get('/', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const sessions = new SessionRepository(db);
  const list = await sessions.listByUserId(user.id);
  return c.json(list.map(sessionToJson));
});

sessionRoutes.post('/', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);

  let title = '新对话';
  let proxyForUserId: string | null = null;
  try {
    const raw = await c.req.text();
    if (raw) {
      const body = JSON.parse(raw) as { title?: unknown; proxy_uuid?: unknown };
      if (typeof body.title === 'string' && body.title.trim()) {
        title = body.title.trim();
      }
      if (typeof body.proxy_uuid === 'string' && body.proxy_uuid.trim()) {
        const targetUser = await users.findByProxyUuid(body.proxy_uuid.trim());
        if (targetUser) {
          proxyForUserId = targetUser.id;
        }
      }
    }
  } catch {
    /* 空体或非 JSON：默认标题 */
  }

  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();
  const sessions = new SessionRepository(db);
  await sessions.insert({
    id,
    user_id: user.id,
    proxy_for_user_id: proxyForUserId,
    title,
    title_source: 'auto',
    created_at: now,
    updated_at: now,
  });
  const row = await sessions.findByIdForUser(id, user.id);
  if (!row) {
    return c.json({ error: '创建会话失败', code: 'INTERNAL' }, 500);
  }
  return c.json(sessionToJson(row));
});

sessionRoutes.get('/inbox', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const sessions = new SessionRepository(db);
  const list = await sessions.listByProxyForUserId(user.id);
  return c.json(list.map(sessionToJson));
});

sessionRoutes.get('/:sessionId/messages', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const sessionId = c.req.param('sessionId');
  const sessions = new SessionRepository(db);
  const session = await sessions.findByIdForUserOrProxyOwner(sessionId, user.id);
  if (!session) {
    return c.json({ error: '会话不存在', code: 'NOT_FOUND' }, 404);
  }

  const cursor = c.req.query('cursor')?.trim() || null;
  const limitRaw = c.req.query('limit');
  const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
  const lim = Math.min(Math.max(Number.isFinite(limitParsed) ? limitParsed : 50, 1), 100);
  const conv = new ConversationRepository(db);
  const rows = await conv.listMessagesPaginated(sessionId, cursor, lim);
  const next_cursor = rows.length === lim ? rows[rows.length - 1]!.id : null;

  return c.json({
    messages: rows.map((m) => ({
      id: m.id,
      user_id: m.user_id,
      session_id: m.session_id,
      role: m.role,
      content: m.content,
      intention: m.intention,
      prompt_id: m.prompt_id,
      keywords: m.keywords,
      conversation_id: m.conversation_id,
      created_at: m.created_at,
    })),
    next_cursor,
  });
});

sessionRoutes.patch('/:sessionId', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const sessionId = c.req.param('sessionId');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求体须为 JSON', code: 'VALIDATION_ERROR' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return c.json({ error: '无效请求体', code: 'VALIDATION_ERROR' }, 400);
  }
  const title = (body as { title?: unknown }).title;
  if (typeof title !== 'string' || !title.trim()) {
    return c.json({ error: 'title 不能为空', code: 'VALIDATION_ERROR' }, 400);
  }

  const sessions = new SessionRepository(db);
  const ok = await sessions.updateTitle(sessionId, user.id, title);
  if (!ok) {
    return c.json({ error: '会话不存在', code: 'NOT_FOUND' }, 404);
  }
  const row = await sessions.findByIdForUser(sessionId, user.id);
  return c.json(sessionToJson(row!));
});

sessionRoutes.delete('/:sessionId', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const sessionId = c.req.param('sessionId');
  const sessions = new SessionRepository(db);
  const ok = await sessions.delete(sessionId, user.id);
  if (!ok) {
    return c.json({ error: '会话不存在', code: 'NOT_FOUND' }, 404);
  }
  return new Response(null, { status: 204 });
});
