import { describe, it, expect, vi } from 'vitest';
import { OrchestrationService } from '../src/orchestration/orchestration-service';
import type { ChatService } from '../src/chat/chat-service';
import type { LLMProvider } from '../src/llm/types';

const usage = { promptTokens: 1, completionTokens: 1, totalTokens: 2 };

function collectStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = '';
  return (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out += dec.decode(value, { stream: true });
    }
    return out;
  })();
}

describe('OrchestrationService.handleStream', () => {
  it('emits fallback_single_chat when single step', async () => {
    const llm: Pick<LLMProvider, 'chat'> = {
      chat: vi.fn().mockResolvedValue({
        content: '{"steps":[{"type":"task","summary":"仅一件事"}]}',
        usage,
      }),
    };
    const fakeChat = {
      handleMessageStream: vi.fn(() => {
        return new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode('event: done\ndata: {}\n\n'));
            c.close();
          },
        });
      }),
    } as unknown as ChatService;

    const svc = new OrchestrationService(llm as LLMProvider, fakeChat);
    const text = await collectStream(
      svc.handleStream({
        correlationId: 'cid-1',
        user: {
          id: 'u1',
          name: 't',
          email: null,
          ai_nickname: '助手',
          proxy_uuid: null,
          preferences_json: null,
          created_at: 0,
        },
        userInput: 'hello',
        sessionId: 'sess',
        sessionTitleSource: 'auto',
      }),
    );

    expect(text).toContain('event: orchestrator_progress');
    expect(text).toContain('fallback_single_chat');
    expect(fakeChat.handleMessageStream).toHaveBeenCalled();
  });

  it('emits orchestrator_plan and intro when multi step', async () => {
    const llm: Pick<LLMProvider, 'chat'> = {
      chat: vi.fn().mockResolvedValue({
        content:
          '{"steps":[{"type":"task","summary":"建立日程"},{"type":"route","summary":"规划路线"}]}',
        usage,
      }),
    };
    const fakeChat = {
      handleMessageStream: vi.fn(
        (p: {
          orchestrationSystemAppend?: string;
          orchestrationTaskAgent?: { stepId: string };
          orchestrationRouteAgent?: { stepId: string; planStepIndex: number };
        }) => {
          expect(p.orchestrationSystemAppend).toContain('编排上下文');
          expect(p.orchestrationTaskAgent?.stepId).toBe('s1');
          expect(p.orchestrationRouteAgent?.stepId).toBe('s2');
          expect(p.orchestrationRouteAgent?.planStepIndex).toBe(1);
          return new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode('event: done\ndata: {}\n\n'));
              c.close();
            },
          });
        },
      ),
    } as unknown as ChatService;

    const svc = new OrchestrationService(llm as LLMProvider, fakeChat);
    const text = await collectStream(
      svc.handleStream({
        correlationId: 'cid-2',
        user: {
          id: 'u1',
          name: 't',
          email: null,
          ai_nickname: '助手',
          proxy_uuid: null,
          preferences_json: null,
          created_at: 0,
        },
        userInput: '25号去苏州，再查怎么走',
        sessionId: 'sess',
        sessionTitleSource: 'auto',
      }),
    );

    expect(text).toContain('event: orchestrator_plan');
    expect(text).toContain('cid-2');
    expect(text).toContain('event: token');
    expect(text).toContain('orchestrator');
    expect(fakeChat.handleMessageStream).toHaveBeenCalled();
  });

  it('passes orchestrationRouteAgent when plan has route; no task agent if first step is route', async () => {
    const llm: Pick<LLMProvider, 'chat'> = {
      chat: vi.fn().mockResolvedValue({
        content:
          '{"steps":[{"type":"route","summary":"先查路"},{"type":"task","summary":"再记日程"}]}',
        usage,
      }),
    };
    const fakeChat = {
      handleMessageStream: vi.fn(
        (p: {
          orchestrationTaskAgent?: { stepId: string };
          orchestrationRouteAgent?: { stepId: string; stepSummary: string; planStepIndex: number };
        }) => {
          expect(p.orchestrationTaskAgent).toBeUndefined();
          expect(p.orchestrationRouteAgent?.stepId).toBe('s1');
          expect(p.orchestrationRouteAgent?.planStepIndex).toBe(0);
          expect(p.orchestrationRouteAgent?.stepSummary).toContain('查路');
          return new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode('event: done\ndata: {}\n\n'));
              c.close();
            },
          });
        },
      ),
    } as unknown as ChatService;

    const svc = new OrchestrationService(llm as LLMProvider, fakeChat);
    await collectStream(
      svc.handleStream({
        correlationId: 'cid-r',
        user: {
          id: 'u1',
          name: 't',
          email: null,
          ai_nickname: '助手',
          proxy_uuid: null,
          preferences_json: null,
          created_at: 0,
        },
        userInput: 'test',
        sessionId: 'sess',
        sessionTitleSource: 'auto',
      }),
    );
    expect(fakeChat.handleMessageStream).toHaveBeenCalled();
  });
});
