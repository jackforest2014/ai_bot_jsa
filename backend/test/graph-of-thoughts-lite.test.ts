import { describe, it, expect, vi } from 'vitest';
import {
  GOT_LITE_ITER_MAX,
  GOT_LITE_ITER_MIN,
  formatGotBlockForSystem,
  runGraphOfThoughtsLite,
} from '../src/lib/graph-of-thoughts-lite';
import type { LLMProvider } from '../src/llm/types';

describe('runGraphOfThoughtsLite', () => {
  it('clamps iterations and produces trace + answer', async () => {
    let calls = 0;
    const llm: Pick<LLMProvider, 'chat'> = {
      chat: vi.fn(async () => {
        calls += 1;
        return { content: `p${calls}`, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
      }),
    };
    const r = await runGraphOfThoughtsLite(llm as LLMProvider, {
      problem: '测试问题',
      iterations: 99,
    });
    expect(r.iterationsUsed).toBe(GOT_LITE_ITER_MAX);
    expect(r.trace).toContain('p1');
    expect(r.answer).toContain('p');
    expect(llm.chat).toHaveBeenCalled();
  });

  it('respects minimum iterations', async () => {
    const llm: Pick<LLMProvider, 'chat'> = {
      chat: vi.fn(async () => ({
        content: 'x',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      })),
    };
    const r = await runGraphOfThoughtsLite(llm as LLMProvider, {
      problem: 'q',
      iterations: 1,
    });
    expect(r.iterationsUsed).toBe(GOT_LITE_ITER_MIN);
  });
});

describe('formatGotBlockForSystem', () => {
  it('truncates and includes labels', () => {
    const s = formatGotBlockForSystem(
      { trace: 't'.repeat(100), answer: 'a'.repeat(100), iterationsUsed: 2 },
      10,
      10,
    );
    expect(s).toContain('GOT');
    expect(s.length).toBeLessThan(200);
  });
});
