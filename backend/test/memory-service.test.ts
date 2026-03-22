import { describe, it, expect, vi } from 'vitest';
import { MemoryService } from '../src/memory/memory-service';
import type { VectorStore } from '../src/vector/vector-store';
import type { LLMProvider } from '../src/llm/types';

describe('MemoryService.retrieveWithScores', () => {
  it('applies semantic_type filter to search', async () => {
    let seenFilter: Record<string, unknown> | undefined;
    const vectorStore: VectorStore = {
      async search(_vec, filter, limit) {
        void limit;
        seenFilter = filter;
        return [
          {
            id: '1',
            vector: [],
            payload: {
              user_id: 'u1',
              type: 'document',
              source: 'chunk text',
              timestamp: 1,
              semantic_type: 'resume',
            },
            score: 0.9,
          },
        ];
      },
      upsert: vi.fn(),
      delete: vi.fn(),
    };
    const embedder: LLMProvider = {
      chat: vi.fn(),
      chatStream: vi.fn(),
      streamChat: vi.fn(),
      embed: vi.fn(async () => [0.1, 0.2, 0.3]),
    };
    const mem = new MemoryService(vectorStore, embedder);
    await mem.retrieveWithScores('q', 'u1', { semantic_type: 'resume', minScore: 0 });
    expect(seenFilter).toMatchObject({ user_id: 'u1', semantic_type: 'resume' });
  });
});
