import { LLMError } from '../errors/app-errors';
import { workerFetch } from '../lib/worker-fetch';
import { splitSystemAndRest } from './gemini-messages';
import type {
  ChatStreamOptions,
  LLMMessage,
  LLMProvider,
  LLMResponse,
  TokenUsage,
  ToolCall,
  ToolDefinition,
} from './types';

const QWEN_CHAT_TIMEOUT_MS = 90_000;
const QWEN_EMBED_TIMEOUT_MS = 60_000;
/** 流式整段墙钟：长历史 + 多轮工具时 180s 易触发 AbortError，与前端长连接对齐略放宽 */
const QWEN_STREAM_WALL_MS = 300_000;

/** 中国大陆默认；国际站见 README / DASHSCOPE_BASE_URL */
export const DEFAULT_DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

function deadlineSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}

function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}

/** 去掉用户误写在 .dev.vars 里的 `Bearer ` 前缀，避免 `Bearer Bearer sk-...` 导致 401 */
function normalizeDashScopeApiKey(raw: string): string {
  let k = raw.trim();
  if (k.toLowerCase().startsWith('bearer ')) {
    k = k.slice(7).trim();
  }
  return k;
}

function dashScopeFailDetails(
  op: string,
  status: number,
  baseUrl: string,
  rawBody: string,
): { message: string; details: { body: string; host: string } } {
  let host = baseUrl;
  try {
    host = new URL(baseUrl).host;
  } catch {
    /* keep baseUrl string */
  }
  let message = `DashScope ${op} 失败: ${status}（host: ${host}）`;
  if (status === 401) {
    message +=
      '。401：密钥被拒绝。请核对 DASHSCOPE_API_KEY；并确认密钥地域与 DASHSCOPE_BASE_URL 一致（国内 key → dashscope.aliyuncs.com；国际/Singapore key → dashscope-intl.aliyuncs.com）。修改 .dev.vars 后需重启 wrangler dev。';
  }
  return { message, details: { body: rawBody.slice(0, 2000), host } };
}

type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

function toOpenAITools(tools: ToolDefinition[] | undefined): unknown[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: normalizeParameters(t.parameters),
    },
  }));
}

function normalizeParameters(schema: Record<string, unknown>): Record<string, unknown> {
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

function toOpenAIMessages(messages: LLMMessage[]): OpenAIChatMessage[] {
  const { systemText, rest } = splitSystemAndRest(messages);
  const out: OpenAIChatMessage[] = [];
  if (systemText) {
    out.push({ role: 'system', content: systemText });
  }
  for (const m of rest) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
      continue;
    }
    if (m.role === 'assistant') {
      if (m.tool_calls?.length) {
        out.push({
          role: 'assistant',
          content: m.content.trim() ? m.content : null,
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.arguments || '{}',
            },
          })),
        });
      } else {
        out.push({ role: 'assistant', content: m.content });
      }
      continue;
    }
    if (m.role === 'tool') {
      out.push({
        role: 'tool',
        content: m.content,
        tool_call_id: m.tool_call_id?.trim() || 'tool',
      });
    }
  }
  return out;
}

function parseUsage(data: unknown): TokenUsage {
  const u = (data as { usage?: Record<string, number> })?.usage;
  const prompt = u?.prompt_tokens ?? u?.promptTokens ?? 0;
  const completion = u?.completion_tokens ?? u?.completionTokens ?? 0;
  const total = u?.total_tokens ?? u?.totalTokens ?? prompt + completion;
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
  };
}

function parseAssistantMessage(data: unknown): Pick<LLMResponse, 'content' | 'tool_calls'> {
  const choice = (data as { choices?: { message?: unknown }[] })?.choices?.[0];
  const msg = choice?.message as
    | {
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: string };
        }>;
      }
    | undefined;
  if (!msg) {
    return { content: '', tool_calls: undefined };
  }
  const content = typeof msg.content === 'string' ? msg.content : '';
  const raw = msg.tool_calls;
  if (!Array.isArray(raw) || !raw.length) {
    return { content, tool_calls: undefined };
  }
  const tool_calls: ToolCall[] = [];
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue;
    const name = t.function?.name;
    if (!name) continue;
    tool_calls.push({
      id: t.id?.trim() || crypto.randomUUID(),
      name,
      arguments: t.function?.arguments ?? '{}',
    });
  }
  return {
    content,
    tool_calls: tool_calls.length ? tool_calls : undefined,
  };
}

