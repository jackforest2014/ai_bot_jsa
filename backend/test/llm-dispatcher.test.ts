import { describe, it, expect } from 'vitest';
import {
  createLlmProvider,
  hasLlmConfigured,
  resolveLlmProviderKind,
} from '../src/llm/create-llm';

describe('LLM dispatcher', () => {
  it('detects missing config', () => {
    expect(hasLlmConfigured({ LLM_PROVIDER: 'gemini' } as never)).toBe(false);
    expect(createLlmProvider({ LLM_PROVIDER: 'gemini' } as never)).toBeNull();
  });

  it('resolveLlmProviderKind', () => {
    expect(resolveLlmProviderKind({ LLM_PROVIDER: 'qwen' } as never)).toBe('qwen');
    expect(resolveLlmProviderKind({ LLM_PROVIDER: 'gemini' } as never)).toBe('gemini');
  });
});
