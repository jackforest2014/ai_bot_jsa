import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractSerperItemsForMeta } from '../src/serper/serper-client';

vi.mock('../src/serper/serper-client', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/serper/serper-client')>();
  return {
    ...mod,
    serperRequest: vi.fn(async () => ({ organic: [{ title: 'Hit', link: 'https://x', snippet: 's' }] })),
    extractSerperItemsForMeta: vi.fn(() => [{ title: 'Hit', link: 'https://x', snippet: 's' }]),
  };
});

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

  it('maps Serper imageUrl to image_url for images search', async () => {
    vi.mocked(extractSerperItemsForMeta).mockReturnValueOnce([
      {
        title: 'Fireworks',
        link: 'https://example.com/page',
        imageUrl: 'https://cdn.example/photo.jpg',
      },
    ]);
    const repo = {
      getCount: vi.fn(async () => 0),
      incrementSuccess: vi.fn(async () => {}),
    };
    const quota = new SerperQuotaService(repo as never, 100);
    const tool = createSearchTool({ apiKey: 'k', quota });

    const r = await tool.execute(JSON.stringify({ query: 'q', type: 'images' }), {
      userId: 'u1',
    });
    const body = JSON.parse(r.output) as {
      ok: boolean;
      items?: { image_url?: string; link?: string }[];
    };
    expect(body.ok).toBe(true);
    expect(body.items?.[0]?.image_url).toBe('https://cdn.example/photo.jpg');
    expect(body.items?.[0]?.link).toBe('https://example.com/page');
  });
});
