import { and, desc, eq, or } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { clampSessionTitle } from '../../lib/session-title';
import type { AppDb } from '../types';
import { chatSessions } from '../schema';

export type ChatSessionRow = InferSelectModel<typeof chatSessions>;
export type NewChatSessionRow = InferInsertModel<typeof chatSessions>;

export class SessionRepository {
  constructor(private readonly db: AppDb) {}

  async listByUserId(userId: string): Promise<ChatSessionRow[]> {
    return this.db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.user_id, userId))
      .orderBy(desc(chatSessions.updated_at));
  }

  async listByProxyForUserId(proxyForUserId: string): Promise<ChatSessionRow[]> {
    return this.db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.proxy_for_user_id, proxyForUserId))
      .orderBy(desc(chatSessions.updated_at));
  }

  async findByIdForUser(sessionId: string, userId: string): Promise<ChatSessionRow | undefined> {
    const rows = await this.db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.user_id, userId)))
      .limit(1);
    return rows[0];
  }

  async findByIdForUserOrProxyOwner(sessionId: string, userId: string): Promise<ChatSessionRow | undefined> {
    const rows = await this.db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.id, sessionId),
          or(eq(chatSessions.user_id, userId), eq(chatSessions.proxy_for_user_id, userId))
        )
      )
      .limit(1);
    return rows[0];
  }

  async insert(row: NewChatSessionRow): Promise<void> {
    await this.db.insert(chatSessions).values(row);
  }

  async updateTitleForUser(
    sessionId: string,
    userId: string,
    title: string,
    titleSource: 'user' | 'auto',
  ): Promise<boolean> {
    const existing = await this.findByIdForUser(sessionId, userId);
    if (!existing) return false;
    await this.db
      .update(chatSessions)
      .set({
        title: title.trim(),
        title_source: titleSource,
        updated_at: Math.floor(Date.now() / 1000),
      })
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.user_id, userId)));
    return true;
  }

  /** 仅当仍为 `title_source=auto` 时更新标题（避免覆盖用户 PATCH 重命名） */
  async updateTitleIfStillAuto(sessionId: string, userId: string, title: string): Promise<boolean> {
    const existing = await this.findByIdForUser(sessionId, userId);
    if (!existing || existing.title_source !== 'auto') return false;
    await this.db
      .update(chatSessions)
      .set({
        title: clampSessionTitle(title),
        updated_at: Math.floor(Date.now() / 1000),
      })
      .where(
        and(
          eq(chatSessions.id, sessionId),
          eq(chatSessions.user_id, userId),
          eq(chatSessions.title_source, 'auto'),
        ),
      );
    return true;
  }

  async touchUpdatedAt(sessionId: string, userId: string): Promise<void> {
    await this.db
      .update(chatSessions)
      .set({ updated_at: Math.floor(Date.now() / 1000) })
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.user_id, userId)));
  }

  async deleteForUser(sessionId: string, userId: string): Promise<boolean> {
    const existing = await this.findByIdForUser(sessionId, userId);
    if (!existing) return false;
    await this.db
      .delete(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.user_id, userId)));
    return true;
  }

  /** PATCH /api/sessions/:id 重命名：固定 `title_source=user` */
  async updateTitle(sessionId: string, userId: string, title: string): Promise<boolean> {
    return this.updateTitleForUser(sessionId, userId, title, 'user');
  }

  async delete(sessionId: string, userId: string): Promise<boolean> {
    return this.deleteForUser(sessionId, userId);
  }
}
