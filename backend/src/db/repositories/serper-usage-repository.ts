import { and, eq, sql } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import type { AppDb } from '../types';
import { serperUsage } from '../schema';

export type SerperUsageRow = InferSelectModel<typeof serperUsage>;

/** UTC 日期 YYYY-MM-DD，与用量表 day 字段一致 */
export function utcDayString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export class SerperUsageRepository {
  constructor(private readonly db: AppDb) {}

  async getCount(userId: string, day: string): Promise<number> {
    const rows = await this.db
      .select({ call_count: serperUsage.call_count })
      .from(serperUsage)
      .where(and(eq(serperUsage.user_id, userId), eq(serperUsage.day, day)))
      .limit(1);
    return rows[0]?.call_count ?? 0;
  }

  /** 删除该用户全部 Serper 日计数行（无 FK，须在删用户前单独清理） */
  async deleteAllForUser(userId: string): Promise<void> {
    await this.db.delete(serperUsage).where(eq(serperUsage.user_id, userId));
  }

  /** Serper 成功返回后调用：插入或 call_count + 1 */
  async incrementSuccess(userId: string, day: string): Promise<void> {
    await this.db
      .insert(serperUsage)
      .values({ user_id: userId, day, call_count: 1 })
      .onConflictDoUpdate({
        target: [serperUsage.user_id, serperUsage.day],
        set: { call_count: sql`${serperUsage.call_count} + 1` },
      });
  }
}
