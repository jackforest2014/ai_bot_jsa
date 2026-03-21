import { FileRepository, getDb } from '../db';
import { logger } from '../lib/logger';

/**
 * 异步文件处理入口（任务 2.9 / 技术方案 §14）。
 * 任务 3.3 将在此接入解析与向量化；当前占位：成功则 `processed=1`，异常则 `-1`。
 */
export function scheduleFileIngest(
  waitUntil: ((p: Promise<unknown>) => void) | undefined,
  d1: D1Database,
  fileId: string,
  userId: string,
): void {
  const job = runFileIngestJob(d1, fileId, userId);
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

async function runFileIngestJob(d1: D1Database, fileId: string, userId: string): Promise<void> {
  const db = getDb(d1);
  const repo = new FileRepository(db);
  try {
    await repo.updateForUser(fileId, userId, { processed: 1 });
  } catch (e) {
    logger.warn('file ingest job failed', {
      fileId,
      userId,
      error: e instanceof Error ? e.message : String(e),
    });
    try {
      await repo.updateForUser(fileId, userId, { processed: -1 });
    } catch {
      /* ignore */
    }
  }
}
