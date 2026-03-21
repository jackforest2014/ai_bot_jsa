import { Hono } from 'hono';
import type { Context } from 'hono';
import { FileRepository, UserRepository, getDb } from '../db';
import type { Env } from '../env';
import { requireUserFromBearer } from '../auth/resolve-user';
import { createFileStorage, hasR2Binding } from '../storage';
import {
  FileService,
  fileRowToApi,
  getMultipartPresignFromEnv,
  type CompleteMultipartInput,
} from '../files/file-service';
import { FileSizeError, ValidationError } from '../errors/app-errors';

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

fileRoutes.get('/', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users);
  const svc = makeFileService(c.env);

  const folderQ = c.req.query('folder');
  const folder = folderQ === undefined ? undefined : folderQ;
  const type = c.req.query('type')?.trim();

  const rows = await svc.listForUser(user.id, {
    ...(folder !== undefined ? { folder } : {}),
    ...(type ? { semanticType: type } : {}),
  });
  return c.json(rows.map((r) => fileRowToApi(r)));
});

fileRoutes.post('/upload', async (c) => {
  const r2 = requireR2(c);
  if (r2) return r2;

  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users);
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
      d1: c.env.task_assistant_db,
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
  const user = await requireUserFromBearer(c.req.header('Authorization'), users);
  const svc = makeFileService(c.env);

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
  const filename = typeof o.filename === 'string' ? o.filename.trim() : '';
  const original_name = typeof o.original_name === 'string' ? o.original_name.trim() : filename;
  const mime_type = typeof o.mime_type === 'string' ? o.mime_type.trim() : 'application/octet-stream';
  const size = typeof o.size === 'number' && Number.isFinite(o.size) ? o.size : NaN;
  if (!filename || !original_name || !Number.isFinite(size)) {
    return c.json({ error: 'filename、original_name、size 无效', code: 'VALIDATION_ERROR' }, 400);
  }

  const semantic_type =
    typeof o.semantic_type === 'string' && o.semantic_type.trim() ? o.semantic_type.trim() : null;
  const folder_path = typeof o.folder_path === 'string' ? o.folder_path : '';
  let tags: string[] | null = null;
  if (Array.isArray(o.tags)) {
    tags = o.tags.map((x) => String(x).trim()).filter(Boolean);
  }

  try {
    const out = await svc.initiateMultipart({
      userId: user.id,
      originalName: original_name,
      mimeType: mime_type,
      size,
      semanticType: semantic_type,
      folderPath: folder_path,
      tags,
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
  const user = await requireUserFromBearer(c.req.header('Authorization'), users);
  const svc = makeFileService(c.env);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求体须为 JSON', code: 'VALIDATION_ERROR' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return c.json({ error: '无效请求体', code: 'VALIDATION_ERROR' }, 400);
  }
  const o = body as Record<string, unknown> & CompleteMultipartInput;

  const partsRaw = o.parts;
  if (!Array.isArray(partsRaw)) {
    return c.json({ error: 'parts 须为数组', code: 'VALIDATION_ERROR' }, 400);
  }
  const parts = partsRaw.map((p) => {
    if (!p || typeof p !== 'object') return null;
    const q = p as { etag?: unknown; partNumber?: unknown };
    const etag = typeof q.etag === 'string' ? q.etag : '';
    const partNumber = typeof q.partNumber === 'number' ? q.partNumber : NaN;
    if (!etag || !Number.isFinite(partNumber)) return null;
    return { etag, partNumber };
  });
  if (parts.some((x) => x === null)) {
    return c.json({ error: 'parts 项须含 etag、partNumber', code: 'VALIDATION_ERROR' }, 400);
  }

  const input: CompleteMultipartInput = {
    upload_id: typeof o.upload_id === 'string' ? o.upload_id : '',
    r2_key: typeof o.r2_key === 'string' ? o.r2_key : '',
    parts: parts as { etag: string; partNumber: number }[],
    original_name: typeof o.original_name === 'string' ? o.original_name : '',
    mime_type: typeof o.mime_type === 'string' ? o.mime_type : 'application/octet-stream',
    size: typeof o.size === 'number' ? o.size : NaN,
    semantic_type:
      typeof o.semantic_type === 'string' && o.semantic_type.trim() ? o.semantic_type.trim() : null,
    folder_path: typeof o.folder_path === 'string' ? o.folder_path : '',
    tags: Array.isArray(o.tags) ? o.tags.map((x) => String(x)) : null,
  };

  try {
    const row = await svc.completeMultipart(user.id, input, {
      waitUntil: waitUntilFromContext(c),
      d1: c.env.task_assistant_db,
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
  const user = await requireUserFromBearer(c.req.header('Authorization'), users);
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
  const user = await requireUserFromBearer(c.req.header('Authorization'), users);
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
  const newName =
    body && typeof body === 'object' && body !== null && 'new_name' in body
      ? (body as { new_name?: unknown }).new_name
      : undefined;
  if (typeof newName !== 'string' || !newName.trim()) {
    return c.json({ error: 'new_name 无效', code: 'VALIDATION_ERROR' }, 400);
  }

  try {
    const row = await svc.renameFile(user.id, id, newName);
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
  const user = await requireUserFromBearer(c.req.header('Authorization'), users);
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
  const st =
    body && typeof body === 'object' && body !== null && 'semantic_type' in body
      ? (body as { semantic_type?: unknown }).semantic_type
      : undefined;
  if (typeof st !== 'string' && st !== null) {
    return c.json({ error: 'semantic_type 无效', code: 'VALIDATION_ERROR' }, 400);
  }
  const semantic = typeof st === 'string' ? st.trim() : null;

  const row = await svc.updateSemanticType(user.id, id, semantic === '' ? null : semantic);
  if (!row) {
    return c.json({ error: '文件不存在', code: 'NOT_FOUND' }, 404);
  }
  return c.json(fileRowToApi(row));
});

fileRoutes.put('/:id/tags', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users);
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
  const tagsRaw =
    body && typeof body === 'object' && body !== null && 'tags' in body
      ? (body as { tags?: unknown }).tags
      : undefined;
  if (!Array.isArray(tagsRaw)) {
    return c.json({ error: 'tags 须为数组', code: 'VALIDATION_ERROR' }, 400);
  }
  const tags = tagsRaw.map((x) => String(x).trim()).filter(Boolean);

  const row = await svc.updateTags(user.id, id, tags);
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
  const user = await requireUserFromBearer(c.req.header('Authorization'), users);
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
  const user = await requireUserFromBearer(c.req.header('Authorization'), users);
  const svc = makeFileService(c.env);
  const id = c.req.param('id')?.trim();
  if (!id) {
    return c.json({ error: '无效 id', code: 'VALIDATION_ERROR' }, 400);
  }

  const row = await svc.resetProcessingAndSchedule(user.id, id, {
    waitUntil: waitUntilFromContext(c),
    d1: c.env.task_assistant_db,
  });
  if (!row) {
    return c.json({ error: '文件不存在', code: 'NOT_FOUND' }, 404);
  }
  return c.json(fileRowToApi(row));
});
