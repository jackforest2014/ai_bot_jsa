import { describe, it, expect, vi } from 'vitest';
import { decomposeUserSteps, extractJsonObject } from '../src/orchestration/decompose';
import type { LLMProvider } from '../src/llm/types';

const usage = { promptTokens: 1, completionTokens: 1, totalTokens: 2 };

describe('extractJsonObject', () => {
  it('parses raw object', () => {
    expect(extractJsonObject('  {"a":1}  ')).toBe('{"a":1}');
  });

  it('parses fenced json', () => {
    const s = 'Here:\n```json\n{"steps":[]}\n```';
    expect(extractJsonObject(s)).toContain('"steps"');
  });
});

describe('decomposeUserSteps', () => {
  it('returns steps when LLM returns valid JSON', async () => {
    const llm: Pick<LLMProvider, 'chat'> = {
      chat: vi.fn().mockResolvedValue({
        content: '{"steps":[{"type":"task","summary":"建任务"},{"type":"route","summary":"查路线"}]}',
        usage,
      }),
    };
    const r = await decomposeUserSteps(llm as LLMProvider, '25号去苏州并查路线');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.steps).toHaveLength(2);
      expect(r.steps[0]!.type).toBe('task');
    }
  });

  it('returns fail when no json', async () => {
    const llm: Pick<LLMProvider, 'chat'> = {
      chat: vi.fn().mockResolvedValue({ content: 'sorry cannot', usage }),
    };
    const r = await decomposeUserSteps(llm as LLMProvider, 'hello');
    expect(r.ok).toBe(false);
  });
});
