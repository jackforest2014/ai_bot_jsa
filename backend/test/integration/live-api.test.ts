import { describe, it, expect } from 'vitest';

/**
 * 可选「真机」探测：先 `npm run dev`（backend），再设 `TEST_API_BASE=http://127.0.0.1:8787` 运行。
 * CI 默认跳过。
 */
describe('live API', () => {
  const base = process.env.TEST_API_BASE?.replace(/\/$/, '');

  it.skipIf(!base)('GET /health', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.ok).toBe(true);
    const j = (await res.json()) as { status?: string };
    expect(j.status).toBe('ok');
  });
});
