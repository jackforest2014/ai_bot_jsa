import type { FileRepository, FileUploadRow } from '../db';
import type { FileStorage } from '../storage/file-storage';
import { presignR2UploadPartUrl } from '../storage/r2-presign';
import { FileSizeError, ValidationError } from '../errors/app-errors';
import { scheduleFileIngest } from './file-process';

/** PRD / 技术方案 §14：单文件 ≤ 64MB */
export const MAX_FILE_BYTES = 64 * 1024 * 1024;
/** 技术方案 §5.4.2：小文件直传 Worker 上限 */
export const DIRECT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const MULTIPART_PART_BYTES = 5 * 1024 * 1024;
export const DOWNLOAD_URL_TTL_SEC = 3600;
export const MULTIPART_PRESIGN_TTL_SEC = 3600;

export type WorkspaceToolAction =
  | 'list'
  | 'delete'
  | 'rename'
  | 'set_semantic_type'
  | 'set_tags';

export type R2MultipartPresignConfig = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type CompleteMultipartInput = {
  upload_id: string;
  r2_key: string;
  parts: { etag: string; partNumber: number }[];
  original_name: string;
  mime_type: string;
  size: number;
  semantic_type?: string | null;
  folder_path?: string;
  tags?: string[] | null;
};

/**
 * 文件业务：D1 + R2；`manage_workspace_files` 与 REST 共用。
 */
export class FileService {
  constructor(
    private readonly files: FileRepository,
    private readonly storage: FileStorage,
    private readonly multipartPresign: R2MultipartPresignConfig | null,
  ) {}

  listForUser(
    userId: string,
    filter?: { folder?: string; semanticType?: string },
  ): Promise<FileUploadRow[]> {
    return this.files.listByUserId(userId, {
      ...(filter?.folder !== undefined ? { folder: filter.folder } : {}),
      ...(filter?.semanticType ? { semanticType: filter.semanticType } : {}),
    });
  }

  async deleteFile(userId: string, fileId: string): Promise<boolean> {
    const row = await this.files.findByIdForUser(fileId, userId);
    if (!row) return false;
    await this.storage.delete(row.r2_key);
    return this.files.deleteForUser(fileId, userId);
  }

  async renameFile(userId: string, fileId: string, newName: string): Promise<FileUploadRow | undefined> {
    const trimmed = newName.trim();
    if (!trimmed) {
      throw new ValidationError('new_name 不能为空');
    }
    const safe = safeStorageFileName(trimmed);
    const ok = await this.files.updateForUser(fileId, userId, {
      original_name: trimmed,
      filename: safe,
    });
    if (!ok) return undefined;
    return this.files.findByIdForUser(fileId, userId);
  }

  async updateSemanticType(
    userId: string,
    fileId: string,
    semanticType: string | null,
  ): Promise<FileUploadRow | undefined> {
    const ok = await this.files.updateForUser(fileId, userId, {
      semantic_type: semanticType?.trim() ? semanticType.trim() : null,
    });
    if (!ok) return undefined;
    return this.files.findByIdForUser(fileId, userId);
  }

  async updateTags(userId: string, fileId: string, tags: string[]): Promise<FileUploadRow | undefined> {
    const ok = await this.files.updateForUser(fileId, userId, {
      tags: JSON.stringify(tags.map((t) => t.trim()).filter(Boolean)),
    });
    if (!ok) return undefined;
    return this.files.findByIdForUser(fileId, userId);
  }

  async getDownloadUrl(userId: string, fileId: string): Promise<string | undefined> {
    const row = await this.files.findByIdForUser(fileId, userId);
    if (!row) return undefined;
    return this.storage.getSignedUrl(row.r2_key, DOWNLOAD_URL_TTL_SEC);
  }

  assertSizeWithinLimit(size: number): void {
    if (size > MAX_FILE_BYTES) {
      throw new FileSizeError('文件不能超过 64 MB', MAX_FILE_BYTES, size);
    }
    if (size <= 0) {
      throw new ValidationError('无效的 size');
    }
  }

