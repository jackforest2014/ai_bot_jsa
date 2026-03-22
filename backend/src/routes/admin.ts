import { Hono } from 'hono';
import { getDb, ToolInvocationRepository } from '../db';
import type { Env } from '../env';
import { requireAdminGate } from '../auth/require-admin';
import { purgeAllDataForUserByName } from '../services/purge-user-by-name';
import { adminPurgeUserByNameBodySchema } from '../validation/api-schemas';
import { zodIssues } from '../lib/zod-errors';

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.use('*', async (c, next) => {
  /** Demo：按姓名删用户接口暂不鉴权；正式环境应恢复与下方路由一致的 ADMIN 校验 */
  const isPurgeByNameDemo =
    c.req.method === 'POST' &&
    (c.req.path.endsWith('/users/purge-by-name') || c.req.path === '/users/purge-by-name');
  if (isPurgeByNameDemo) {
    await next();
    return;
  }
  const gate = requireAdminGate(c);
  if (!gate.ok) {
    return c.json(gate.response, gate.status);
  }
  await next();
});

/** 统计 [from_sec, to_sec] 闭区间内工具调用次数（Unix 秒）。可选 tool_name。 */
adminRoutes.get('/tool-invocations/count', async (c) => {
  const fromRaw = c.req.query('from_sec');
  const toRaw = c.req.query('to_sec');
  const toolName = c.req.query('tool_name')?.trim() || undefined;
  const fromSec = fromRaw !== undefined && fromRaw !== '' ? Number(fromRaw) : NaN;
  const toSec = toRaw !== undefined && toRaw !== '' ? Number(toRaw) : NaN;
  if (!Number.isFinite(fromSec) || !Number.isFinite(toSec)) {
    return c.json(
      { error: 'from_sec 与 to_sec 须为数字', code: 'VALIDATION_ERROR' },
      400,
    );
  }
  if (fromSec > toSec) {
    return c.json({ error: 'from_sec 不能大于 to_sec', code: 'VALIDATION_ERROR' }, 400);
  }
  const db = getDb(c.env.task_assistant_db);
  const repo = new ToolInvocationRepository(db);
  const count = await repo.countInRange(fromSec, toSec, toolName);
  return c.json({
    from_sec: fromSec,
    to_sec: toSec,
    tool_name: toolName ?? null,
    count,
  });
});

/**
 * 按用户 **显示名**（`users.name`，唯一）删除该用户全部关联数据（D1 级联 + R2 文件 + Qdrant 记忆点）。
 * **当前 Demo：不要求鉴权**（勿暴露公网）；其它 `/api/admin/*` 仍须 `ADMIN_API_SECRET`。
 */
adminRoutes.post('/users/purge-by-name', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求体须为 JSON', code: 'VALIDATION_ERROR' }, 400);
  }
  const parsed = adminPurgeUserByNameBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '参数无效', code: 'VALIDATION_ERROR', issues: zodIssues(parsed.error) }, 400);
  }

  const result = await purgeAllDataForUserByName(c.env, parsed.data.name);
  if (!result.ok) {
    return c.json({ error: result.message, code: result.code }, 404);
  }

  return c.json({
    ok: true,
    user_id: result.user_id,
    user_name: result.user_name,
    files_removed_from_db: result.files_removed_from_db,
    r2_delete_errors: result.r2_delete_errors,
    qdrant_purged: result.qdrant_purged,
    ...(result.qdrant_error ? { qdrant_error: result.qdrant_error } : {}),
  });
});
