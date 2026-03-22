import type { ConversationRow } from '../db';
import type { LLMMessage } from '../llm/types';

/** 近期在**原始行序列**末尾完整保留的条数（user/assistant 行），不受时间衰减 */
const RECENT_TAIL_ROW_COUNT = 8;

/**
 * 相对「本批历史中 created_at 最大的一条」的时间差（秒）超过该值：非尾部消息**截断**为短摘要。
 * 体现「离当前对话时刻较远」的软压缩。
 */
const SOFT_STALE_AGE_SEC = 600;

/**
 * 相对最近一条的时间差超过该值：非尾部消息替换为单行占位（硬折叠）。
 */
const HARD_STALE_AGE_SEC = 3600;

/** 软截断保留的字符数（约一屏内，UTF-16 码元） */
const SOFT_TRUNCATE_MAX_CHARS = 400;

/**
 * 当前轮为路线查询时，Stale 阈值乘以该系数，避免折叠仍可能相关的旧路线细节。
 */
const ROUTE_QUERY_STALE_RELAX_FACTOR = 4;

function effectiveStaleThresholds(currentIntention: string): {
  softSec: number;
  hardSec: number;
} {
  if (currentIntention === 'route_query') {
    const f = ROUTE_QUERY_STALE_RELAX_FACTOR;
    return { softSec: SOFT_STALE_AGE_SEC * f, hardSec: HARD_STALE_AGE_SEC * f };
  }
  return { softSec: SOFT_STALE_AGE_SEC, hardSec: HARD_STALE_AGE_SEC };
}

function hardFoldPlaceholder(ageSec: number): string {
  const mins = Math.max(1, Math.round(ageSec / 60));
  return `（较早会话内容已按时间折叠：本条距本批历史中最近一条消息约 ${mins} 分钟；与当前问题无关可忽略。）`;
}

function softTruncate(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}…（已按时间截断，后文省略）`;
}

/**
 * 将 DB 会话行转为发给 LLM 的 user/assistant 消息。
 *
 * **时间衰减**（相对本批 `rows` 中最大的 `created_at`，即会话内「最近一条已存消息」）：
 * - 落在末尾 `RECENT_TAIL_ROW_COUNT` 行内的消息：始终全文保留。
 * - 更早的行：与最近一条的时间差超过 **硬阈值** → 单行占位；超过 **软阈值** → 截断至 `SOFT_TRUNCATE_MAX_CHARS`；否则全文。
 *
 * 当前意图为 `route_query` 时，软/硬阈值按 `ROUTE_QUERY_STALE_RELAX_FACTOR` 放宽。
 */
export function conversationRowsToLlmMessages(
  rows: ConversationRow[],
  currentIntention: string,
): LLMMessage[] {
  const n = rows.length;
  const messages: LLMMessage[] = [];
  if (n === 0) return messages;

  let newestSec = rows[0]!.created_at;
  for (const r of rows) {
    if (r.created_at > newestSec) newestSec = r.created_at;
  }

  const { softSec, hardSec } = effectiveStaleThresholds(currentIntention);

  for (let i = 0; i < n; i++) {
    const row = rows[i]!;
    if (row.role !== 'user' && row.role !== 'assistant') continue;
    if (!row.content.trim()) continue;

    const inRecentTail = i >= n - RECENT_TAIL_ROW_COUNT;
    const ageSec = Math.max(0, newestSec - row.created_at);

    let content = row.content;
    if (!inRecentTail) {
      if (ageSec >= hardSec) {
        content = hardFoldPlaceholder(ageSec);
      } else if (ageSec >= softSec) {
        content = softTruncate(row.content, SOFT_TRUNCATE_MAX_CHARS);
      }
    }

    messages.push({ role: row.role as 'user' | 'assistant', content });
  }

  return messages;
}
