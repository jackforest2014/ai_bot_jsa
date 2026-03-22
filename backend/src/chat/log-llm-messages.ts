import type { LLMMessage } from '../llm/types';
import { logger } from '../lib/logger';

/** 单条 message.content 写入日志的上限（避免单行 JSON 过大、Worker 日志截断） */
const MAX_CONTENT_CHARS_PER_LOG = 16_000;
const MAX_TOOL_ARGS_CHARS = 8_000;

/**
 * 将即将发给 LLM 的 messages 打到 debug 日志（`wrangler tail` 默认可见 level 时需将日志级别调到 debug）。
 * 每条一行 JSON，便于检索 `msg":"chat llm_message"`。
 */
export function logLlmMessagesSnapshot(
  label: string,
  messages: LLMMessage[],
  meta: Record<string, unknown>,
): void {
  let totalChars = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    const raw = m.content ?? '';
    totalChars += raw.length;
    const truncated =
      raw.length > MAX_CONTENT_CHARS_PER_LOG
        ? `${raw.slice(0, MAX_CONTENT_CHARS_PER_LOG)}…(log_truncated,total=${raw.length})`
        : raw;
    logger.debug('chat llm_message', {
      ...meta,
      label,
      index: i,
      role: m.role,
      contentChars: raw.length,
      content: truncated,
      tool_calls: m.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments:
          tc.arguments.length > MAX_TOOL_ARGS_CHARS
            ? `${tc.arguments.slice(0, MAX_TOOL_ARGS_CHARS)}…(truncated)`
            : tc.arguments,
      })),
      tool_call_id: m.tool_call_id,
    });
  }
  logger.debug('chat llm_messages_summary', {
    ...meta,
    label,
    messageCount: messages.length,
    totalContentChars: totalChars,
  });
}
