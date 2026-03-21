import { and, desc, eq } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { AppDb } from '../types';
import { projects } from '../schema';

export type ProjectRow = InferSelectModel<typeof projects>;
export type NewProjectRow = InferInsertModel<typeof projects>;

export class ProjectRepository {
  constructor(private readonly db: AppDb) {}

  async listByUserId(userId: string): Promise<ProjectRow[]> {
    return this.db
      .select()
      .from(projects)
      .where(eq(projects.user_id, userId))
      .orderBy(desc(projects.created_at));
  }

  async findByIdForUser(id: string, userId: string): Promise<ProjectRow | undefined> {
    const rows = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.user_id, userId)))
      .limit(1);
    return rows[0];
  }

  async insert(row: NewProjectRow): Promise<void> {
    await this.db.insert(projects).values(row);
  }

  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const existing = await this.findByIdForUser(id, userId);
    if (!existing) return false;
    await this.db.delete(projects).where(eq(projects.id, id));
    return true;
  }
}
