import { and, desc, eq, isNull } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { AppDb } from '../types';
import { tasks } from '../schema';

export type TaskRow = InferSelectModel<typeof tasks>;
export type NewTaskRow = InferInsertModel<typeof tasks>;

export class TaskRepository {
  constructor(private readonly db: AppDb) {}

  async listByUserId(
    userId: string,
    filters?: { status?: string; projectId?: string | null },
  ): Promise<TaskRow[]> {
    const conditions = [eq(tasks.user_id, userId)];
    if (filters?.status) conditions.push(eq(tasks.status, filters.status));
    if (filters?.projectId === null) {
      conditions.push(isNull(tasks.project_id));
    } else if (filters?.projectId !== undefined) {
      conditions.push(eq(tasks.project_id, filters.projectId));
    }
    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
    return this.db.select().from(tasks).where(whereClause).orderBy(desc(tasks.updated_at));
  }

  async findByIdForUser(id: string, userId: string): Promise<TaskRow | undefined> {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.user_id, userId)))
      .limit(1);
    return rows[0];
  }

  async insert(row: NewTaskRow): Promise<void> {
    await this.db.insert(tasks).values(row);
  }

  async updateForUser(
    id: string,
    userId: string,
    patch: Partial<
      Pick<
        TaskRow,
        'title' | 'description' | 'detail_json' | 'status' | 'project_id' | 'updated_at'
      >
    >,
  ): Promise<boolean> {
    const existing = await this.findByIdForUser(id, userId);
    if (!existing) return false;
    await this.db
      .update(tasks)
      .set(patch)
      .where(and(eq(tasks.id, id), eq(tasks.user_id, userId)));
    return true;
  }

  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const existing = await this.findByIdForUser(id, userId);
    if (!existing) return false;
    await this.db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.user_id, userId)));
    return true;
  }
}
