import { Hono } from 'hono';
import type { Context } from 'hono';
import { FileRepository, UserRepository, getDb } from '../db';
import type { Env } from '../env';
import { requireUserFromBearer } from '../auth/resolve-user';
import { createFileStorage, hasR2Binding } from '../storage';
import { FileService, fileRowToApi, getMultipartPresignFromEnv } from '../files/file-service';
import { FileSizeError, ValidationError } from '../errors/app-errors';
import { recordMetric } from '../observability/metrics';

function waitUntilFromContext(c: Context): ((p: Promise<unknown>) => void) | undefined {
  try {
    const x = c.executionCtx;
    return (p) => x.waitUntil(p);
  } catch {
    return undefined;
  }
}

function requireR2(c: Context) {
  if (!hasR2Binding(c.env)) {
    return c.json({ error: 'R2 未绑定', code: 'R2_NOT_CONFIGURED' }, 503);
  }
  return null;
}

function makeFileService(env: Env): FileService {
  return new FileService(
    new FileRepository(getDb(env.task_assistant_db)),
    createFileStorage(env),
    getMultipartPresignFromEnv(env),
  );
}

function generateProxyUuid(): string {
  // Generate 8 char alphanumeric
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const proxyRoutes = new Hono<{ Bindings: Env }>();

proxyRoutes.get('/:uuid/info', async (c) => {
  const uuid = c.req.param('uuid')?.trim();
  if (!uuid) return c.json({ error: '无效 UUID', code: 'VALIDATION_ERROR' }, 400);

  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const targetUser = await users.findByProxyUuid(uuid);

  if (!targetUser) {
    return c.json({ error: '找不到对应的代理信息', code: 'NOT_FOUND' }, 404);
  }

  // 返回脱敏信息
  return c.json({
    proxy_uuid: targetUser.proxy_uuid,
    nickname: targetUser.ai_nickname,
  });
});

proxyRoutes.post('/upload', async (c) => {
  const r2 = requireR2(c);
  if (r2) return r2;

  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const svc = makeFileService(c.env);

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: '无效表单', code: 'VALIDATION_ERROR' }, 400);
  }

  const fileEntry = form.get('file');
  if (!fileEntry || typeof fileEntry === 'string') {
    return c.json({ error: '缺少 file 字段', code: 'VALIDATION_ERROR' }, 400);
  }
  const fileBlob = fileEntry as Blob;

  const buf = await fileBlob.arrayBuffer();

  try {
    const t0 = Date.now();
    // 强制指定目录为"人设"
    const row = await svc.uploadSmallFromBuffer({
      userId: user.id,
      data: buf,
      originalName:
        typeof File !== 'undefined' && fileBlob instanceof File && fileBlob.name
          ? fileBlob.name
          : 'persona.md',
      mimeType: fileBlob.type || 'text/markdown',
      semanticType: null,
      folderPath: '人设',
      tags: null,
      waitUntil: waitUntilFromContext(c),
      env: c.env,
    });
    
    // 生成并绑定 proxy_uuid
    let proxyUuid = user.proxy_uuid;
    if (!proxyUuid) {
      proxyUuid = generateProxyUuid();
      await users.update(user.id, { proxy_uuid: proxyUuid });
    }

    recordMetric('file_upload', {
      ok: true,
      route: 'proxy_direct',
      bytes: buf.byteLength,
      duration_ms: Date.now() - t0,
      user_id: user.id,
    });

    return c.json({
      file: fileRowToApi(row),
      proxy_uuid: proxyUuid,
    }, 201);
  } catch (e) {
    if (e instanceof FileSizeError || e instanceof ValidationError) {
      throw e;
    }
    throw e;
  }
});
