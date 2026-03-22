import { Hono } from 'hono';
import { getDb, ToolInvocationRepository } from '../db';
import type { Env } from '../env';
import { requireAdminGate } from '../auth/require-admin';

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.use('*', async (c, next) => {
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
