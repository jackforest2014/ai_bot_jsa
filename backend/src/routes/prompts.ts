import { Hono } from 'hono';
import { PromptRepository, getDb } from '../db';
import type { Env } from '../env';
import { requireAdminGate } from '../auth/require-admin';
import { zodIssues } from '../lib/zod-errors';
import { promptCreateBodySchema, promptUpdateBodySchema } from '../validation/api-schemas';

function rowToJson(row: Awaited<ReturnType<PromptRepository['findById']>>) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    template_text: row.template_text,
    scenario: row.scenario,
    created_at: row.created_at,
  };
}

export const promptRoutes = new Hono<{ Bindings: Env }>();

promptRoutes.use('*', async (c, next) => {
  const gate = requireAdminGate(c);
  if (!gate.ok) {
    return c.json(gate.response, gate.status);
  }
  await next();
});

promptRoutes.get('/', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const prompts = new PromptRepository(db);
  const list = await prompts.list();
  return c.json(list.map((r) => rowToJson(r)));
});

promptRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')?.trim();
  if (!id) {
    return c.json({ error: '无效 id', code: 'VALIDATION_ERROR' }, 400);
  }
  const db = getDb(c.env.task_assistant_db);
  const prompts = new PromptRepository(db);
  const row = await prompts.findById(id);
  if (!row) {
    return c.json({ error: '模板不存在', code: 'NOT_FOUND' }, 404);
  }
  return c.json(rowToJson(row));
});

promptRoutes.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求体须为 JSON', code: 'VALIDATION_ERROR' }, 400);
  }
  const parsed = promptCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: '请求参数无效', code: 'VALIDATION_ERROR', issues: zodIssues(parsed.error) },
      400,
    );
  }
  const db = getDb(c.env.task_assistant_db);
  const prompts = new PromptRepository(db);
  const id = parsed.data.id ?? crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  try {
    await prompts.insert({
      id,
      name: parsed.data.name,
      template_text: parsed.data.template_text,
      scenario: parsed.data.scenario,
      created_at: now,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('UNIQUE') || msg.toLowerCase().includes('unique')) {
      return c.json({ error: '主键 id 已存在', code: 'CONFLICT' }, 409);
    }
    throw e;
  }
  const row = await prompts.findById(id);
  return c.json(rowToJson(row), 201);
});

promptRoutes.put('/:id', async (c) => {
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
  const parsed = promptUpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: '请求参数无效', code: 'VALIDATION_ERROR', issues: zodIssues(parsed.error) },
      400,
    );
  }
  const db = getDb(c.env.task_assistant_db);
  const prompts = new PromptRepository(db);
  const ok = await prompts.update(id, parsed.data);
  if (!ok) {
    return c.json({ error: '模板不存在', code: 'NOT_FOUND' }, 404);
  }
  const row = await prompts.findById(id);
  return c.json(rowToJson(row));
});

promptRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')?.trim();
  if (!id) {
    return c.json({ error: '无效 id', code: 'VALIDATION_ERROR' }, 400);
  }
  const db = getDb(c.env.task_assistant_db);
  const prompts = new PromptRepository(db);
  const ok = await prompts.delete(id);
  if (!ok) {
    return c.json({ error: '模板不存在', code: 'NOT_FOUND' }, 404);
  }
  return c.json({ ok: true });
});
