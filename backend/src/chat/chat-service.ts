import type { LLMMessage, LLMProvider } from '../llm/types';
import { encodeSseEvent } from './sse';
import type { UserRow } from '../db';
import type { ConversationRepository, ConversationRow, SessionRepository } from '../db';
import type { IntentClassifier } from '../intent';
import type { MemoryService } from '../memory/memory-service';
import { PromptService } from '../prompt';
import { ToolRegistry } from '../tools/tool-registry';
import { logger } from '../lib/logger';
import { recordMetric } from '../observability/metrics';
import { conversationRowsToLlmMessages } from './history-for-llm';
import { logLlmMessagesSnapshot } from './log-llm-messages';
import { wantsWebImageSearch } from './detect-web-image-intent';
import { formatSystemClockBlock } from './system-clock-block';
import { clampSessionTitle, SESSION_TITLE_MAX_LEN } from '../lib/session-title';
import {
  pickTaskMutationToolDefinitions,
  resolveTaskMutationSignal,
  taskMutationKeywordMatch,
} from './task-mutation-intent';
import {
  parseSearchImagesAllowlistFromToolJson,
  sanitizeMarkdownImagesToAllowlist,
} from './sanitize-web-search-images';

const MAX_REACT_ITERATIONS = 10;

/** 任务类工具执行后向前端推 `tool_result_meta`，用于侧栏列表刷新 */
const TASK_TOOLS_WITH_SSE_META = new Set([
  'add_task',
  'list_tasks',
  'update_task',
  'delete_task',
]);

const ROUTE_QUERY_TOOL_CITATION_HINT =
  '\n\n【路线查询补充】若已调用 amap_ 开头工具，请在最终回答中于路线说明、链接或图片旁明确写出所用工具名（如「（工具：amap_route_plan）」），与系统对路线场景的要求一致。\n';

/** 防止模型只写「已创建任务」却不调 add_task，导致侧栏/库无记录 */
const TASK_MUTATION_SYSTEM_APPEND =
  '\n\n【任务写入纪律】用户要求**新增、创建、记录**待办/任务/行程/提醒，或你准备说「已创建」「已添加」「已记入任务」时，**必须实际调用 `add_task`**（几条任务就调用几次，或分多轮各调一次）；**禁止**只用自然语言列出任务却不调用工具——否则数据库与侧栏任务列表**不会出现**任何记录。改时间/内容用 `update_task`，删除用 `delete_task`。若缺日期时刻，可先 `resolve_shanghai_calendar` 或追问用户，**禁止在未成功调用写入类工具前谎称已保存**。\n';

/** 首轮收窄工具 + tool_choice required 时配套，与工业界「突变操作强制 function call」一致 */
const TASK_MUTATION_FORCE_FIRST_APPEND =
  '\n\n【本轮 · 任务工具强制】系统已判定本话轮为**任务/日程/待办**类请求。API **首轮仅提供** `resolve_shanghai_calendar`、`add_task`、`list_tasks`、`update_task`、`delete_task`；你必须**先调用其中至少一个工具**（通常先 `resolve_shanghai_calendar` 再 `add_task` / `update_task`），再向用户说明结果。**禁止**在未调用工具前用自然语言声称任务已写入数据库。若同一需求还需联网搜索或路线规划，须待本轮工具执行完毕、进入下一轮后再使用其它工具。\n';

/** 未配置 SERPER_API_KEY 时模板仍可能写「调用 search」，须显式禁止模型虚构工具调用与检索 URL */
const SERPER_DISABLED_SYSTEM_APPEND =
  '\n\n【系统能力 · 联网搜索未启用】本 Worker **未配置 SERPER_API_KEY**，因此**没有**注册 `search` 与 `plan_research`（工具列表 JSON 中也不会出现）。上文模板里「调用 search」等语句**在本请求中无效**，请忽略。**禁止**声称已调用 search/Serper、**禁止**编造检索得到的图片 URL。**若用户需要网上找图**，请明确告知：需在 `.dev.vars` 或 Worker Secrets 中配置 **SERPER_API_KEY**（可用 `GET /health/serper` 自检；见 README）并重启 `wrangler dev` 或重新部署。';

