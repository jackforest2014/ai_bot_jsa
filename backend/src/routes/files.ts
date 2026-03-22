import { Hono } from 'hono';
import type { Context } from 'hono';
import { FileRepository, UserRepository, getDb } from '../db';
import type { Env } from '../env';
import { requireUserFromBearer } from '../auth/resolve-user';
import { createFileStorage, hasR2Binding } from '../storage';
import { FileService, fileRowToApi, getMultipartPresignFromEnv } from '../files/file-service';
import { FileSizeError, ValidationError } from '../errors/app-errors';
import { recordMetric } from '../observability/metrics';
import { zodIssues } from '../lib/zod-errors';
import {
  completeMultipartBodySchema,
  fileRenameBodySchema,
  fileSemanticTypeBodySchema,
  fileTagsBodySchema,
  initiateMultipartBodySchema,
} from '../validation/api-schemas';

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

export const fileRoutes = new Hono<{ Bindings: Env }>();

fileRoutes.post('/upload', async (c) => {
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
  const semanticRaw = form.get('semantic_type');
  const semantic_type =
    typeof semanticRaw === 'string' && semanticRaw.trim() ? semanticRaw.trim() : null;
  const folderRaw = form.get('folder_path');
  const folder_path = typeof folderRaw === 'string' ? folderRaw : '';
  let tags: string[] | null = null;
  const tagsRaw = form.get('tags');
  if (typeof tagsRaw === 'string' && tagsRaw.trim()) {
    try {
      const p = JSON.parse(tagsRaw) as unknown;
      tags = Array.isArray(p) ? p.map((x) => String(x)) : null;
    } catch {
      return c.json({ error: 'tags 须为 JSON 数组字符串', code: 'VALIDATION_ERROR' }, 400);
    }
  }

  try {
    const t0 = Date.now();
    const row = await svc.uploadSmallFromBuffer({
      userId: user.id,
      data: buf,
      originalName:
        typeof File !== 'undefined' && fileBlob instanceof File && fileBlob.name
          ? fileBlob.name
          : 'upload',
      mimeType: fileBlob.type || 'application/octet-stream',
      semanticType: semantic_type,
      folderPath: folder_path,
      tags,
      waitUntil: waitUntilFromContext(c),
      env: c.env,
    });
    recordMetric('file_upload', {
      ok: true,
      route: 'direct',
      bytes: buf.byteLength,
      duration_ms: Date.now() - t0,
      user_id: user.id,
    });
    return c.json(fileRowToApi(row), 201);
  } catch (e) {
    if (e instanceof FileSizeError || e instanceof ValidationError) {
      throw e;
    }
    throw e;
  }
});

fileRoutes.post('/initiate-multipart', async (c) => {
  const r2 = requireR2(c);
  if (r2) return r2;

  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const svc = makeFileService(c.env);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求体须为 JSON', code: 'VALIDATION_ERROR' }, 400);
  }
  const parsed = initiateMultipartBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: '请求参数无效', code: 'VALIDATION_ERROR', issues: zodIssues(parsed.error) },
      400,
    );
  }
  const o = parsed.data;
  const original_name = o.original_name?.trim() || o.filename;
  const tags = o.tags.length ? o.tags : null;

  try {
    const t0 = Date.now();
    const out = await svc.initiateMultipart({
      userId: user.id,
      originalName: original_name,
      mimeType: o.mime_type,
      size: o.size,
      semanticType: o.semantic_type,
      folderPath: o.folder_path,
      tags,
    });
    recordMetric('file_multipart_initiate', {
      ok: true,
      bytes: o.size,
      duration_ms: Date.now() - t0,
      user_id: user.id,
    });
    return c.json({
      upload_id: out.upload_id,
      r2_key: out.r2_key,
      part_urls: out.part_urls,
    });
  } catch (e) {
    if (e instanceof FileSizeError || e instanceof ValidationError) {
      throw e;
    }
    throw e;
  }
});

fileRoutes.post('/complete-multipart', async (c) => {
  const r2 = requireR2(c);
  if (r2) return r2;

  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const svc = makeFileService(c.env);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求体须为 JSON', code: 'VALIDATION_ERROR' }, 400);
  }
  const parsedComplete = completeMultipartBodySchema.safeParse(body);
  if (!parsedComplete.success) {
    return c.json(
      { error: '请求参数无效', code: 'VALIDATION_ERROR', issues: zodIssues(parsedComplete.error) },
      400,
    );
  }
  const d = parsedComplete.data;
  const input = {
    upload_id: d.upload_id,
    r2_key: d.r2_key,
    parts: d.parts,
    original_name: d.original_name,
    mime_type: d.mime_type,
    size: d.size,
    semantic_type: d.semantic_type,
    folder_path: d.folder_path,
    tags: d.tags,
  };

  try {
    const t0 = Date.now();
    const row = await svc.completeMultipart(user.id, input, {
      waitUntil: waitUntilFromContext(c),
      env: c.env,
    });
    recordMetric('file_upload', {
      ok: true,
      route: 'multipart_complete',
      bytes: input.size,
      duration_ms: Date.now() - t0,
      user_id: user.id,
    });
    return c.json({ id: row.id, message: '上传完成' });
  } catch (e) {
    if (e instanceof FileSizeError || e instanceof ValidationError) {
      throw e;
    }
    throw e;
  }
});

