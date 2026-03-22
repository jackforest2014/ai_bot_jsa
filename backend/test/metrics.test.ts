import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recordMetric } from '../src/observability/metrics';

describe('recordMetric', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs analytics_metric line', () => {
    recordMetric('test_event', { a: 1 });
    expect(console.log).toHaveBeenCalled();
    const line = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const o = JSON.parse(line) as { msg?: string; metric?: string; a?: number };
    expect(o.msg).toBe('analytics_metric');
    expect(o.metric).toBe('test_event');
    expect(o.a).toBe(1);
  });
});
