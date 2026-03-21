import type { SerperUsageRepository } from '../db';
import { utcDayString } from '../db';

export type SerperQuotaCheck =
  | { ok: true; count: number; limit: number; warning?: string }
  | { ok: false; count: number; limit: number; message: string };

/**
 * 按用户、UTC 自然日读取 `serper_usage`；软上限由环境变量配置（技术方案 §14 / PRD 2.6.2-6）。
 */
export class SerperQuotaService {
  private readonly warnThreshold: number;

  constructor(
    private readonly repo: SerperUsageRepository,
    /** 单日成功调用 Serper 的软上限（达到后拒绝新搜索） */
    private readonly dailySoftLimit: number,
  ) {
    this.warnThreshold = Math.max(0, Math.floor(dailySoftLimit * 0.8));
  }

  async check(userId: string): Promise<SerperQuotaCheck> {
    const day = utcDayString();
    const count = await this.repo.getCount(userId, day);
    const limit = this.dailySoftLimit;

    if (limit <= 0) {
      return { ok: true, count, limit };
    }

    if (count >= limit) {
      return {
        ok: false,
        count,
        limit,
        message: `今日联网搜索次数已达上限（${limit} 次）。如需继续，可明日再试或联系管理员调整配额。`,
      };
    }

    let warning: string | undefined;
    if (count >= this.warnThreshold && this.warnThreshold < limit) {
      warning = `今日已使用 ${count}/${limit} 次搜索，接近上限；请避免无效重复检索。`;
    }

    return { ok: true, count, limit, warning };
  }

  async recordSuccessfulSearch(userId: string): Promise<void> {
    await this.repo.incrementSuccess(userId, utcDayString());
  }
}

export function parseSerperDailySoftLimit(raw: string | undefined, fallback = 80): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, n);
}
