import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/serper/serper-client', () => ({
  serperRequest: vi.fn(async () => ({ organic: [{ title: 'Hit', link: 'https://x', snippet: 's' }] })),
  extractSerperItemsForMeta: vi.fn(() => [{ title: 'Hit', link: 'https://x', snippet: 's' }]),
}));

import { createSearchTool } from '../src/tools/search-tool';
import { SerperQuotaService } from '../src/serper/serper-quota';

describe('createSearchTool (mocked Serper)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records quota and returns items', async () => {
    const repo = {
      getCount: vi.fn(async () => 0),
      incrementSuccess: vi.fn(async () => {}),
    };
    const quota = new SerperQuotaService(repo as never, 100);
    const tool = createSearchTool({ apiKey: 'k', quota });

    const r = await tool.execute(JSON.stringify({ query: 'q', type: 'organic' }), {
      userId: 'u1',
    });
    const body = JSON.parse(r.output) as { ok: boolean; items?: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.items?.length).toBeGreaterThan(0);
    expect(repo.incrementSuccess).toHaveBeenCalled();
  });
});
