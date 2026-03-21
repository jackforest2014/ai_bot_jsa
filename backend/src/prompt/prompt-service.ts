import type { ToolDefinition } from '../llm/types';
import { PromptRepository, type PromptTemplateRow } from '../db';

export type PromptRenderInput = {
  userName: string;
  userEmail: string;
  aiNickname: string;
  tools: ToolDefinition[];
  /** 原始 `users.preferences_json`；由本类格式化为摘要与展示块 */
  preferencesJson?: string | null;
};

/** 供模板 `{{PREFERENCES_SUMMARY}}`：多行短列表；无数据时为空串 */
export function formatPreferencesSummary(raw: string | null | undefined): string {
  if (!raw?.trim()) return '';
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(o)
      .map(([k, v]) => `- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join('\n');
  } catch {
    return raw.trim().slice(0, 500);
  }
}

export class PromptService {
  constructor(private readonly prompts: PromptRepository) {}

  async selectTemplate(intention: string): Promise<PromptTemplateRow> {
    const byIntent = await this.prompts.findByScenario(intention);
    if (byIntent) return byIntent;
    const fallback = await this.prompts.findByScenario('default');
    if (fallback) return fallback;
    const list = await this.prompts.list();
    const first = list[0];
    if (!first) {
      throw new Error('No prompt_templates in database');
    }
    return first;
  }

  render(templateText: string, input: PromptRenderInput): string {
    const toolsJson = JSON.stringify(
      input.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
      null,
      2,
    );
    const preferencesSummary = formatPreferencesSummary(input.preferencesJson);
    const preferencesBlock = preferencesSummary
      ? `\n\n【用户偏好】\n${preferencesSummary}`
      : '';

    const vars: Record<string, string> = {
      USER_NAME: input.userName,
      USER_EMAIL: input.userEmail,
      AI_NICKNAME: input.aiNickname,
      TOOLS_DEFINITIONS: toolsJson,
      PREFERENCES_SUMMARY: preferencesSummary,
      PREFERENCES_BLOCK: preferencesBlock,
    };
    return templateText.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
  }
}
