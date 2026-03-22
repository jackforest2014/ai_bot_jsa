import { describe, it, expect } from 'vitest';
import { resolveShanghaiCalendarItems } from '../src/tools/shanghai-calendar-tool';

/** 2026-03-22 东八区当日正午锚附近 */
const NOW_2026_03_22 = new Date('2026-03-22T04:00:00.000Z').getTime();

describe('resolve_shanghai_calendar', () => {
  it('offset 1 = 明天 3月23日周一', () => {
    const r = resolveShanghaiCalendarItems(NOW_2026_03_22, [
      { kind: 'offset', days_from_today: 1, ref: '明天' },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resolved[0]?.date_zh).toMatch(/2026年3月23日周一/);
    expect(r.resolved[0]?.starts_at_unix).toBeLessThan(r.resolved[0]!.ends_at_unix);
  });

  it('next_weekday 周一 = 3月23日（今天为周日）', () => {
    const r = resolveShanghaiCalendarItems(NOW_2026_03_22, [{ kind: 'next_weekday', weekday: 1 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resolved[0]?.date_zh).toMatch(/2026年3月23日周一/);
  });

  it('next_weekday 周五 = 3月27日周五', () => {
    const r = resolveShanghaiCalendarItems(NOW_2026_03_22, [{ kind: 'next_weekday', weekday: 5 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resolved[0]?.date_zh).toMatch(/2026年3月27日周五/);
  });
});
