import type { LLMMessage, LLMProvider } from '../llm/types';
import { encodeSseEvent } from './sse';
import type { UserRow } from '../db';
import type { ConversationRepository } from '../db';
import type { IntentClassifier } from '../intent';
import type { MemoryService } from '../memory/memory-service';
import { PromptService } from '../prompt';
import { ToolRegistry } from '../tools/tool-registry';
import { logger } from '../lib/logger';

const MAX_REACT_ITERATIONS = 10;
const SHORT_TERM_MESSAGE_CAP = 20;
const TOKEN_CHUNK = 32;

export type ChatStreamParams = {
  user: UserRow;
  userInput: string;
};

export function extractKeywords(_userInput: string): string[] {
  return [];
}

export class ChatService {
  constructor(
    private readonly llm: LLMProvider,
    private readonly promptService: PromptService,
    private readonly intentClassifier: IntentClassifier,
    private readonly conversationRepo: ConversationRepository,
    private readonly toolRegistry: ToolRegistry,
    private readonly memoryService: MemoryService | null,
  ) {}

  /**
   * 返回 UTF-8 字节流：SSE 事件序列（token / tool_call / tool_result_meta / citation / intention / done）。
   */
  handleMessageStream(params: ChatStreamParams): ReadableStream<Uint8Array> {
    const { user, userInput } = params;
    const encoder = new TextEncoder();

    return new ReadableStream({
      start: async (controller) => {
        const send = (event: string, payload: unknown) => {
          controller.enqueue(encoder.encode(encodeSseEvent(event, payload)));
        };

        try {
          const intention = await this.intentClassifier.classify(userInput);
          send('intention', { intention });

          const template = await this.promptService.selectTemplate(intention);
          const tools = this.toolRegistry.getDefinitions();
          const systemPrompt = this.promptService.render(template.template_text, {
            userName: user.name,
            userEmail: user.email,
            aiNickname: user.ai_nickname,
            tools,
            preferencesJson: user.preferences_json,
          });

          let ragBlock = '';
          if (this.memoryService) {
            const mem = await this.memoryService.retrieveForRag(userInput, user.id);
            for (const c of mem.citations) {
              send('citation', {
                kind: c.kind,
                file_id: c.file_id,
                filename: c.filename,
                semantic_type: c.semantic_type,
                excerpt: c.excerpt,
                score: c.score,
              });
            }
            ragBlock = mem.ragContextBlock;
          }

          const historyRows = await this.conversationRepo.listRecentForUser(
            user.id,
            SHORT_TERM_MESSAGE_CAP,
          );
          const historyMessages: LLMMessage[] = [];
          for (const row of historyRows) {
            if (row.role !== 'user' && row.role !== 'assistant') continue;
            if (!row.content.trim()) continue;
            historyMessages.push({
              role: row.role as 'user' | 'assistant',
              content: row.content,
            });
          }

          const messages: LLMMessage[] = [
            { role: 'system', content: systemPrompt },
            ...(ragBlock ? [{ role: 'system' as const, content: ragBlock }] : []),
            ...historyMessages,
            { role: 'user', content: userInput },
          ];

          const defs = tools.length ? tools : undefined;
          let finalText = '';
          let stalledOnTools = false;

          for (let round = 0; round < MAX_REACT_ITERATIONS; round++) {
            const response = await this.llm.chat(messages, defs);

            if (!response.tool_calls?.length) {
              finalText = response.content ?? '';
              stalledOnTools = false;
              break;
            }

            stalledOnTools = true;

            for (const tc of response.tool_calls) {
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(tc.arguments || '{}') as Record<string, unknown>;
              } catch {
                args = { _raw: tc.arguments };
              }
              send('tool_call', { name: tc.name, args });
            }

            const executed = await this.toolRegistry.executeAll(response.tool_calls, {
              userId: user.id,
            });

            for (let i = 0; i < response.tool_calls.length; i++) {
              const call = response.tool_calls[i]!;
              const result = executed[i];
              if (
                result?.toolResultMeta &&
                (call.name === 'search' || result.toolResultMeta.tool === 'search')
              ) {
                send('tool_result_meta', result.toolResultMeta);
              }
            }

            messages.push({
              role: 'assistant',
              content: response.content ?? '',
              tool_calls: response.tool_calls,
            });
            for (let i = 0; i < response.tool_calls.length; i++) {
              const result = executed[i]!;
              messages.push({
                role: 'tool',
                content: result.output,
                tool_call_id: result.geminiToolCallId,
              });
            }
          }

          if (stalledOnTools && !finalText) {
            finalText = '（已达到工具调用次数上限，请简化问题后重试。）';
          }

          for (let i = 0; i < finalText.length; i += TOKEN_CHUNK) {
            send('token', { content: finalText.slice(i, i + TOKEN_CHUNK) });
          }

          const keywords = extractKeywords(userInput);
          const kwJson = JSON.stringify(keywords);
          const now = Math.floor(Date.now() / 1000);
          const userMsgId = crypto.randomUUID();
          const assistantMsgId = crypto.randomUUID();

          await this.conversationRepo.insert({
            id: userMsgId,
            user_id: user.id,
            role: 'user',
            content: userInput,
            intention,
            prompt_id: null,
            keywords: kwJson,
            conversation_id: null,
            created_at: now,
          });

          await this.conversationRepo.insert({
            id: assistantMsgId,
            user_id: user.id,
            role: 'assistant',
            content: finalText,
            intention,
            prompt_id: template.id,
            keywords: kwJson,
            conversation_id: userMsgId,
            created_at: now,
          });

          send('done', {});
        } catch (e) {
          logger.error('chat stream failed', {
            error: e instanceof Error ? e.message : String(e),
          });
          const msg =
            e instanceof Error ? e.message : '对话处理失败';
          send('token', { content: msg });
          send('done', {});
        } finally {
          controller.close();
        }
      },
    });
  }
}
