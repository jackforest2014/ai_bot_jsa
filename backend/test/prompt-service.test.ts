import { describe, it, expect, vi } from 'vitest';
import { PromptService, formatPreferencesSummary } from '../src/prompt/prompt-service';
import type { PromptTemplateRow } from '../src/db';

describe('formatPreferencesSummary', () => {
  it('formats JSON object', () => {
    const s = formatPreferencesSummary(JSON.stringify({ theme: 'dark', n: 1 }));
    expect(s).toContain('theme');
    expect(s).toContain('dark');
  });
  it('empty for null', () => {
    expect(formatPreferencesSummary(null)).toBe('');
  });
});

describe('PromptService.render', () => {
  const template: PromptTemplateRow = {
    id: 'p1',
    name: 't',
    template_text: 'Hi {{USER_NAME}} {{AI_NICKNAME}} {{PREFERENCES_BLOCK}} {{TOOLS_DEFINITIONS}}',
    scenario: 'default',
    created_at: 0,
  };

  it('injects tools and preferences block', () => {
    const repo = {
      findByScenario: vi.fn(),
      list: vi.fn(),
    } as never;
    const svc = new PromptService(repo);
    const out = svc.render(template.template_text, {
      userName: 'U',
      userEmail: '',
      aiNickname: 'Bot',
      tools: [{ name: 'search', description: 'd', parameters: { type: 'object' } }],
      preferencesJson: JSON.stringify({ lang: 'zh' }),
    });
    expect(out).toContain('U');
    expect(out).toContain('Bot');
    expect(out).toContain('search');
    expect(out).toContain('用户偏好');
    expect(out).toContain('lang');
  });
});
