import type { LLMProvider } from '../llm/types';
import { runGraphOfThoughtsLite } from '../lib/graph-of-thoughts-lite';
import type { Tool } from './tool-registry';

function clampInt(n: unknown, fallback: number, min: number, max: number): number {
  const x = typeof n === 'number' ? n : typeof n === 'string' ? Number.parseInt(n, 10) : NaN;
  if (!Number.isFinite(x)) return Math.min(Math.max(fallback, min), max);
  return Math.min(Math.max(Math.floor(x), min), max);
}

/**
 * 轻量 TOT：多候选思路 → 评分择优 → 展开成最终答案（技术方案 §9.4，默认不注册）。
 */
export function createTotTool(llm: LLMProvider): Tool {
  return {
    name: 'tree_of_thoughts',
    description:
      '树状思考：适合需要多路径探索的难题。会多次调用模型，token 与延迟较高；请谨慎用于真正复杂的推理题。',
    parametersSchema: {
      type: 'object',
      properties: {
        problem: { type: 'string', description: '需要解决的问题' },
        depth: { type: 'number', description: '探索深度 2～3（默认 2）' },
        branchFactor: { type: 'number', description: '每步分支数 2～3（默认 2）' },
      },
      required: ['problem'],
    },
    async execute(argsJson) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return { output: JSON.stringify({ ok: false, error: 'invalid_json' }) };
      }
      const problem = typeof args.problem === 'string' ? args.problem.trim() : '';
      if (!problem) {
        return { output: JSON.stringify({ ok: false, error: 'problem_required' }) };
      }
      const depth = clampInt(args.depth, 2, 2, 3);
      const branchFactor = clampInt(args.branchFactor, 2, 2, 3);

      const branches = await llm.chat(
        [
          {
            role: 'user',
            content: `问题：${problem}\n\n请给出 ${branchFactor} 条不同的解决思路（编号 1-${branchFactor}），每条一行，中文，不要解释格式。`,
          },
        ],
        undefined,
      );

      const evalPrompt =
        depth >= 3
          ? `问题：${problem}\n候选思路：\n${branches.content}\n\n请判断哪一条最有希望，只输出编号 1-${branchFactor} 的整数。`
          : `问题：${problem}\n候选思路：\n${branches.content}\n\n请简要说明最优一条的编号（1-${branchFactor}）及理由（2～3 句）。`;

      const picked = await llm.chat([{ role: 'user', content: evalPrompt }], undefined);

      const final = await llm.chat(
        [
          {
            role: 'user',
            content: `问题：${problem}\n候选思路：\n${branches.content}\n中间评估：\n${picked.content}\n\n请基于最优思路给出完整、可执行的最终答案（中文）。`,
          },
        ],
        undefined,
      );

      return {
        output: JSON.stringify({
          ok: true,
          mode: 'tree_of_thoughts',
          branches: branches.content,
          evaluation: picked.content,
          answer: final.content ?? '',
        }),
      };
    },
  };
}

/**
 * 轻量 GOT：多轮交叉校验后综合（技术方案 §9.4，默认不注册）。
 */
export function createGotTool(llm: LLMProvider): Tool {
  return {
    name: 'graph_of_thoughts',
    description:
      '图状思考：多轮推敲与交叉验证后综合结论。会多次调用模型；请谨慎用于复杂分析题。',
    parametersSchema: {
      type: 'object',
      properties: {
        problem: { type: 'string', description: '需要解决的问题' },
        iterations: { type: 'number', description: '推敲轮数 2～4（默认 3）' },
      },
      required: ['problem'],
    },
    async execute(argsJson) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        return { output: JSON.stringify({ ok: false, error: 'invalid_json' }) };
      }
      const problem = typeof args.problem === 'string' ? args.problem.trim() : '';
      if (!problem) {
        return { output: JSON.stringify({ ok: false, error: 'problem_required' }) };
      }
      const iterations = clampInt(args.iterations, 3, 2, 4);
      const { trace, answer } = await runGraphOfThoughtsLite(llm, { problem, iterations });

      return {
        output: JSON.stringify({
          ok: true,
          mode: 'graph_of_thoughts',
          trace,
          answer,
        }),
      };
    },
  };
}

export function isTotGotToolsEnabled(env: { ENABLE_TOT_GOT_TOOLS?: string }): boolean {
  const v = env.ENABLE_TOT_GOT_TOOLS?.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}
