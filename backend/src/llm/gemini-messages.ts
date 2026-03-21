import type { LLMMessage, ToolDefinition } from './types';

/** Gemini REST `systemInstruction` / `contents` / `tools` 片段 */
export type GeminiContent = {
  role: 'user' | 'model';
  parts: Record<string, unknown>[];
};

export function splitSystemAndRest(messages: LLMMessage[]): {
  systemText: string;
  rest: LLMMessage[];
} {
  const systemParts: string[] = [];
  const rest: LLMMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
    } else {
      rest.push(m);
    }
  }
  return {
    systemText: systemParts.join('\n\n').trim(),
    rest,
  };
}

export function toGeminiContents(rest: LLMMessage[]): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const m of rest) {
    if (m.role === 'user') {
      out.push({
        role: 'user',
        parts: [{ text: m.content }],
      });
      continue;
    }
    if (m.role === 'assistant') {
      const parts: Record<string, unknown>[] = [];
      if (m.content.trim()) {
        parts.push({ text: m.content });
      }
      if (m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.arguments || '{}') as Record<string, unknown>;
          } catch {
            args = { _raw: tc.arguments };
          }
          parts.push({
            functionCall: { name: tc.name, args },
          });
        }
      }
      out.push({ role: 'model', parts: parts.length ? parts : [{ text: '' }] });
      continue;
    }
    if (m.role === 'tool') {
      /** `tool_call_id` 建议为函数名，或 `函数名::uuid`（与上层 ReAct 约定一致） */
      const name = parseFunctionNameForToolMessage(m.tool_call_id);
      let response: Record<string, unknown>;
      try {
        response = JSON.parse(m.content) as Record<string, unknown>;
      } catch {
        response = { result: m.content };
      }
      out.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name,
              response,
            },
          },
        ],
      });
    }
  }
  return out;
}

function parseFunctionNameForToolMessage(toolCallId?: string): string {
  if (!toolCallId?.trim()) return 'tool';
  const sep = '::';
  if (toolCallId.includes(sep)) {
    return toolCallId.split(sep)[0]!.trim() || 'tool';
  }
  return toolCallId.trim();
}

export function toGeminiToolDeclarations(
  tools: ToolDefinition[] | undefined,
): Record<string, unknown>[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: normalizeParametersSchema(t.parameters),
  }));
}

function normalizeParametersSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const t = schema.type;
  if (t === 'object' && typeof schema.properties === 'object') {
    return schema as Record<string, unknown>;
  }
  return {
    type: 'object',
    properties: {},
    ...schema,
  };
}
