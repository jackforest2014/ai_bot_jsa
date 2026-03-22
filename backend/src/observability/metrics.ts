import { logger } from '../lib/logger';

/**
 * 单行 JSON 埋点，便于 `wrangler tail` 过滤 `analytics_metric`（阶段五 · 任务 5.3）。
 */
export function recordMetric(name: string, fields: Record<string, unknown> = {}): void {
  logger.info('analytics_metric', { metric: name, ...fields });
}