  /**
   * 小文件：multipart/form 直传 Worker → R2 → D1；`processed` 先 0 再异步任务置 1。
   */
  async uploadSmallFromBuffer(opts: {
    userId: string;
    data: ArrayBuffer;
    originalName: string;
    mimeType: string;
    semanticType?: string | null;
    folderPath?: string;
    tags?: string[] | null;
    waitUntil?: (p: Promise<unknown>) => void;
    d1: D1Database;
  }): Promise<FileUploadRow> {
    const size = opts.data.byteLength;
    this.assertSizeWithinLimit(size);
    if (size > DIRECT_UPLOAD_MAX_BYTES) {
      throw new ValidationError(`请使用分片上传（大于 ${DIRECT_UPLOAD_MAX_BYTES} 字节的文件）`);
    }

    const id = crypto.randomUUID();
    const safe = safeStorageFileName(opts.originalName);
    const r2Key = buildR2ObjectKey(opts.userId, id, safe);
    const now = Math.floor(Date.now() / 1000);

    await this.storage.upload(r2Key, opts.data, {
      httpMetadata: { contentType: opts.mimeType || 'application/octet-stream' },
    });

    await this.files.insert({
      id,
      user_id: opts.userId,
      filename: safe,
      original_name: opts.originalName.trim() || safe,
      mime_type: opts.mimeType || 'application/octet-stream',
      size,
      r2_key: r2Key,
      semantic_type: opts.semanticType?.trim() ? opts.semanticType.trim() : null,
      folder_path: (opts.folderPath ?? '').trim(),
      tags: encodeTags(opts.tags),
      processed: 0,
      created_at: now,
    });

    const row = await this.files.findByIdForUser(id, opts.userId);
    if (!row) {
      throw new Error('file row missing after insert');
    }
    scheduleFileIngest(opts.waitUntil, opts.d1, id, opts.userId);
    return row;
  }

  async initiateMultipart(opts: {
    userId: string;
    originalName: string;
    mimeType: string;
    size: number;
    semanticType?: string | null;
    folderPath?: string;
    tags?: string[] | null;
  }): Promise<{ upload_id: string; r2_key: string; part_urls: string[] }> {
    if (!this.multipartPresign) {
      throw new ValidationError('未配置 R2 分片预签名（需 R2_ACCOUNT_ID、R2_BUCKET_NAME、S3 API 密钥）');
    }
    this.assertSizeWithinLimit(opts.size);
    if (opts.size <= DIRECT_UPLOAD_MAX_BYTES) {
      throw new ValidationError('文件较小，请使用 POST /api/files/upload');
    }

    const id = crypto.randomUUID();
    const safe = safeStorageFileName(opts.originalName);
    const r2Key = buildR2ObjectKey(opts.userId, id, safe);
    const { uploadId } = await this.storage.initiateMultipartUpload(r2Key);

    const partCount = Math.max(1, Math.ceil(opts.size / MULTIPART_PART_BYTES));
    if (partCount > 10_000) {
      throw new ValidationError('分片数量过多');
    }

    const p = this.multipartPresign;
    const part_urls: string[] = [];
    for (let partNumber = 1; partNumber <= partCount; partNumber++) {
      part_urls.push(
        await presignR2UploadPartUrl({
          accountId: p.accountId,
          bucket: p.bucket,
          key: r2Key,
          accessKeyId: p.accessKeyId,
          secretAccessKey: p.secretAccessKey,
          expiresInSeconds: MULTIPART_PRESIGN_TTL_SEC,
          uploadId: uploadId,
          partNumber,
        }),
      );
    }

    return { upload_id: uploadId, r2_key: r2Key, part_urls };
  }

