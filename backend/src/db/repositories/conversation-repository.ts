import { and, asc, desc, eq, gt, max, or } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { AppDb } from '../types';
import { conversations } from '../schema';

export type ConversationRow = InferSelectModel<typeof conversations>;
export type NewConversationRow = InferInsertModel<typeof conversations>;

export class ConversationRepository {
  constructor(private readonly db: AppDb) {}

  /**
   * 会话内最近 N 条消息（按时间正序），供短期上下文（技术方案 §8.2.1）。
   */
  async listRecentForSession(sessionId: string, limit: number): Promise<ConversationRow[]> {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.session_id, sessionId))
      .orderBy(desc(conversations.created_at))
      .limit(limit);
    return rows.reverse();
  }

  async insert(row: NewConversationRow): Promise<void> {
    await this.db.insert(conversations).values(row);
  }

  /** 本会话内最大 `created_at`（秒），用于新消息严格晚于历史，避免与 UUID 次序冲突 */
  async maxCreatedAtForSession(sessionId: string): Promise<number | null> {
    const rows = await this.db
      .select({ v: max(conversations.created_at) })
      .from(conversations)
      .where(eq(conversations.session_id, sessionId));
    const raw = rows[0]?.v;
    if (raw == null) return null;
    return typeof raw === 'number' ? raw : Number(raw);
  }

  /** 本会话是否已有任意 assistant 消息（首轮助手判定 §8.1） */
  async hasAssistantInSession(sessionId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.session_id, sessionId), eq(conversations.role, 'assistant')))
      .limit(1);
    return rows.length > 0;
  }

  /** 写入本轮前：本会话内 user / assistant 条数 */
  async countRolesInSession(sessionId: string): Promise<{ users: number; assistants: number }> {
    const all = await this.db
      .select({ role: conversations.role })
      .from(conversations)
      .where(eq(conversations.session_id, sessionId));
    let users = 0;
    let assistants = 0;
    for (const r of all) {
      if (r.role === 'user') users++;
      else if (r.role === 'assistant') assistants++;
    }
    return { users, assistants };
  }

  /**
   * 分页：created_at 升序。`cursor` 为上一页最后一条的 created_at，本页只含严格更大的行。
   */
  async listMessagesForSessionAsc(
    sessionId: string,
    opts: { cursor?: number; limit: number },
  ): Promise<ConversationRow[]> {
    const lim = Math.min(Math.max(opts.limit, 1), 100);
    const conditions = [eq(conversations.session_id, sessionId)];
    if (opts.cursor !== undefined) {
      conditions.push(gt(conversations.created_at, opts.cursor));
    }
    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
    return this.db
      .select()
      .from(conversations)
      .where(whereClause)
      .orderBy(asc(conversations.created_at), asc(conversations.id))
      .limit(lim);
  }

  /**
   * 分页：`next_cursor` 为本条批次最后一条消息的 `id`；下一页传同一 `cursor`。
   */
  async listMessagesPaginated(
    sessionId: string,
    cursorId: string | null,
    limit: number,
  ): Promise<ConversationRow[]> {
    const lim = Math.min(Math.max(limit, 1), 100);
    if (!cursorId) {
      return this.listMessagesForSessionAsc(sessionId, { limit: lim });
    }
    const ref = await this.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, cursorId), eq(conversations.session_id, sessionId)))
      .limit(1);
    const r0 = ref[0];
    if (!r0) {
      return [];
    }
    return this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.session_id, sessionId),
          or(
            gt(conversations.created_at, r0.created_at),
            and(eq(conversations.created_at, r0.created_at), gt(conversations.id, r0.id)),
          ),
        ),
      )
      .orderBy(asc(conversations.created_at), asc(conversations.id))
      .limit(lim);
  }
}
