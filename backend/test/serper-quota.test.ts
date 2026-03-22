import { describe, it, expect, vi } from 'vitest';
import { SerperQuotaService, parseSerperDailySoftLimit } from '../src/serper/serper-quota';

describe('parseSerperDailySoftLimit', () => {
  it('parses integer string', () => {
    expect(parseSerperDailySoftLimit('50', 80)).toBe(50);
  });
  it('falls back on invalid', () => {
    expect(parseSerperDailySoftLimit('x', 12)).toBe(12);
  });
  it('allows zero (no cap)', () => {
    expect(parseSerperDailySoftLimit('0', 80)).toBe(0);
  });
});

describe('SerperQuotaService', () => {
  it('blocks when at limit', async () => {
    const repo = {
      getCount: vi.fn(async () => 10),
      incrementSuccess: vi.fn(),
    };
    const q = new SerperQuotaService(repo as never, 10);
    const r = await q.check('u');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.count).toBe(10);
  });

  it('warns near threshold', async () => {
    const repo = { getCount: vi.fn(async () => 8), incrementSuccess: vi.fn() };
    const q = new SerperQuotaService(repo as never, 10);
    const r = await q.check('u');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warning).toBeDefined();
  });
});
