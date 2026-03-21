import { asc, eq } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { AppDb } from '../types';
import { promptTemplates } from '../schema';

export type PromptTemplateRow = InferSelectModel<typeof promptTemplates>;
export type NewPromptTemplateRow = InferInsertModel<typeof promptTemplates>;

export class PromptRepository {
  constructor(private readonly db: AppDb) {}

  async findById(id: string): Promise<PromptTemplateRow | undefined> {
    const rows = await this.db
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.id, id))
      .limit(1);
    return rows[0];
  }

  async findByScenario(scenario: string): Promise<PromptTemplateRow | undefined> {
    const rows = await this.db
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.scenario, scenario))
      .limit(1);
    return rows[0];
  }

  async list(): Promise<PromptTemplateRow[]> {
    return this.db.select().from(promptTemplates).orderBy(asc(promptTemplates.name));
  }

  async insert(row: NewPromptTemplateRow): Promise<void> {
    await this.db.insert(promptTemplates).values(row);
  }

  async update(
    id: string,
    patch: Partial<Pick<PromptTemplateRow, 'name' | 'template_text' | 'scenario'>>,
  ): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) return false;
    await this.db.update(promptTemplates).set(patch).where(eq(promptTemplates.id, id));
    return true;
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) return false;
    await this.db.delete(promptTemplates).where(eq(promptTemplates.id, id));
    return true;
  }
}
