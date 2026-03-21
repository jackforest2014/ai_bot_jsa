import { LLMError } from '../errors/app-errors';
import {
  splitSystemAndRest,
  toGeminiContents,
  toGeminiToolDeclarations,
} from './gemini-messages';
import type { LLMMessage, LLMProvider, LLMResponse, TokenUsage, ToolCall, ToolDefinition } from './types';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export type GeminiProviderOptions = {
  apiKey: string;
  /** `generateContent` 模型 id，如 `gemini-2.0-flash-lite` */
  chatModel: string;
  /** `embedContent` 模型 id，如 `text-embedding-004` */
  embeddingModel: string;
  /** 与 Qdrant collection 一致时校验 `embed` 输出长度 */
  expectedEmbeddingDimensions?: number;
  fetchImpl?: typeof fetch;
};

export class GeminiProvider implements LLMProvider {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly opts: GeminiProviderOptions) {
    this.fetchFn = opts.fetchImpl ?? fetch;
  }

  async chat(
    messages: LLMMessage[],
    tools?: ToolDefinition[],
  ): Promise<LLMResponse & { usage: TokenUsage }> {
    const body = this.buildGenerateBody(messages, tools);
    const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(this.opts.chatModel)}:generateContent?key=${encodeURIComponent(this.opts.apiKey)}`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    if (!res.ok) {
      throw new LLMError(`Gemini generateContent failed: ${res.status}`, {
        details: { body: raw.slice(0, 2000) },
      });
    }
    let data: unknown;
    try {
      data = JSON.parse(raw) as unknown;
    } catch (e) {
      throw new LLMError('Gemini response is not JSON', { cause: e });
    }
    this.throwIfBlocked(data);
    const { content, tool_calls } = parseCandidateContent(data);
    const usage = parseUsageMetadata(data);
    return { content, tool_calls, usage };
  }

  streamChat(messages: LLMMessage[], tools?: ToolDefinition[]): ReadableStream<Uint8Array> {
    const body = this.buildGenerateBody(messages, tools);
    const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(this.opts.chatModel)}:streamGenerateContent?key=${encodeURIComponent(this.opts.apiKey)}&alt=sse`;
    const fetchFn = this.fetchFn;
    const encoder = new TextEncoder();

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const res = await fetchFn(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const t = await res.text();
            controller.error(
              new LLMError(`Gemini streamGenerateContent failed: ${res.status}`, {
                details: { body: t.slice(0, 2000) },
              }),
            );
            return;
          }
          if (!res.body) {
            controller.error(new LLMError('Gemini stream: empty body'));
            return;
          }
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += dec.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const payload = trimmed.slice(5).trim();
              if (payload === '[DONE]') continue;
              try {
                const json = JSON.parse(payload) as unknown;
                const chunk = extractStreamText(json);
                if (chunk) {
                  controller.enqueue(encoder.encode(chunk));
                }
              } catch {
                // 忽略无法解析的行
              }
            }
          }
          controller.close();
        } catch (e) {
          controller.error(e instanceof Error ? e : new Error(String(e)));
        }
      },
    });
  }

  async embed(text: string): Promise<number[]> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new LLMError('embed: empty text');
    }
    const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(this.opts.embeddingModel)}:embedContent?key=${encodeURIComponent(this.opts.apiKey)}`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: trimmed }] },
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      throw new LLMError(`Gemini embedContent failed: ${res.status}`, {
        details: { body: raw.slice(0, 2000) },
      });
    }
    let data: unknown;
    try {
      data = JSON.parse(raw) as unknown;
    } catch (e) {
      throw new LLMError('Gemini embed response is not JSON', { cause: e });
    }
    const values = (data as { embedding?: { values?: number[] } })?.embedding?.values;
    if (!Array.isArray(values) || !values.length) {
      throw new LLMError('Gemini embed: missing embedding.values');
    }
    const expected = this.opts.expectedEmbeddingDimensions;
    if (expected !== undefined && values.length !== expected) {
      throw new LLMError(
        `Embedding dimension mismatch: expected ${expected}, got ${values.length}（请核对 EMBEDDING_MODEL 与 Qdrant collection）`,
        { details: { expected, actual: values.length } },
      );
    }
    return values;
  }

  private buildGenerateBody(messages: LLMMessage[], tools?: ToolDefinition[]): Record<string, unknown> {
    const { systemText, rest } = splitSystemAndRest(messages);
    const contents = toGeminiContents(rest);
    if (!contents.length) {
      throw new LLMError('Gemini: no user/assistant/tool messages after system prompt');
    }
    const decls = toGeminiToolDeclarations(tools);
    const body: Record<string, unknown> = {
      contents,
    };
    if (systemText) {
      body.systemInstruction = { parts: [{ text: systemText }] };
    }
    if (decls?.length) {
      body.tools = [{ functionDeclarations: decls }];
      body.toolConfig = {
        functionCallingConfig: { mode: 'AUTO' },
      };
    }
    return body;
  }

  private throwIfBlocked(data: unknown): void {
    const block = (data as { promptFeedback?: { blockReason?: string } })?.promptFeedback?.blockReason;
    if (block) {
      throw new LLMError(`Gemini blocked prompt: ${block}`, { details: { blockReason: block } });
    }
  }
}

function parseUsageMetadata(data: unknown): TokenUsage {
  const u = (data as { usageMetadata?: Record<string, number> })?.usageMetadata;
  const prompt = u?.promptTokenCount ?? 0;
  const completion = u?.candidatesTokenCount ?? 0;
  const total = u?.totalTokenCount ?? prompt + completion;
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
  };
}

function parseCandidateContent(data: unknown): Pick<LLMResponse, 'content' | 'tool_calls'> {
  const parts = (data as { candidates?: { content?: { parts?: unknown[] } }[] })?.candidates?.[0]
    ?.content?.parts;
  if (!Array.isArray(parts)) {
    return { content: '', tool_calls: undefined };
  }
  const textChunks: string[] = [];
  const tool_calls: ToolCall[] = [];
  for (const p of parts) {
    if (!p || typeof p !== 'object') continue;
    const part = p as { text?: string; functionCall?: { name?: string; args?: Record<string, unknown> } };
    if (typeof part.text === 'string' && part.text) {
      textChunks.push(part.text);
    }
    if (part.functionCall?.name) {
      const args = part.functionCall.args ?? {};
      tool_calls.push({
        id: crypto.randomUUID(),
        name: part.functionCall.name,
        arguments: JSON.stringify(args),
      });
    }
  }
  return {
    content: textChunks.join(''),
    tool_calls: tool_calls.length ? tool_calls : undefined,
  };
}

function extractStreamText(chunk: unknown): string {
  const parts = (chunk as { candidates?: { content?: { parts?: unknown[] } }[] })?.candidates?.[0]
    ?.content?.parts;
  if (!Array.isArray(parts)) return '';
  const out: string[] = [];
  for (const p of parts) {
    if (p && typeof p === 'object' && typeof (p as { text?: string }).text === 'string') {
      out.push((p as { text: string }).text);
    }
  }
  return out.join('');
}

/** Worker / wrangler 环境 */
export type GeminiEnv = {
  GEMINI_API_KEY?: string;
  LLM_MODEL?: string;
  EMBEDDING_MODEL?: string;
  EMBEDDING_DIMENSIONS?: string;
};

export function createGeminiProvider(env: GeminiEnv, fetchImpl?: typeof fetch): GeminiProvider | null {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const chatModel = env.LLM_MODEL?.trim() || 'gemini-2.0-flash-lite';
  const embeddingModel = env.EMBEDDING_MODEL?.trim() || 'text-embedding-004';
  let expectedEmbeddingDimensions: number | undefined;
  const dimRaw = env.EMBEDDING_DIMENSIONS?.trim();
  if (dimRaw) {
    const n = Number.parseInt(dimRaw, 10);
    if (Number.isFinite(n) && n > 0) {
      expectedEmbeddingDimensions = n;
    }
  }
  return new GeminiProvider({
    apiKey,
    chatModel,
    embeddingModel,
    expectedEmbeddingDimensions,
    fetchImpl,
  });
}

export function hasGeminiConfig(env: GeminiEnv): boolean {
  return !!env.GEMINI_API_KEY?.trim();
}
