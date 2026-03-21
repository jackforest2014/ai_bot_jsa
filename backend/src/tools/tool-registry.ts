import type { ToolCall, ToolDefinition } from '../llm/types';

export type ToolContext = {
  userId: string;
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

/**
 * 与技术方案 §9.2 一致；具体工具在任务 2.3 等模块中 register。
 */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

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

  async executeAll(calls: ToolCall[], ctx: ToolContext): Promise<ExecutedToolCall[]> {
    return Promise.all(
      calls.map(async (call) => {
        const tool = this.tools.get(call.name);
        if (!tool) {
          return {
            name: call.name,
            geminiToolCallId: toolCallKey(call.name, call.id),
            output: JSON.stringify({ error: `unknown_tool: ${call.name}` }),
          };
        }
        try {
          const r = await tool.execute(call.arguments, ctx);
          return {
            name: call.name,
            geminiToolCallId: toolCallKey(call.name, call.id),
            output: r.output,
            toolResultMeta: r.toolResultMeta,
          };
        } catch (e) {
          return {
            name: call.name,
            geminiToolCallId: toolCallKey(call.name, call.id),
            output: JSON.stringify({
              error: e instanceof Error ? e.message : String(e),
            }),
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
