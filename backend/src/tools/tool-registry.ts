import type { NewToolInvocationRow } from '../db';
import { logger } from '../lib/logger';
import type { ToolCall, ToolDefinition } from '../llm/types';
import { recordMetric } from '../observability/metrics';

const ERROR_MESSAGE_MAX = 8000;

export type ToolContext = {
  userId: string;
  sessionId?: string;
};

export type ToolResultMeta = {
  tool: string;
  items?: unknown[];
  raw_ref?: string;
  /** Serper 软限/错误等，经 SSE `tool_result_meta` 给前端展示（PRD 2.6.2） */
  notice?: string;
  quota_warning?: string;
  degraded?: boolean;
};

export type ToolExecuteResult = {
  /** 写入 LLM 的 tool 消息正文（建议为 JSON 字符串，供 Gemini functionResponse 解析） */
  output: string;
  toolResultMeta?: ToolResultMeta;
};

export interface Tool {
  name: string;
  description: string;
  parametersSchema: Record<string, unknown>;
  execute(argsJson: string, ctx: ToolContext): Promise<ToolExecuteResult>;
}

export type ExecutedToolCall = {
  name: string;
  geminiToolCallId: string;
  output: string;
  toolResultMeta?: ToolResultMeta;
};

export type ToolRegistryOptions = {
  persistInvocation?: (row: NewToolInvocationRow) => Promise<void>;
};

/**
 * 根据 tool 消息 JSON 推断是否业务失败（与 `recordMetric('tool_execute')` 的 ok 一致）。
 */
export function inferToolInvocationOutcome(output: string): {
  ok: boolean;
  error_message: string | null;
} {
  const trimmed = output.trim();
  if (!trimmed) {
    return { ok: true, error_message: null };
  }
  try {
    const v = JSON.parse(trimmed) as Record<string, unknown>;
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      return { ok: true, error_message: null };
    }
    if (v.ok === false) {
      const err = v.error ?? v.message;
      const msg =
        typeof err === 'string' ? err : err != null ? JSON.stringify(err) : 'ok_false';
      return { ok: false, error_message: clampErrorMessage(msg) };
    }
    if (v.ok === true) {
      return { ok: true, error_message: null };
    }
    if (typeof v.error === 'string') {
      return { ok: false, error_message: clampErrorMessage(v.error) };
    }
  } catch {
    // 非 JSON：视为成功（兼容极少数纯文本 tool 输出）
  }
  return { ok: true, error_message: null };
}

function clampErrorMessage(s: string): string {
  if (s.length <= ERROR_MESSAGE_MAX) return s;
  return `${s.slice(0, ERROR_MESSAGE_MAX)}…(truncated)`;
}

/**
 * 与技术方案 §9.2 一致；具体工具在任务 2.3 等模块中 register。
 */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private readonly persistInvocation?: (row: NewToolInvocationRow) => Promise<void>;

  constructor(opts?: ToolRegistryOptions) {
    this.persistInvocation = opts?.persistInvocation;
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parametersSchema,
    }));
  }

  private async persistSafe(row: NewToolInvocationRow): Promise<void> {
    if (!this.persistInvocation) return;
    try {
      await this.persistInvocation(row);
    } catch (e) {
      logger.error('tool_invocation_persist_failed', {
        tool_name: row.tool_name,
        user_id: row.user_id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async executeAll(calls: ToolCall[], ctx: ToolContext): Promise<ExecutedToolCall[]> {
    return Promise.all(
      calls.map(async (call) => {
        const t0 = Date.now();
        const tool = this.tools.get(call.name);
        if (!tool) {
          const dur = Date.now() - t0;
          recordMetric('tool_execute', {
            tool: call.name,
            ok: false,
            reason: 'unknown_tool',
            duration_ms: dur,
            user_id: ctx.userId,
          });
          const output = JSON.stringify({ error: `unknown_tool: ${call.name}` });
          await this.persistSafe({
            user_id: ctx.userId,
            session_id: ctx.sessionId ?? null,
            tool_name: call.name,
            ok: false,
            error_message: `unknown_tool: ${call.name}`,
            duration_ms: dur,
          });
          return {
            name: call.name,
            geminiToolCallId: toolCallKey(call.name, call.id),
            output,
          };
        }
        try {
          const r = await tool.execute(call.arguments, ctx);
          const dur = Date.now() - t0;
          const outcome = inferToolInvocationOutcome(r.output);
          recordMetric('tool_execute', {
            tool: call.name,
            ok: outcome.ok,
            duration_ms: dur,
            user_id: ctx.userId,
            ...(outcome.ok
              ? {}
              : {
                  reason: 'tool_output',
                  error: outcome.error_message ?? 'failed',
                }),
          });
          await this.persistSafe({
            user_id: ctx.userId,
            session_id: ctx.sessionId ?? null,
            tool_name: call.name,
            ok: outcome.ok,
            error_message: outcome.error_message,
            duration_ms: dur,
          });
          return {
            name: call.name,
            geminiToolCallId: toolCallKey(call.name, call.id),
            output: r.output,
            toolResultMeta: r.toolResultMeta,
          };
        } catch (e) {
          const dur = Date.now() - t0;
          const errMsg = e instanceof Error ? e.message : String(e);
          recordMetric('tool_execute', {
            tool: call.name,
            ok: false,
            reason: 'exception',
            duration_ms: dur,
            user_id: ctx.userId,
            error: errMsg,
          });
          const output = JSON.stringify({ error: errMsg });
          await this.persistSafe({
            user_id: ctx.userId,
            session_id: ctx.sessionId ?? null,
            tool_name: call.name,
            ok: false,
            error_message: clampErrorMessage(errMsg),
            duration_ms: dur,
          });
          return {
            name: call.name,
            geminiToolCallId: toolCallKey(call.name, call.id),
            output,
          };
        }
      }),
    );
  }
}

/** Gemini functionResponse.name 与 tool 角色消息约定：name::callId */
export function toolCallKey(toolName: string, callId: string): string {
  return `${toolName}::${callId}`;
}
