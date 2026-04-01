import { encodeSseEvent } from '../chat/sse';
import type { ChatService, ChatStreamParams } from '../chat/chat-service';
import { logger } from '../lib/logger';
import type { LLMProvider } from '../llm/types';
import { decomposeUserSteps, type DecomposeStepRaw } from './decompose';

export type OrchestrationStreamParams = ChatStreamParams & {
  correlationId: string;
};

function buildPlanSteps(steps: DecomposeStepRaw[]): Array<{
  id: string;
  type: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed';
}> {
  return steps.map((s, i) => ({
    id: `s${i + 1}`,
    type: s.type,
    title: s.summary.slice(0, 80),
    status: i === 0 ? ('running' as const) : ('pending' as const),
  }));
}

/** §9.9.2 风格对用户可见引言 */
export function buildOrchestratorIntro(plan: ReturnType<typeof buildPlanSteps>): string {
  const lines = plan.map((p, i) => `${i + 1}、${p.title}`);
  return `您这次的需求可以拆成 **${plan.length}** 件事，我们会**按顺序**处理：\n\n${lines.join('\n')}\n\n先从第 1 步开始。`;
}

export function buildOrchestrationSystemAppend(plan: ReturnType<typeof buildPlanSteps>): string {
  const lines = plan.map((p, i) => `${i + 1}. [${p.type}] ${p.title}（id=${p.id}）`);
  return (
    `\n\n【编排上下文 · 系统已分解为多步】\n${lines.join('\n')}\n` +
    `请严格按顺序执行：先完成 **task** 类（须调用 add_task / update_task 等；写入后可用 confirm_tool_creation 校验），再处理 **route** 类（须调用 amap_*）。` +
    `未完成前序步骤前不要跳到后续步骤。回复用户时保持自然语言，不要暴露内部 step id。`
  );
}

async function pipeThrough(
  inner: ReadableStream<Uint8Array>,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<void> {
  const reader = inner.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) controller.enqueue(value);
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 多 Agent 编排入口（阶段 2）：分解 → 必要时发 orchestrator_* → 委托 ChatService。
 */
export class OrchestrationService {
  constructor(
    private readonly llm: LLMProvider,
    private readonly chatService: ChatService,
  ) {}

  handleStream(params: OrchestrationStreamParams): ReadableStream<Uint8Array> {
    const {
      correlationId,
      user,
      userInput,
      sessionId,
      sessionTitleSource,
      waitUntil,
      orchestrationGot,
      proxyForUserId,
    } = params;

    const streamBase = {
      user,
      userInput,
      sessionId,
      sessionTitleSource,
      waitUntil,
      orchestrationGot,
      orchestrationCorrelationId: correlationId,
      proxyForUserId,
    };
    const encoder = new TextEncoder();
    const metricsBase = { user_id: user.id, session_id: sessionId, correlation_id: correlationId };

    return new ReadableStream({
      start: async (controller) => {
        const send = (event: string, payload: unknown) => {
          controller.enqueue(encoder.encode(encodeSseEvent(event, payload)));
        };

        try {
          const dec = await decomposeUserSteps(this.llm, userInput, metricsBase);

          const useMulti =
            dec.ok && dec.steps.length > 1;

          if (!useMulti) {
            send('orchestrator_progress', {
              correlation_id: correlationId,
              schema_version: 1,
              phase: 'fallback_single_chat',
              step_id: null,
              message:
                dec.ok && dec.steps.length === 1
                  ? '当前为单步需求，按常规对话处理。'
                  : '未能可靠分解为多步，按常规对话处理。',
              level: 'info',
            });
            const inner = this.chatService.handleMessageStream({ ...streamBase });
            await pipeThrough(inner, controller);
            controller.close();
            return;
          }

          const planPayload = buildPlanSteps(dec.steps);
          send('orchestrator_plan', {
            correlation_id: correlationId,
            schema_version: 1,
            steps: planPayload,
          });
          send('orchestrator_progress', {
            correlation_id: correlationId,
            schema_version: 1,
            phase: 'decompose',
            step_id: null,
            message: '已分解为多步，开始处理第 1 步。',
            level: 'info',
          });

          const intro = buildOrchestratorIntro(planPayload);
          send('token', { content: `${intro}\n\n`, source: 'orchestrator' });

          const append = buildOrchestrationSystemAppend(planPayload);
          const firstStep = dec.steps[0];
          const firstIsTask = firstStep?.type?.toLowerCase() === 'task';
          const routeIdx = dec.steps.findIndex((s) => s.type?.toLowerCase() === 'route');
          const routeDecomp = routeIdx >= 0 ? dec.steps[routeIdx] : null;
          const routePlan = routeIdx >= 0 ? planPayload[routeIdx] : null;
          const inner = this.chatService.handleMessageStream({
            user,
            userInput,
            sessionId,
            sessionTitleSource,
            waitUntil,
            proxyForUserId,
            orchestrationSystemAppend: append,
            orchestrationTaskAgent:
              firstIsTask && firstStep && planPayload[0]
                ? {
                    correlationId,
                    stepId: planPayload[0].id,
                    stepSummary: firstStep.summary,
                  }
                : undefined,
            orchestrationRouteAgent:
              routeDecomp && routePlan && routeIdx >= 0
                ? {
                    correlationId,
                    stepId: routePlan.id,
                    stepSummary: routeDecomp.summary,
                    planStepIndex: routeIdx,
                  }
                : undefined,
          });
          await pipeThrough(inner, controller);
          controller.close();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error('orchestration stream failed', { ...metricsBase, error: msg });
          send('orchestrator_progress', {
            correlation_id: correlationId,
            schema_version: 1,
            phase: 'fallback_single_chat',
            step_id: null,
            message: '编排异常，已切换为常规对话。',
            level: 'warn',
          });
          try {
            const inner = this.chatService.handleMessageStream({ ...streamBase });
            await pipeThrough(inner, controller);
          } catch (e2) {
            send('token', { content: e2 instanceof Error ? e2.message : String(e2) });
            send('done', {});
          }
          controller.close();
        }
      },
    });
  }
}