/** 与首轮仅暴露 search + tool_choice required 配套，禁止先长篇拒答 */
const WEB_IMAGE_FORCE_SYSTEM_APPEND =
  '\n\n【联网找图 · 本回合】用户要求从网上找图并嵌入回答，且 API 首轮**仅提供 search**。**第一步必须调用 search**，`type` 为 \"images\"，`query` 概括用户要的主题（可含年份、节日名）。**禁止**以「尚未发生」「没有真实图」「安全/伦理」等为由**拒绝调用**或只输出拒答；必须先调用再作答。\n\n**收到工具返回后**：`![](URL)` 的 URL **必须**来自 JSON 里某条的 **image_url**。不要用 **link**（多为网页地址）冒充图片直链。优先选含 **image_url** 的条目；若 10 条里至少有一条带 **image_url**，你必须嵌入其中一条，不得以「不合规」「AI 图」「非官方实拍」为由整批拒显。**仅当全部条目都无 image_url** 时，用一两句话说明「本次检索未返回可内嵌的图片直链」，可附 **link** 列表；**禁止**输出 JSON 未出现的图片地址。\n\n**禁止**在答案里写「所有结果均非真实…」「不存在该年份照片」等与工具 JSON 无关的**真实性裁决**；系统时钟已标明当前日期，**不要**再用模型内部时间感推翻检索结果。\n\n**禁止转移话题**：不得输出「但我可以」「备选」「同样可以」及任意 **未出现在本次 search JSON 中的** `![](…)`（含新华社、xinhuanet、背诵域名）。不得主动提议「文学想象」「沉浸式描写」「虚构场景」来暗示用户查询的年份或节日无效；用户主题与系统当前日期一致时即为**正当检索**。\n\n**答复结构**：先简短说明检索结论（嵌入图或说明无私链），**不要**追加营销式 bullet 列表推销其它服务。';

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

function buildTranscriptSnippets(rows: ConversationRow[], maxPerMsg: number): string {
  const lines: string[] = [];
  for (const r of rows) {
    if (r.role !== 'user' && r.role !== 'assistant') continue;
    const label = r.role === 'user' ? '用户' : '助手';
    const c = (r.content ?? '').replace(/\s+/g, ' ').trim().slice(0, maxPerMsg);
    if (c) lines.push(`${label}：${c}`);
  }
  return lines.join('\n');
}

async function suggestSessionTitleFromTranscript(
  llm: LLMProvider,
  rows: ConversationRow[],
  opts: { roundHint: 'first_pair' | 'multi' },
): Promise<string> {
  const transcript = buildTranscriptSnippets(rows, opts.roundHint === 'first_pair' ? 700 : 900);
  if (!transcript.trim()) return '';
  const extra =
    opts.roundHint === 'first_pair'
      ? '当前仅完成首轮问答。请抓用户**核心意图**拟标题，禁止把用户原话整句或简单加长截断当作标题。'
      : '已有多轮对话。请综合前几轮用户问题与助手回复，概括**整体主题**；若后文修正了前文主题，以最新共识为准。';
  try {
    const r = await llm.chat(
      [
        {
          role: 'system',
          content:
            `你是对话列表标题生成器。${extra}\n要求：\n- 不超过${SESSION_TITLE_MAX_LEN}个字（汉字、字母、数字各算一字）；\n- 不要用引号、书名号，不要句末标点；\n- 只输出一行标题，不要解释。`,
        },
        { role: 'user', content: transcript.slice(0, 12000) },
      ],
      undefined,
    );
    return clampSessionTitle(r.content ?? '');
  } catch {
    return '';
  }
}

