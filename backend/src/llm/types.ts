/** 与 tech_design_ai_bot §6.1 对齐 */

export interface ToolCall {
  id: string;
  name: string;
  /** JSON 字符串，与 OpenAI 风格工具参数一致 */
  arguments: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  /** `tool` 角色：填函数名，或 `函数名::调用id`（供 Gemini `functionResponse.name`） */
  tool_call_id?: string;
}

export interface LLMResponse {
  content: string;
  tool_calls?: ToolCall[];
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** JSON Schema 风格（Gemini functionDeclaration.parameters） */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMProvider {
  chat(
    messages: LLMMessage[],
    tools?: ToolDefinition[],
  ): Promise<LLMResponse & { usage: TokenUsage }>;
  /**
   * Gemini `streamGenerateContent`：边收边回调文本增量；流结束后返回完整 content / tool_calls / usage。
   */
  chatStream(
    messages: LLMMessage[],
    tools: ToolDefinition[] | undefined,
    onTextDelta: (chunk: string) => void,
  ): Promise<LLMResponse & { usage: TokenUsage }>;
  /** UTF-8 字节流，按模型返回顺序推送增量文本（不含 SSE 包装）；内部委托 `chatStream` */
  streamChat(
    messages: LLMMessage[],
    tools?: ToolDefinition[],
  ): ReadableStream<Uint8Array>;
  embed(text: string): Promise<number[]>;
}
