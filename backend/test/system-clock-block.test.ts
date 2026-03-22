import { describe, it, expect } from 'vitest';
import {
  shanghaiCalendarUtcNoon,
  formatShanghaiDateWeekdayShort,
  buildShanghaiRelativeDayTable,
} from '../src/chat/system-clock-block';

/** 2026-03-22 东八区正午 → 该日在上海为 3 月 22 日 */
const SHANGHAI_2026_03_22 = new Date('2026-03-22T04:00:00.000Z').getTime();

describe('system-clock-block relative Shanghai dates', () => {
  it('后天为 3 月 24 日周二（非周一）', () => {
    const t2 = shanghaiCalendarUtcNoon(SHANGHAI_2026_03_22, 2);
    expect(formatShanghaiDateWeekdayShort(t2)).toMatch(/2026年3月24日周二/);
  });

  it('自 3 月 22 日起第 5 天为 3 月 27 日周五（非周四）', () => {
    const t5 = shanghaiCalendarUtcNoon(SHANGHAI_2026_03_22, 5);
    expect(formatShanghaiDateWeekdayShort(t5)).toMatch(/2026年3月27日周五/);
  });

  it('相对日表含明天、后天与第 5 天', () => {
    const table = buildShanghaiRelativeDayTable(SHANGHAI_2026_03_22, 6);
    expect(table).toContain('后天：');
    expect(table).toContain('2026年3月24日周二');
    expect(table).toContain('2026年3月27日周五');
  });
});
