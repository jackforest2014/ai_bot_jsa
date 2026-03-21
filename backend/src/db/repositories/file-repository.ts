import { and, desc, eq, like } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { AppDb } from '../types';
import { fileUploads } from '../schema';

export type FileUploadRow = InferSelectModel<typeof fileUploads>;
export type NewFileUploadRow = InferInsertModel<typeof fileUploads>;

export type ListFilesFilter = {
  /**
   * 未传：不按路径过滤。
   * `''`：仅根目录（`folder_path` 为空串）。
   * 非空：前缀匹配 `LIKE folder%`（技术方案 GET ?folder=）。
   */
  folder?: string;
  semanticType?: string;
};

export class FileRepository {
  constructor(private readonly db: AppDb) {}

  async listByUserId(userId: string, filter?: ListFilesFilter): Promise<FileUploadRow[]> {
    const conditions = [eq(fileUploads.user_id, userId)];
    if (filter?.semanticType) {
      conditions.push(eq(fileUploads.semantic_type, filter.semanticType));
    }
    if (filter?.folder !== undefined) {
      if (filter.folder === '') {
        conditions.push(eq(fileUploads.folder_path, ''));
      } else {
        conditions.push(like(fileUploads.folder_path, `${filter.folder}%`));
      }
    }
    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
    return this.db
      .select()
      .from(fileUploads)
      .where(whereClause)
      .orderBy(desc(fileUploads.created_at));
  }

  async findByIdForUser(id: string, userId: string): Promise<FileUploadRow | undefined> {
    const rows = await this.db
      .select()
      .from(fileUploads)
      .where(and(eq(fileUploads.id, id), eq(fileUploads.user_id, userId)))
      .limit(1);
    return rows[0];
  }

  async insert(row: NewFileUploadRow): Promise<void> {
    await this.db.insert(fileUploads).values(row);
  }

  async updateForUser(
    id: string,
    userId: string,
    patch: Partial<
      Pick<
        FileUploadRow,
        | 'filename'
        | 'original_name'
        | 'semantic_type'
        | 'folder_path'
        | 'tags'
        | 'processed'
        | 'r2_key'
      >
    >,
  ): Promise<boolean> {
    const existing = await this.findByIdForUser(id, userId);
    if (!existing) return false;
    await this.db
      .update(fileUploads)
      .set(patch)
      .where(and(eq(fileUploads.id, id), eq(fileUploads.user_id, userId)));
    return true;
  }

  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const existing = await this.findByIdForUser(id, userId);
    if (!existing) return false;
    await this.db
      .delete(fileUploads)
      .where(and(eq(fileUploads.id, id), eq(fileUploads.user_id, userId)));
    return true;
  }
}