export type QwenProviderOptions = {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
  expectedEmbeddingDimensions?: number;
  fetchImpl?: typeof fetch;
};

export class QwenProvider implements LLMProvider {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly opts: QwenProviderOptions) {
    this.fetchFn = opts.fetchImpl ?? workerFetch;
  }

  private authHeaders(): Headers {
    const h = new Headers({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.opts.apiKey}`,
    });
    return h;
  }

  async chat(
    messages: LLMMessage[],
    tools?: ToolDefinition[],
  ): Promise<LLMResponse & { usage: TokenUsage }> {
    const url = `${this.opts.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const openaiTools = toOpenAITools(tools);
    const body: Record<string, unknown> = {
      model: this.opts.chatModel,
      messages: toOpenAIMessages(messages),
    };
    if (openaiTools?.length) {
      body.tools = openaiTools;
      body.tool_choice = 'auto';
    }
    const signal = deadlineSignal(QWEN_CHAT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
    } catch (e) {
      if (isAbortError(e)) {
        throw new LLMError('DashScope chat 请求超时', {
          code: 'LLM_TIMEOUT',
          statusCode: 504,
          cause: e,
        });
      }
      throw e;
    }
    const raw = await res.text();
    if (!res.ok) {
      const { message, details } = dashScopeFailDetails('chat', res.status, this.opts.baseUrl, raw);
      throw new LLMError(message, { details });
    }
    let data: unknown;
    try {
      data = JSON.parse(raw) as unknown;
    } catch (e) {
      throw new LLMError('DashScope 响应非 JSON', { cause: e });
    }
    const parsed = parseAssistantMessage(data);
    const usage = parseUsage(data);
    return { ...parsed, usage };
  }

  async chatStream(
    messages: LLMMessage[],
    tools: ToolDefinition[] | undefined,
    onTextDelta: (chunk: string) => void,
    options?: ChatStreamOptions,
  ): Promise<LLMResponse & { usage: TokenUsage }> {
    const url = `${this.opts.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const openaiTools = toOpenAITools(tools);
    const body: Record<string, unknown> = {
      model: this.opts.chatModel,
      messages: toOpenAIMessages(messages),
      stream: true,
    };
    if (openaiTools?.length) {
      body.tools = openaiTools;
      body.tool_choice = options?.toolChoice === 'required' ? 'required' : 'auto';
    }
    const signal = deadlineSignal(QWEN_STREAM_WALL_MS);
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
    } catch (e) {
      if (isAbortError(e)) {
        throw new LLMError('DashScope 流式请求超时', {
          code: 'LLM_TIMEOUT',
          statusCode: 504,
          cause: e,
        });
      }
      throw e;
    }
    if (!res.ok) {
      const t = await res.text();
      const { message, details } = dashScopeFailDetails('流式', res.status, this.opts.baseUrl, t);
      throw new LLMError(message, { details });
    }
    if (!res.body) {
      throw new LLMError('DashScope 流式: 空 body');
    }

    let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const toolSlots = new Map<number, { id: string; name: string; arguments: string }>();
    let fullText = '';

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        let readResult: ReadableStreamReadResult<Uint8Array>;
        try {
          readResult = await reader.read();
        } catch (e) {
          if (isAbortError(e)) {
            throw new LLMError('DashScope 流式读取中断', {
              code: 'LLM_TIMEOUT',
              statusCode: 504,
              cause: e,
            });
          }
          throw e;
        }
        const { done, value } = readResult;
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          let json: unknown;
          try {
            json = JSON.parse(payload) as unknown;
          } catch {
            continue;
          }
          const u = (json as { usage?: unknown })?.usage;
          if (u && typeof u === 'object') {
            usage = parseUsage(json);
          }
          const choice = (json as { choices?: { delta?: unknown }[] })?.choices?.[0];
          const delta = choice?.delta as {
            content?: string;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
          if (delta?.content) {
            fullText += delta.content;
            onTextDelta(delta.content);
          }
          if (Array.isArray(delta?.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = typeof tc.index === 'number' ? tc.index : 0;
              let slot = toolSlots.get(idx);
              if (!slot) {
                slot = { id: '', name: '', arguments: '' };
                toolSlots.set(idx, slot);
              }
              if (tc.id) slot.id = tc.id;
              if (tc.function?.name) slot.name = tc.function.name;
              if (tc.function?.arguments) slot.arguments += tc.function.arguments;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const sortedKeys = [...toolSlots.keys()].sort((a, b) => a - b);
    const tool_calls: ToolCall[] = [];
    for (const k of sortedKeys) {
      const s = toolSlots.get(k)!;
      if (!s.name) continue;
      tool_calls.push({
        id: s.id.trim() || crypto.randomUUID(),
        name: s.name,
        arguments: s.arguments || '{}',
      });
    }

    return {
      content: fullText,
      tool_calls: tool_calls.length ? tool_calls : undefined,
      usage,
    };
  }

  streamChat(messages: LLMMessage[], tools?: ToolDefinition[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start: async (controller) => {
        try {
          await this.chatStream(messages, tools, (d) => {
            controller.enqueue(encoder.encode(d));
          });
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
    const url = `${this.opts.baseUrl.replace(/\/$/, '')}/embeddings`;
    const body: Record<string, unknown> = {
      model: this.opts.embeddingModel,
      input: trimmed,
    };
    const dim = this.opts.expectedEmbeddingDimensions;
    if (dim !== undefined && dim > 0) {
      body.dimensions = dim;
    }
    const signal = deadlineSignal(QWEN_EMBED_TIMEOUT_MS);
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
    } catch (e) {
      if (isAbortError(e)) {
        throw new LLMError('DashScope embeddings 超时', {
          code: 'LLM_TIMEOUT',
          statusCode: 504,
          cause: e,
        });
      }
      throw e;
    }
    const raw = await res.text();
    if (!res.ok) {
      const { message, details } = dashScopeFailDetails('embeddings', res.status, this.opts.baseUrl, raw);
      throw new LLMError(message, { details });
    }
    let data: unknown;
    try {
      data = JSON.parse(raw) as unknown;
    } catch (e) {
      throw new LLMError('DashScope embeddings 非 JSON', { cause: e });
    }
    const values = (data as { data?: { embedding?: number[] }[] })?.data?.[0]?.embedding;
    if (!Array.isArray(values) || !values.length) {
      throw new LLMError('DashScope embeddings: 缺少 data[0].embedding');
    }
    const expected = this.opts.expectedEmbeddingDimensions;
    if (expected !== undefined && values.length !== expected) {
      throw new LLMError(
        `Embedding 维度不一致: 期望 ${expected}，实际 ${values.length}（请核对 EMBEDDING_MODEL / dimensions 与 Qdrant collection）`,
        { details: { expected, actual: values.length } },
      );
    }
    return values;
  }
}

export type QwenDashScopeEnv = {
  DASHSCOPE_API_KEY?: string;
  /** 如新加坡：https://dashscope-intl.aliyuncs.com/compatible-mode/v1 */
  DASHSCOPE_BASE_URL?: string;
  LLM_MODEL?: string;
  EMBEDDING_MODEL?: string;
  EMBEDDING_DIMENSIONS?: string;
};

export function hasQwenConfig(env: QwenDashScopeEnv): boolean {
  return !!env.DASHSCOPE_API_KEY?.trim();
}

export function createQwenProvider(env: QwenDashScopeEnv, fetchImpl?: typeof fetch): QwenProvider | null {
  const rawKey = env.DASHSCOPE_API_KEY?.trim();
  if (!rawKey) return null;
  const apiKey = normalizeDashScopeApiKey(rawKey);
  if (!apiKey) return null;
  const baseUrl = (env.DASHSCOPE_BASE_URL?.trim() || DEFAULT_DASHSCOPE_BASE_URL).replace(/\/$/, '');
  const chatModel = env.LLM_MODEL?.trim() || 'qwen-plus';
  const embeddingModel = env.EMBEDDING_MODEL?.trim() || 'text-embedding-v3';
  let expectedEmbeddingDimensions: number | undefined;
  const dimRaw = env.EMBEDDING_DIMENSIONS?.trim();
  if (dimRaw) {
    const n = Number.parseInt(dimRaw, 10);
    if (Number.isFinite(n) && n > 0) {
      expectedEmbeddingDimensions = n;
    }
  }
  return new QwenProvider({
    apiKey,
    baseUrl,
    chatModel,
    embeddingModel,
    expectedEmbeddingDimensions,
    fetchImpl,
  });
}
