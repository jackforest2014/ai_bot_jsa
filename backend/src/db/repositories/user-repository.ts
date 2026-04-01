import { eq } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { AppDb } from '../types';
import { users } from '../schema';

export type UserRow = InferSelectModel<typeof users>;
export type NewUserRow = InferInsertModel<typeof users>;

export class UserRepository {
  constructor(private readonly db: AppDb) {}

  async findById(id: string): Promise<UserRow | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0];
  }

  async findByEmail(email: string): Promise<UserRow | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0];
  }

  async findByProxyUuid(proxyUuid: string): Promise<UserRow | undefined> {
    const trimmed = proxyUuid.trim();
    if (!trimmed) return undefined;
    const rows = await this.db.select().from(users).where(eq(users.proxy_uuid, trimmed)).limit(1);
    return rows[0];
  }

  async findByName(name: string): Promise<UserRow | undefined> {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    const rows = await this.db.select().from(users).where(eq(users.name, trimmed)).limit(1);
    return rows[0];
  }

  /** 名称是否已被其他用户占用 */
  async isNameTakenByOther(name: string, excludeUserId: string): Promise<boolean> {
    const row = await this.findByName(name);
    return !!row && row.id !== excludeUserId;
  }

  async insert(row: NewUserRow): Promise<void> {
    await this.db.insert(users).values(row);
  }

  async update(
    id: string,
    patch: Partial<Pick<UserRow, 'name' | 'email' | 'ai_nickname' | 'preferences_json' | 'proxy_uuid'>>,
  ): Promise<void> {
    await this.db.update(users).set(patch).where(eq(users.id, id));
  }
}