  async completeMultipart(
    userId: string,
    input: CompleteMultipartInput,
    opts: { waitUntil?: (p: Promise<unknown>) => void; d1: D1Database },
  ): Promise<FileUploadRow> {
    assertUserR2Key(userId, input.r2_key);
    this.assertSizeWithinLimit(input.size);

    if (!input.upload_id?.trim() || !input.parts?.length) {
      throw new ValidationError('upload_id 与 parts 无效');
    }
    const originalName = input.original_name?.trim();
    if (!originalName) {
      throw new ValidationError('original_name 不能为空');
    }

    await this.storage.completeMultipartUpload(input.r2_key, input.upload_id, input.parts);

    const id = parseFileIdFromR2Key(input.r2_key);
    if (!id) {
      throw new ValidationError('无效的 r2_key');
    }

    const safe = safeStorageFileName(originalName);
    const now = Math.floor(Date.now() / 1000);

    await this.files.insert({
      id,
      user_id: userId,
      filename: safe,
      original_name: originalName,
      mime_type: input.mime_type?.trim() || 'application/octet-stream',
      size: input.size,
      r2_key: input.r2_key,
      semantic_type: input.semantic_type?.trim() ? input.semantic_type.trim() : null,
      folder_path: (input.folder_path ?? '').trim(),
      tags: encodeTags(input.tags ?? null),
      processed: 0,
      created_at: now,
    });

    const row = await this.files.findByIdForUser(id, userId);
    if (!row) {
      throw new Error('file row missing after complete');
    }
    scheduleFileIngest(opts.waitUntil, opts.d1, id, userId);
    return row;
  }

  async resetProcessingAndSchedule(
    userId: string,
    fileId: string,
    opts: { waitUntil?: (p: Promise<unknown>) => void; d1: D1Database },
  ): Promise<FileUploadRow | undefined> {
    const row = await this.files.findByIdForUser(fileId, userId);
    if (!row) return undefined;
    await this.files.updateForUser(fileId, userId, { processed: 0 });
    scheduleFileIngest(opts.waitUntil, opts.d1, fileId, userId);
    return this.files.findByIdForUser(fileId, userId);
  }

  async handleToolAction(
    userId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const action = args.action;
    if (typeof action !== 'string' || !action) {
      return { ok: false, error: 'action_required' };
    }
    if (!isWorkspaceAction(action)) {
      return { ok: false, error: 'invalid_action', action };
    }

    switch (action) {
      case 'list':
        return await this.actionList(userId, args);
      case 'delete':
        return await this.actionDelete(userId, args);
      case 'rename':
        return await this.actionRename(userId, args);
      case 'set_semantic_type':
        return await this.actionSetSemanticType(userId, args);
      case 'set_tags':
        return await this.actionSetTags(userId, args);
      default:
        return { ok: false, error: 'invalid_action' };
    }
  }

  private async actionList(
    userId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let folder: string | undefined;
    if (Object.prototype.hasOwnProperty.call(args, 'folder_path')) {
      const fp = args.folder_path;
      if (fp === null || fp === '') {
        folder = '';
      } else if (typeof fp === 'string') {
        folder = fp.trim() === '' ? '' : fp.trim();
      }
    }
    const semanticType =
      typeof args.semantic_type_filter === 'string' && args.semantic_type_filter.trim()
        ? args.semantic_type_filter.trim()
        : undefined;

    const rows = await this.files.listByUserId(userId, {
      ...(folder !== undefined ? { folder } : {}),
      ...(semanticType ? { semanticType } : {}),
    });
    return {
      ok: true,
      files: rows.map((r) => summarizeFileRow(r)),
    };
  }

  private async actionDelete(userId: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const fileId = readNonEmptyString(args, 'file_id');
    if (!fileId) return { ok: false, error: 'file_id_required' };
    const ok = await this.deleteFile(userId, fileId);
    return ok ? { ok: true, deleted: true, file_id: fileId } : { ok: false, error: 'not_found' };
  }

  private async actionRename(userId: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const fileId = readNonEmptyString(args, 'file_id');
    const newName = readNonEmptyString(args, 'new_name');
    if (!fileId) return { ok: false, error: 'file_id_required' };
    if (!newName) return { ok: false, error: 'new_name_required' };
    const row = await this.renameFile(userId, fileId, newName);
    if (!row) return { ok: false, error: 'not_found' };
    return { ok: true, file: summarizeFileRow(row) };
  }