/** 无历史摘录时的兜底（仍走 LLM，避免短首句被原样当作标题） */
async function suggestSessionTitleFallback(llm: LLMProvider, userSentence: string): Promise<string> {
  const trimmed = userSentence.trim().slice(0, 800);
  if (!trimmed) return '新对话';
  try {
    const r = await llm.chat(
      [
        {
          role: 'system',
          content:
            `用不超过${SESSION_TITLE_MAX_LEN}个字概括用户话里的主题；禁止照搬原句当标题；不要引号和句末标点；只输出一行。`,
        },
        { role: 'user', content: trimmed },
      ],
      undefined,
    );
    const t = clampSessionTitle(r.content ?? '');
    if (t) return t;
  } catch {
    /* fall through */
  }
  const head = clampSessionTitle(trimmed.split(/[。！？\n]/)[0] ?? trimmed);
  return head || '新对话';
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
          const allTools = this.toolRegistry.getDefinitions();
          const serperSearchRegistered = allTools.some((t) => t.name === 'search');
          const searchDefs = allTools.filter((t) => t.name === 'search');
          const amapDefs = allTools.filter((t) => t.name.startsWith('amap_'));
          /** 路线意图且已配置高德：提示词与首轮 API 仅暴露 amap_*；同句含日程/会面等时不独占（见 taskMutationKeywordMatch） */
          const taskKeywordMatch = taskMutationKeywordMatch(userInput);
          const routeAmapMode =
            intention === 'route_query' && amapDefs.length > 0 && !taskKeywordMatch;
          /** 联网找图且已注册 Serper：首轮仅暴露 search + 强制 function call，避免模型纯文本拒答 */
          const webImageSearchForceMode =
            serperSearchRegistered &&
            searchDefs.length > 0 &&
            wantsWebImageSearch(userInput) &&
            !routeAmapMode;
          const taskToolDefs = pickTaskMutationToolDefinitions(allTools);
          const taskMutSig = resolveTaskMutationSignal(userInput, intention);
          const taskMutationForceMode =
            !routeAmapMode &&
            !webImageSearchForceMode &&
            taskToolDefs.length > 0 &&
            taskMutSig.force;
          const toolsForPrompt = routeAmapMode
            ? amapDefs
            : webImageSearchForceMode
              ? searchDefs
              : taskMutationForceMode
                ? taskToolDefs
                : allTools;
          let systemPrompt = this.promptService.render(template.template_text, {
            userName: user.name,
            userEmail: user.email ?? '',
            aiNickname: user.ai_nickname,
            tools: toolsForPrompt,
            preferencesJson: user.preferences_json,
          });
          if (isFirstAssistantTurn) {
            const gaps: string[] = [];
            if (!user.email?.trim()) gaps.push('邮箱');
            gaps.push('希望被如何称呼（若与当前显示名不同）');
            systemPrompt += `\n\n【首轮资料引导】当前可能缺失或可确认项：${gaps.join('、')}。请在本回复中同时回应用户的实质需求；若用户尚未提供上列信息，用一两句自然话询问；若用户已在本条消息中说明，则不要重复追问。\n`;
          }
          if (intention === 'route_query') {
            systemPrompt += ROUTE_QUERY_TOOL_CITATION_HINT;
          }
          /** 置首：避免长模板淹没，降低模型仍按「训练截止年」拒答的概率 */
          systemPrompt = `${formatSystemClockBlock()}\n\n${systemPrompt}`;
          if (!serperSearchRegistered) {
            systemPrompt += SERPER_DISABLED_SYSTEM_APPEND;
            logger.info('chat stream: search tool not registered', {
              userId: user.id,
              sessionId,
              reason: 'SERPER_API_KEY missing or empty',
            });
          } else if (webImageSearchForceMode) {
            systemPrompt += WEB_IMAGE_FORCE_SYSTEM_APPEND;
          }
          if (taskMutationForceMode) {
            systemPrompt += TASK_MUTATION_FORCE_FIRST_APPEND;
          }
          if (toolsForPrompt.some((t) => ['add_task', 'update_task', 'delete_task'].includes(t.name))) {
            systemPrompt += TASK_MUTATION_SYSTEM_APPEND;
          }
          dbg('system_prompt_built', {
            toolCount: toolsForPrompt.length,
            routeAmapMode,
            taskKeywordMatch,
            webImageSearchForceMode,
            taskMutationForceMode,
            taskMutationReason: taskMutSig.reason,
            systemChars: systemPrompt.length,
            serperSearchRegistered,
          });

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
          const historyMessages = conversationRowsToLlmMessages(historyRows, intention);

          const messages: LLMMessage[] = [
            { role: 'system', content: systemPrompt },
            ...(ragBlock ? [{ role: 'system' as const, content: ragBlock }] : []),
            ...historyMessages,
            { role: 'user', content: userInput },
          ];

          logLlmMessagesSnapshot(
            'before_stream',
            messages,
            {
              userId: user.id,
              sessionId,
              intention,
              templateId: template.id,
            },
          );

          const allDefs = allTools.length ? allTools : undefined;
          let finalText = '';
          let stalledOnTools = false;
          /** 联网找图：最近一次 `search` 工具 JSON 中的 `image_url` 白名单；服务端据此剔除背诵图链 */
          let webImageMarkdownAllowlist: string[] | null = null;

          for (let round = 0; round < MAX_REACT_ITERATIONS; round++) {
            const roundDefs =
              round === 0 && routeAmapMode && amapDefs.length
                ? amapDefs
                : round === 0 && webImageSearchForceMode && searchDefs.length
                  ? searchDefs
                  : round === 0 && taskMutationForceMode && taskToolDefs.length
                    ? taskToolDefs
                    : allDefs;
            const streamOpts =
              routeAmapMode && round === 0 && amapDefs.length
                ? { toolChoice: 'required' as const }
                : webImageSearchForceMode && round === 0 && searchDefs.length
                  ? { toolChoice: 'required' as const }
                  : taskMutationForceMode && round === 0 && taskToolDefs.length
                    ? { toolChoice: 'required' as const }
                    : undefined;
            send('status', { phase: 'model_generating' });
            dbg('llm_stream_request', {
              round,
              messageCount: messages.length,
              hasTools: !!roundDefs?.length,
              routeAmapFirstRound: !!streamOpts && routeAmapMode && round === 0,
              webImageSearchForceFirstRound: !!streamOpts && webImageSearchForceMode && round === 0,
              taskMutationForceFirstRound: !!streamOpts && taskMutationForceMode && round === 0,
            });
            const shouldSanitizeWebImages =
              webImageSearchForceMode && webImageMarkdownAllowlist !== null && round >= 1;
            let streamBuf = '';
            if (round > 0) {
              logLlmMessagesSnapshot(
                `before_stream_round_${round}`,
                messages,
                {
                  userId: user.id,
                  sessionId,
                  intention,
                  templateId: template.id,
                  round,
                },
              );
            }
            const llmT = Date.now();
            const response = await this.llm.chatStream(
              messages,
              roundDefs,
              shouldSanitizeWebImages
                ? (delta) => {
                    if (delta) streamBuf += delta;
                  }
                : (delta) => {
                    if (delta) send('token', { content: delta });
                  },
              streamOpts,
            );
            const llmMs = Date.now() - llmT;
            recordMetric('llm_chat_stream', {
              user_id: user.id,
              session_id: sessionId,
              round,
              duration_ms: llmMs,
              tool_calls: response.tool_calls?.length ?? 0,
              text_chars: (response.content ?? '').length,
              ...(taskMutationForceMode && round === 0 ? { task_mutation_force: true } : {}),
            });
            dbg('llm_stream_done', {
              round,
              llmMs,
              textChars: (response.content ?? '').length,
              toolCallCount: response.tool_calls?.length ?? 0,
            });

            if (!response.tool_calls?.length) {
              let textOut = response.content ?? streamBuf;
              if (shouldSanitizeWebImages && webImageMarkdownAllowlist !== null) {
                textOut = sanitizeMarkdownImagesToAllowlist(textOut, webImageMarkdownAllowlist);
                send('assistant_content', { content: textOut });
              }
              finalText = textOut;
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
              sessionId,
            });

            for (let i = 0; i < response.tool_calls.length; i++) {
              const call = response.tool_calls[i]!;
              const result = executed[i];
              if (webImageSearchForceMode && call.name === 'search' && result) {
                const urls = parseSearchImagesAllowlistFromToolJson(result.output);
                webImageMarkdownAllowlist = urls !== null ? urls : [];
              }
              if (
                result?.toolResultMeta &&
                (call.name === 'search' ||
                  result.toolResultMeta.tool === 'search' ||
                  call.name.startsWith('amap_') ||
                  TASK_TOOLS_WITH_SSE_META.has(call.name))
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

          dbg('assistant_persisted', {
            sessionId,
            assistantMsgId,
            contentChars: finalText.length,
            contentTail: finalText.slice(-1200),
          });

          await this.sessionRepo.touchUpdatedAt(sessionId, user.id);

          const firstPairInSession =
            countsBefore.users === 0 && countsBefore.assistants === 0 && sessionTitleSource === 'auto';
          const thirdRoundJustCompleted =
            countsBefore.users === 2 &&
            countsBefore.assistants === 2 &&
            sessionTitleSource === 'auto';

          if (firstPairInSession || thirdRoundJustCompleted) {
            const runTitle = async () => {
              try {
                const limit = thirdRoundJustCompleted ? 16 : 6;
                const recent = await this.conversationRepo.listRecentForSession(sessionId, limit);
                let title = await suggestSessionTitleFromTranscript(
                  this.llm,
                  recent,
                  { roundHint: thirdRoundJustCompleted ? 'multi' : 'first_pair' },
                );
                if (!title) {
                  title = await suggestSessionTitleFallback(this.llm, userInput);
                }
                if (!title) title = '新对话';
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
