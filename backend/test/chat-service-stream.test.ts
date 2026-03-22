import { describe, it, expect, vi } from 'vitest';
import { ChatService, extractKeywords } from '../src/chat/chat-service';
import { RuleBasedIntentClassifier } from '../src/intent/intent-classifier';
import { ToolRegistry } from '../src/tools/tool-registry';
import type { LLMProvider } from '../src/llm/types';
import type { UserRow } from '../src/db';
import type { ConversationRepository, SessionRepository } from '../src/db';

describe('extractKeywords', () => {
  it('returns empty array placeholder', () => {
    expect(extractKeywords('anything')).toEqual([]);
  });
});

describe('ChatService.handleMessageStream', () => {
  it('emits intention, token, done for text-only reply', async () => {
    const usage = { promptTokens: 1, completionTokens: 1, totalTokens: 2 };
    const llm: LLMProvider = {
      chat: vi.fn(),
      chatStream: vi.fn(async (_m, _t, onDelta) => {
        onDelta('Hi');
        return { content: 'Hi', tool_calls: undefined, usage };
      }),
      streamChat: vi.fn(),
      embed: vi.fn(),
    };

    const conversationRepo = {
      countRolesInSession: vi.fn(async () => ({ users: 0, assistants: 0 })),
      hasAssistantInSession: vi.fn(async () => false),
      listRecentForSession: vi.fn(async () => []),
      maxCreatedAtForSession: vi.fn(async () => null),
      insert: vi.fn(async () => {}),
    } as unknown as ConversationRepository;

    const sessionRepo = {
      touchUpdatedAt: vi.fn(async () => {}),
      updateTitleIfStillAuto: vi.fn(async () => false),
    } as unknown as SessionRepository;

    const promptService = {
      selectTemplate: vi.fn(async () => ({
        id: 'p1',
        name: 'default',
        template_text: 'T {{TOOLS_DEFINITIONS}}',
        scenario: 'default',
        created_at: 0,
      })),
      render: vi.fn(() => 'system-prompt'),
    };

    const user: UserRow = {
      id: 'u1',
      name: 'User',
      email: null,
      ai_nickname: 'Bot',
      created_at: 0,
      preferences_json: null,
    };

    const svc = new ChatService(
      llm,
      promptService as never,
      new RuleBasedIntentClassifier(),
      conversationRepo,
      sessionRepo,
      new ToolRegistry(),
      null,
    );

    const stream = svc.handleMessageStream({
      user,
      userInput: 'hello',
      sessionId: 'sess-1',
      sessionTitleSource: 'auto',
    });

    const reader = stream.getReader();
    const dec = new TextDecoder();
    let acc = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += dec.decode(value, { stream: true });
    }

    expect(acc).toContain('event: intention');
    expect(acc).toContain('event: token');
    expect(acc).toContain('event: done');
    expect(conversationRepo.insert).toHaveBeenCalled();
    expect(sessionRepo.touchUpdatedAt).toHaveBeenCalledWith('sess-1', 'u1');
  });
});
