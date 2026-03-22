import { FileRepository, getDb } from '../db';
import { createFileStorage } from '../storage';
import { createMemoryService } from '../memory';
import { logger } from '../lib/logger';
import type { Env } from '../env';
import { extractForIngest, vectorizeFileIntoMemory } from './file-processor';

const MAX_PROCESS_ERROR_LEN = 500;

function clipProcessError(message: string): string {
  const t = message.trim();
  if (t.length <= MAX_PROCESS_ERROR_LEN) return t;
  return `${t.slice(0, MAX_PROCESS_ERROR_LEN - 1)}…`;
}

async function markIngestFailed(
  repo: FileRepository,
  fileId: string,
  userId: string,
  message: string,
): Promise<void> {
  try {
    await repo.updateForUser(fileId, userId, {
      processed: -1,
      process_error: clipProcessError(message),
    });
  } catch {
    /* ignore */
  }
}

async function markIngestSucceeded(repo: FileRepository, fileId: string, userId: string): Promise<void> {
  try {
    await repo.updateForUser(fileId, userId, { processed: 1, process_error: null });
  } catch {
    /* ignore */
  }
}

/**
 * 上传完成后异步：解析文本 → 分块嵌入 → Qdrant；失败 `processed=-1`（技术方案 §4.5 / 任务 4.3）。
 */
export function scheduleFileIngest(
  waitUntil: ((p: Promise<unknown>) => void) | undefined,
  env: Env,
  fileId: string,
  userId: string,
): void {
  const job = runFileIngestJob(env, fileId, userId);
  if (waitUntil) {
    try {
      waitUntil(job);
    } catch {
      void job;
    }
  } else {
    void job;
  }
}

async function runFileIngestJob(env: Env, fileId: string, userId: string): Promise<void> {
  const db = getDb(env.task_assistant_db);
  const repo = new FileRepository(db);
  const row = await repo.findByIdForUser(fileId, userId);
  if (!row) {
    return;
  }

  const storage = createFileStorage(env);
  let bytes: ArrayBuffer;
  try {
    bytes = await storage.download(row.r2_key);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    logger.warn('file ingest: download failed', {
      fileId,
      userId,
      error: detail,
    });
    await markIngestFailed(repo, fileId, userId, `无法从存储下载文件：${detail}`);
    return;
  }

  const extracted = extractForIngest(bytes, row, env);

  if (extracted.mode === 'error') {
    logger.warn('file ingest: extract failed', { fileId, message: extracted.message });
    await markIngestFailed(
      repo,
      fileId,
      userId,
      extracted.message.trim() ? `无法解析或提取正文：${extracted.message}` : '无法解析或提取正文',
    );
    return;
  }

  if (extracted.mode === 'metadata_only') {
    await markIngestSucceeded(repo, fileId, userId);
    return;
  }

  const memory = createMemoryService(env);
  if (!memory) {
    logger.warn('file ingest: memory service unavailable, skip vectors', { fileId });
    await markIngestSucceeded(repo, fileId, userId);
    return;
  }

  try {
    await vectorizeFileIntoMemory(memory, extracted.text, userId, row);
    await markIngestSucceeded(repo, fileId, userId);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    logger.warn('file ingest: vectorize failed', {
      fileId,
      error: detail,
    });
    await markIngestFailed(repo, fileId, userId, `写入向量索引失败：${detail}`);
  }
}
