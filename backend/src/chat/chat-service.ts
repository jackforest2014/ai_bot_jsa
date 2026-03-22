import type { LLMMessage, LLMProvider } from '../llm/types';
import { encodeSseEvent } from './sse';
import type { UserRow } from '../db';
import type { ConversationRepository, SessionRepository } from '../db';
import type { IntentClassifier } from '../intent';
import type { MemoryService } from '../memory/memory-service';
import { PromptService } from '../prompt';
import { ToolRegistry } from '../tools/tool-registry';
import { logger } from '../lib/logger';
import { recordMetric } from '../observability/metrics';

const MAX_REACT_ITERATIONS = 10;
const SHORT_TERM_MESSAGE_CAP = 20;
/** RAG = Gemini embed（最长见 gemini-provider GEMINI_EMBED_TIMEOUT_MS）+ Qdrant search；须大于 embed 超时留出检索余量 */
const MEMORY_RAG_TIMEOUT_MS = 75_000;

function raceWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`${label}:timeout:${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

export type ChatStreamParams = {
  user: UserRow;
  userInput: string;
  /** 当前会话（须已通过归属校验） */
  sessionId: string;
  sessionTitleSource: 'auto' | 'user';
  waitUntil?: (p: Promise<unknown>) => void;
};

async function suggestSessionTitle(llm: LLMProvider, userSentence: string): Promise<string> {
  const trimmed = userSentence.trim();
  if (trimmed.length <= 36) return trimmed || '新对话';
  try {
    const r = await llm.chat(
      [
        {
          role: 'system',
          content:
            '你是标题生成器。用不超过18个汉字概括用户首条问题，不要引号、不要标点结尾，只输出标题本身。',
        },
        { role: 'user', content: trimmed.slice(0, 500) },
      ],
      undefined,
    );
    const t = (r.content ?? '').trim().replace(/^[\s"'「」]+|[\s"'。]+$/g, '');
    return t.slice(0, 36) || trimmed.slice(0, 24);
  } catch {
    return trimmed.slice(0, 30);
  }
}

export function extractKeywords(_userInput: string): string[] {
  return [];
}

export class ChatService {
  constructor(
    private readonly llm: LLMProvider,
    private readonly promptService: PromptService,
    private readonly intentClassifier: IntentClassifier,
    private readonly conversationRepo: ConversationRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly toolRegistry: ToolRegistry,
    private readonly memoryService: MemoryService | null,
  ) {}

  /**
   * 返回 UTF-8 字节流：SSE 事件序列（status / token 随 Gemini 流式增量 / tool_call / citation / intention / done）。
   */
  handleMessageStream(params: ChatStreamParams): ReadableStream<Uint8Array> {
    const { user, userInput, sessionId, sessionTitleSource, waitUntil } = params;
    const encoder = new TextEncoder();

    return new ReadableStream({
      start: (controller) => {
        const send = (event: string, payload: unknown) => {
          controller.enqueue(encoder.encode(encodeSseEvent(event, payload)));
        };

        const t0 = Date.now();
        const dbg = (msg: string, meta?: Record<string, unknown>) => {
          logger.debug('chat stream', {
            msg,
            ms: Date.now() - t0,
            userId: user.id,
            ...meta,
          });
        };

        send('status', { phase: 'connected' });
        dbg('sse_open');
        recordMetric('chat_stream_started', { user_id: user.id, session_id: sessionId });

        void (async () => {
        try {
          const countsBefore = await this.conversationRepo.countRolesInSession(sessionId);
          const hasAssistantBefore = await this.conversationRepo.hasAssistantInSession(sessionId);
          const isFirstAssistantTurn = !hasAssistantBefore;
          dbg('session_state', {
            users: countsBefore.users,
            assistants: countsBefore.assistants,
            isFirstAssistantTurn,
          });

          const intention = await this.intentClassifier.classify(userInput);
          dbg('intent_done', { intention });
          send('intention', { intention });

          const template = await this.promptService.selectTemplate(intention);
          dbg('template_selected', { templateId: template.id, templateName: template.name });
          const tools = this.toolRegistry.getDefinitions();
          let systemPrompt = this.promptService.render(template.template_text, {
            userName: user.name,
            userEmail: user.email ?? '',
            aiNickname: user.ai_nickname,
            tools,
            preferencesJson: user.preferences_json,
          });
          if (isFirstAssistantTurn) {
            const gaps: string[] = [];
            if (!user.email?.trim()) gaps.push('邮箱');
            gaps.push('希望被如何称呼（若与当前显示名不同）');
            systemPrompt += `\n\n【首轮资料引导】当前可能缺失或可确认项：${gaps.join('、')}。请在本回复中同时回应用户的实质需求；若用户尚未提供上列信息，用一两句自然话询问；若用户已在本条消息中说明，则不要重复追问。\n`;
          }
          dbg('system_prompt_built', { toolCount: tools.length, systemChars: systemPrompt.length });

          let ragBlock = '';
          if (this.memoryService) {
            send('status', { phase: 'memory_retrieving' });
            dbg('rag_start');
            type RagResult = Awaited<ReturnType<MemoryService['retrieveForRag']>>;
            let mem: RagResult = { citations: [], ragContextBlock: '' };
            try {
              mem = await raceWithTimeout(
                this.memoryService.retrieveForRag(userInput, user.id),
                MEMORY_RAG_TIMEOUT_MS,
                'memory_rag',
              );
              dbg('rag_done', {
                citationCount: mem.citations.length,
                ragChars: mem.ragContextBlock.length,
              });
            } catch (e) {
              const err = e instanceof Error ? e.message : String(e);
              logger.warn('chat stream: memory RAG failed or timed out (continuing without RAG)', {
                userId: user.id,
                error: err,
                hint: '检查 QDRANT；嵌入走当前 LLM（Qwen: DASHSCOPE_API_KEY + 地域 BASE_URL；Gemini: GEMINI_API_KEY）',
              });
              dbg('rag_failed', { error: err });
              send('status', { phase: 'memory_skipped', reason: err });
            }
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
          } else {
            dbg('rag_skip', { reason: 'memory_service_null' });
          }

          const historyRows = await this.conversationRepo.listRecentForSession(
            sessionId,
            SHORT_TERM_MESSAGE_CAP,
          );
          dbg('history_loaded', { rows: historyRows.length, sessionId });
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
            send('status', { phase: 'model_generating' });
            dbg('llm_stream_request', {
              round,
              messageCount: messages.length,
              hasTools: !!defs?.length,
            });
            const llmT = Date.now();
            const response = await this.llm.chatStream(messages, defs, (delta) => {
              if (delta) send('token', { content: delta });
            });
            const llmMs = Date.now() - llmT;
            recordMetric('llm_chat_stream', {
              user_id: user.id,
              session_id: sessionId,
              round,
              duration_ms: llmMs,
              tool_calls: response.tool_calls?.length ?? 0,
              text_chars: (response.content ?? '').length,
            });
            dbg('llm_stream_done', {
              round,
              llmMs,
              textChars: (response.content ?? '').length,
              toolCallCount: response.tool_calls?.length ?? 0,
            });

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

            send('status', { phase: 'tools_running' });
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
            send('token', { content: finalText });
          }

          const keywords = extractKeywords(userInput);
          const kwJson = JSON.stringify(keywords);
          const wallSec = Math.floor(Date.now() / 1000);
          const maxAt = await this.conversationRepo.maxCreatedAtForSession(sessionId);
          const userAt = Math.max(wallSec, (maxAt ?? 0) + 1);
          const assistantAt = userAt + 1;
          const userMsgId = crypto.randomUUID();
          const assistantMsgId = crypto.randomUUID();

          await this.conversationRepo.insert({
            id: userMsgId,
            user_id: user.id,
            session_id: sessionId,
            role: 'user',
            content: userInput,
            intention,
            prompt_id: null,
            keywords: kwJson,
            conversation_id: null,
            created_at: userAt,
          });

          await this.conversationRepo.insert({
            id: assistantMsgId,
            user_id: user.id,
            session_id: sessionId,
            role: 'assistant',
            content: finalText,
            intention,
            prompt_id: template.id,
            keywords: kwJson,
            conversation_id: userMsgId,
            created_at: assistantAt,
          });

          await this.sessionRepo.touchUpdatedAt(sessionId, user.id);

          const firstPairInSession =
            countsBefore.users === 0 && countsBefore.assistants === 0 && sessionTitleSource === 'auto';
          if (firstPairInSession) {
            const runTitle = async () => {
              try {
                const title = await suggestSessionTitle(this.llm, userInput);
                await this.sessionRepo.updateTitleIfStillAuto(sessionId, user.id, title);
              } catch (err) {
                logger.warn('auto session title failed', {
                  sessionId,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            };
            if (waitUntil) {
              try {
                waitUntil(runTitle());
              } catch {
                void runTitle();
              }
            } else {
              void runTitle();
            }
          }

          dbg('persist_done', { totalMs: Date.now() - t0 });
          send('done', {});
        } catch (e) {
          logger.error('chat stream failed', {
            error: e instanceof Error ? e.message : String(e),
            userId: user.id,
            ms: Date.now() - t0,
          });
          const msg =
            e instanceof Error ? e.message : '对话处理失败';
          send('token', { content: msg });
          send('done', {});
        } finally {
          recordMetric('chat_stream_finished', {
            user_id: user.id,
            session_id: sessionId,
            total_ms: Date.now() - t0,
          });
          controller.close();
        }
        })();
      },
    });
  }
}
