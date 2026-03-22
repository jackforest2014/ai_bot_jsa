import type { LLMProvider } from '../llm/types';
import { recordMetric } from '../observability/metrics';

export type DecomposeStepRaw = { type: string; summary: string };

export type DecomposeResult =
  | { ok: true; steps: DecomposeStepRaw[] }
  | { ok: false; reason: string };

const SYSTEM = `你是对话编排分解器。分析用户**单条**消息是否隐含多个**需分别执行**的子目标（例如：既要「建任务/记日程」又要「查路线」）。

只输出**一个** JSON 对象，不要 markdown 代码块，不要其它文字。
Schema：
{ "steps": [ { "type": "task"|"route"|"research"|"other", "summary": "该子目标的一句中文说明（≤40字）" } ] }

规则：
- 若只有一个清晰目标或只是闲聊，steps 数组**长度必须为 1**。
- 若同时包含「记日程/待办/任务」与「怎么走/路线/导航/从A到B」等，拆成至少 2 步：task + route。
- 不要编造用户未表达的需求；不确定时宁可 steps 长度为 1。
- type 用小写英文：task=任务/日程/待办；route=出行路线；research=明确要深度检索；other=其它独立动作。`;

export function extractJsonObject(text: string): string | null {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  if (fence) {
    const inner = fence[1]?.trim();
    if (inner) return inner;
  }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return null;
}

function normalizeSteps(raw: unknown): DecomposeStepRaw[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const steps = (raw as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return null;
  const out: DecomposeStepRaw[] = [];
  for (const item of steps) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const type = typeof o.type === 'string' ? o.type.trim().toLowerCase() : '';
    const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
    if (!type || !summary) continue;
    out.push({ type, summary: summary.slice(0, 120) });
  }
  return out.length > 0 ? out : null;
}

/**
 * 调用 LLM 分解用户单句；失败或无法解析时 ok:false（上层应 fallback_single_chat）。
 */
export async function decomposeUserSteps(
  llm: LLMProvider,
  userInput: string,
  metrics?: { user_id?: string; session_id?: string },
): Promise<DecomposeResult> {
  const trimmed = userInput.trim().slice(0, 4000);
  if (!trimmed) {
    recordMetric('orchestrator_decompose', {
      ok: false,
      reason: 'empty_input',
      ...metrics,
    });
    return { ok: false, reason: 'empty_input' };
  }
  try {
    const r = await llm.chat(
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `用户原话：\n${trimmed}` },
      ],
      undefined,
    );
    const blob = extractJsonObject(r.content ?? '');
    if (!blob) {
      recordMetric('orchestrator_decompose', { ok: false, reason: 'no_json', ...metrics });
      return { ok: false, reason: 'no_json' };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(blob) as unknown;
    } catch {
      recordMetric('orchestrator_decompose', { ok: false, reason: 'json_parse', ...metrics });
      return { ok: false, reason: 'json_parse' };
    }
    const steps = normalizeSteps(parsed);
    if (!steps) {
      recordMetric('orchestrator_decompose', { ok: false, reason: 'invalid_steps', ...metrics });
      return { ok: false, reason: 'invalid_steps' };
    }
    recordMetric('orchestrator_decompose', {
      ok: true,
      step_count: steps.length,
      ...metrics,
    });
    return { ok: true, steps };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    recordMetric('orchestrator_decompose', { ok: false, reason: 'llm_error', error: msg, ...metrics });
    return { ok: false, reason: msg };
  }
}
