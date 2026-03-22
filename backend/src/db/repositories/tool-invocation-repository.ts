import { and, count, eq, gte, lte } from 'drizzle-orm';
import type { AppDb } from '../types';
import { toolInvocations } from '../schema';

export type NewToolInvocationRow = {
  user_id: string;
  session_id: string | null;
  tool_name: string;
  ok: boolean;
  error_message: string | null;
  duration_ms: number;
};

export class ToolInvocationRepository {
  constructor(private readonly db: AppDb) {}

  async insert(row: NewToolInvocationRow): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db.insert(toolInvocations).values({
      id: crypto.randomUUID(),
      user_id: row.user_id,
      session_id: row.session_id,
      tool_name: row.tool_name,
      ok: row.ok ? 1 : 0,
      error_message: row.error_message,
      duration_ms: row.duration_ms,
      created_at: now,
    });
  }

  /**
   * 统计 [fromSec, toSec] 闭区间内调用次数（Unix 秒）。
   * @param toolName 若传入则只统计该工具
   */
  async countInRange(fromSec: number, toSec: number, toolName?: string): Promise<number> {
    const conds = [
      gte(toolInvocations.created_at, fromSec),
      lte(toolInvocations.created_at, toSec),
    ];
    if (toolName?.trim()) {
      conds.push(eq(toolInvocations.tool_name, toolName.trim()));
    }
    const rows = await this.db
      .select({ c: count() })
      .from(toolInvocations)
      .where(and(...conds));
    return Number(rows[0]?.c ?? 0);
  }
}
