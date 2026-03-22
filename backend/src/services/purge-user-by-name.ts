import { eq } from 'drizzle-orm';
import { createFileStorage } from '../storage';
import { createQdrantStore } from '../vector';
import type { Env } from '../env';
import { logger } from '../lib/logger';
import { FileRepository, getDb, SerperUsageRepository, UserRepository, users } from '../db';

export type PurgeUserByNameResult =
  | { ok: false; code: 'USER_NOT_FOUND'; message: string }
  | {
      ok: true;
      user_id: string;
      user_name: string;
      files_removed_from_db: number;
      r2_delete_errors: number;
      qdrant_purged: boolean | null;
      qdrant_error?: string;
    };

/**
 * 按 **显示名 `users.name`（唯一）** 删除用户及其关联数据：
 * - D1：`file_uploads` 行 + R2 对象（尽力删除）、`serper_usage`，**最后 `DELETE users` 该行**（余表靠 ON DELETE CASCADE）
 * - Qdrant：payload.user_id 匹配的点
 *
 * 由 `POST /api/admin/users/purge-by-name` 暴露；**当前 Demo 无鉴权**，勿对公网开放。
 */
export async function purgeAllDataForUserByName(env: Env, rawName: string): Promise<PurgeUserByNameResult> {
  const name = rawName.trim();
  if (!name) {
    return { ok: false, code: 'USER_NOT_FOUND', message: 'name 不能为空' };
  }

  const db = getDb(env.task_assistant_db);
  const userRepo = new UserRepository(db);
  const user = await userRepo.findByName(name);
  if (!user) {
    return { ok: false, code: 'USER_NOT_FOUND', message: '不存在该姓名的用户' };
  }

  const userId = user.id;
  logger.warn('admin purge user by name', { user_id: userId, user_name: user.name });

  const fileRepo = new FileRepository(db);
  const files = await fileRepo.listByUserId(userId);
  const storage = createFileStorage(env);
  let files_removed_from_db = 0;
  let r2_delete_errors = 0;

  for (const f of files) {
    try {
      await storage.delete(f.r2_key);
    } catch (e) {
      r2_delete_errors += 1;
      logger.warn('purge user: r2 delete failed', {
        user_id: userId,
        file_id: f.id,
        r2_key: f.r2_key,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    await fileRepo.deleteForUser(f.id, userId);
    files_removed_from_db += 1;
  }

  let qdrant_purged: boolean | null = null;
  let qdrant_error: string | undefined;
  const qstore = createQdrantStore(env);
  if (qstore) {
    try {
      await qstore.deleteByFilter({ user_id: userId });
      qdrant_purged = true;
    } catch (e) {
      qdrant_purged = false;
      qdrant_error = e instanceof Error ? e.message : String(e);
      logger.error('purge user: qdrant delete failed', { user_id: userId, error: qdrant_error });
    }
  }

  const serperRepo = new SerperUsageRepository(db);
  await serperRepo.deleteAllForUser(userId);

  await db.delete(users).where(eq(users.id, userId));

  return {
    ok: true,
    user_id: userId,
    user_name: user.name,
    files_removed_from_db,
    r2_delete_errors,
    qdrant_purged,
    ...(qdrant_error ? { qdrant_error } : {}),
  };
}
