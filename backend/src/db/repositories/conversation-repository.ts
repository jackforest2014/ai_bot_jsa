import { desc, eq } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { AppDb } from '../types';
import { conversations } from '../schema';

export type ConversationRow = InferSelectModel<typeof conversations>;
export type NewConversationRow = InferInsertModel<typeof conversations>;

export class ConversationRepository {
  constructor(private readonly db: AppDb) {}

  /** 最近 N 条（按时间正序），用于短期上下文 */
  async listRecentForUser(userId: string, limit: number): Promise<ConversationRow[]> {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.user_id, userId))
      .orderBy(desc(conversations.created_at))
      .limit(limit);
    return rows.reverse();
  }

  async insert(row: NewConversationRow): Promise<void> {
    await this.db.insert(conversations).values(row);
  }
}