  private async actionSetSemanticType(
    userId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const fileId = readNonEmptyString(args, 'file_id');
    if (!fileId) return { ok: false, error: 'file_id_required' };
    const st =
      typeof args.semantic_type === 'string'
        ? args.semantic_type.trim()
        : args.semantic_type === null
          ? ''
          : undefined;
    if (st === undefined) return { ok: false, error: 'semantic_type_required' };
    const row = await this.updateSemanticType(userId, fileId, st === '' ? null : st);
    if (!row) return { ok: false, error: 'not_found' };
    return { ok: true, file: summarizeFileRow(row) };
  }

  private async actionSetTags(userId: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const fileId = readNonEmptyString(args, 'file_id');
    if (!fileId) return { ok: false, error: 'file_id_required' };
    if (!Object.prototype.hasOwnProperty.call(args, 'tags')) {
      return { ok: false, error: 'tags_required' };
    }
    const tagsRaw = args.tags;
    if (!Array.isArray(tagsRaw)) {
      return { ok: false, error: 'tags_must_be_array' };
    }
    const tags = tagsRaw.map((t) => String(t).trim()).filter(Boolean);
    const row = await this.updateTags(userId, fileId, tags);
    if (!row) return { ok: false, error: 'not_found' };
    return { ok: true, file: summarizeFileRow(row) };
  }
}

function isWorkspaceAction(s: string): s is WorkspaceToolAction {
  return (
    s === 'list' ||
    s === 'delete' ||
    s === 'rename' ||
    s === 'set_semantic_type' ||
    s === 'set_tags'
  );
}

function readNonEmptyString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t || undefined;
}

export function safeStorageFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'file';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180);
  return cleaned || 'file';
}

export function buildR2ObjectKey(userId: string, fileId: string, safeName: string): string {
  return `u/${userId}/${fileId}/${safeName}`;
}

function assertUserR2Key(userId: string, key: string): void {
  if (!key.startsWith(`u/${userId}/`)) {
    throw new ValidationError('r2_key 与当前用户不匹配');
  }
}

/** r2 key: u/{userId}/{uuid}/... */
function parseFileIdFromR2Key(key: string): string | undefined {
  const parts = key.split('/').filter(Boolean);
  if (parts.length < 3 || parts[0] !== 'u') return undefined;
  return parts[2];
}

function encodeTags(tags: string[] | null | undefined): string | null {
  if (!tags?.length) return null;
  const cleaned = tags.map((t) => t.trim()).filter(Boolean);
  return cleaned.length ? JSON.stringify(cleaned) : null;
}

export function summarizeFileRow(row: FileUploadRow): Record<string, unknown> {
  let tags: string[] | null = null;
  if (row.tags?.trim()) {
    try {
      const p = JSON.parse(row.tags) as unknown;
      tags = Array.isArray(p) ? p.map((x) => String(x)) : null;
    } catch {
      tags = null;
    }
  }
  return {
    id: row.id,
    filename: row.filename,
    original_name: row.original_name,
    semantic_type: row.semantic_type ?? null,
    folder_path: row.folder_path,
    tags,
    size: row.size,
    mime_type: row.mime_type,
    processed: row.processed,
    created_at: row.created_at,
  };
}

export function fileRowToApi(row: FileUploadRow): Record<string, unknown> {
  return summarizeFileRow(row);
}

export function getMultipartPresignFromEnv(env: {
  R2_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
  R2_S3_ACCESS_KEY_ID?: string;
  R2_S3_SECRET_ACCESS_KEY?: string;
}): R2MultipartPresignConfig | null {
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const bucket = env.R2_BUCKET_NAME?.trim();
  const accessKeyId = env.R2_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_S3_SECRET_ACCESS_KEY?.trim();
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }
  return { accountId, bucket, accessKeyId, secretAccessKey };
}
