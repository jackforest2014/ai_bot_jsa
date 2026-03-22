import { describe, it, expect } from 'vitest';
import { clampSessionTitle, SESSION_TITLE_MAX_LEN } from '../src/lib/session-title';

describe('clampSessionTitle', () => {
  it('trims decoration and caps length', () => {
    expect(clampSessionTitle('  「测试标题」  ')).toBe('测试标题');
    const long = '一二三四五六七八九十1112131415161718192021222324252627282930超出的';
    expect(Array.from(clampSessionTitle(long)).length).toBeLessThanOrEqual(SESSION_TITLE_MAX_LEN);
    expect(clampSessionTitle(long).length).toBe(SESSION_TITLE_MAX_LEN);
  });
});