fileRoutes.delete('/:id', async (c) => {
  const r2 = requireR2(c);
  if (r2) return r2;

  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const svc = makeFileService(c.env);
  const id = c.req.param('id')?.trim();
  if (!id) {
    return c.json({ error: '无效 id', code: 'VALIDATION_ERROR' }, 400);
  }

  const ok = await svc.deleteFile(user.id, id);
  if (!ok) {
    return c.json({ error: '文件不存在', code: 'NOT_FOUND' }, 404);
  }
  return c.json({ message: '删除成功' });
});

fileRoutes.put('/:id/rename', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const svc = makeFileService(c.env);
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
  const parsedRename = fileRenameBodySchema.safeParse(body);
  if (!parsedRename.success) {
    return c.json(
      { error: '请求参数无效', code: 'VALIDATION_ERROR', issues: zodIssues(parsedRename.error) },
      400,
    );
  }

  try {
    const row = await svc.renameFile(user.id, id, parsedRename.data.new_name);
    if (!row) {
      return c.json({ error: '文件不存在', code: 'NOT_FOUND' }, 404);
    }
    return c.json(fileRowToApi(row));
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw e;
  }
});

fileRoutes.put('/:id/semantic-type', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const svc = makeFileService(c.env);
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
  const parsedSt = fileSemanticTypeBodySchema.safeParse(body);
  if (!parsedSt.success) {
    return c.json(
      { error: '请求参数无效', code: 'VALIDATION_ERROR', issues: zodIssues(parsedSt.error) },
      400,
    );
  }
  const semantic = parsedSt.data.semantic_type;

  const row = await svc.updateSemanticType(user.id, id, semantic);
  if (!row) {
    return c.json({ error: '文件不存在', code: 'NOT_FOUND' }, 404);
  }
  return c.json(fileRowToApi(row));
});

fileRoutes.put('/:id/tags', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const svc = makeFileService(c.env);
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
  const parsedTags = fileTagsBodySchema.safeParse(body);
  if (!parsedTags.success) {
    return c.json(
      { error: '请求参数无效', code: 'VALIDATION_ERROR', issues: zodIssues(parsedTags.error) },
      400,
    );
  }

  const row = await svc.updateTags(user.id, id, parsedTags.data.tags);
  if (!row) {
    return c.json({ error: '文件不存在', code: 'NOT_FOUND' }, 404);
  }
  return c.json(fileRowToApi(row));
});

fileRoutes.get('/:id/download', async (c) => {
  const r2 = requireR2(c);
  if (r2) return r2;

  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const svc = makeFileService(c.env);
  const id = c.req.param('id')?.trim();
  if (!id) {
    return c.json({ error: '无效 id', code: 'VALIDATION_ERROR' }, 400);
  }

  try {
    const url = await svc.getDownloadUrl(user.id, id);
    if (!url) {
      return c.json({ error: '文件不存在', code: 'NOT_FOUND' }, 404);
    }
    return c.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('预签名')) {
      return c.json({ error: msg, code: 'PRESIGN_NOT_CONFIGURED' }, 503);
    }
    throw e;
  }
});

/** 处理失败后重试异步管线：`processed` 置 0 并再次调度（技术方案 §14） */
fileRoutes.post('/:id/retry-process', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const svc = makeFileService(c.env);
  const id = c.req.param('id')?.trim();
  if (!id) {
    return c.json({ error: '无效 id', code: 'VALIDATION_ERROR' }, 400);
  }

  const row = await svc.resetProcessingAndSchedule(user.id, id, {
    waitUntil: waitUntilFromContext(c),
    env: c.env,
  });
  if (!row) {
    return c.json({ error: '文件不存在', code: 'NOT_FOUND' }, 404);
  }
  return c.json(fileRowToApi(row));
});

/** 单文件元数据（含异步处理状态 `processed`：0 处理中、1 成功、-1 失败） */
fileRoutes.get('/:id', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const files = new FileRepository(db);
  const id = c.req.param('id')?.trim();
  if (!id) {
    return c.json({ error: '无效 id', code: 'VALIDATION_ERROR' }, 400);
  }
  const row = await files.findByIdForUser(id, user.id);
  if (!row) {
    return c.json({ error: '文件不存在', code: 'NOT_FOUND' }, 404);
  }
  return c.json(fileRowToApi(row));
});
