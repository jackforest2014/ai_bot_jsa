import { PlannerService } from '../planner/planner-service';
import type { LLMProvider } from '../llm/types';
import type { Tool } from './tool-registry';
import type { ToolContext } from './tool-registry';

export type PlanResearchToolOptions = {
  llm: LLMProvider;
  searchTool: Tool;
};

/**
 * 主 Agent 通过本工具触发 PlannerService；内部 search 与 SearchTool 共用 Serper 配额。
 */
export function createPlanResearchTool(opts: PlanResearchToolOptions): Tool {
  return {
    name: 'plan_research',
    description:
      '对复杂课题做「深度研究」：自动拆分子问题、逐条联网检索并汇总成结构化报告。耗时与 Serper 用量较高，仅在用户明确需要深度调研/综述时使用。',
    parametersSchema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: '研究目标或用户问题全文（将拆解为多条检索子任务）',
        },
      },
      required: ['goal'],
    },
    async execute(argsJson, ctx: ToolContext) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return { output: JSON.stringify({ ok: false, error: 'invalid_json' }) };
      }
      const goal = typeof args.goal === 'string' ? args.goal.trim() : '';
      if (!goal) {
        return { output: JSON.stringify({ ok: false, error: 'goal_required' }) };
      }

      try {
        const planner = new PlannerService({ llm: opts.llm, searchTool: opts.searchTool });
        const report = await planner.planAndExecute(goal, ctx);
        return {
          output: JSON.stringify({
            ok: true,
            report,
          }),
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          output: JSON.stringify({
            ok: false,
            code: 'plan_research_failed',
            message,
          }),
        };
      }
    },
  };
}
