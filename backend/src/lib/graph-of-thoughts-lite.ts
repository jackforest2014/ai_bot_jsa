import type { LLMProvider } from '../llm/types';

const DEFAULT_ITERATIONS = 3;
export const GOT_LITE_ITER_MIN = 2;
export const GOT_LITE_ITER_MAX = 4;

function clampIterations(n: unknown): number {
  const x = typeof n === 'number' ? n : typeof n === 'string' ? Number.parseInt(n, 10) : NaN;
  if (!Number.isFinite(x)) return DEFAULT_ITERATIONS;
  return Math.min(Math.max(Math.floor(x), GOT_LITE_ITER_MIN), GOT_LITE_ITER_MAX);
}

export type GraphOfThoughtsLiteResult = {
  trace: string;
  answer: string;
  iterationsUsed: number;
};

/**
 * 轻量 GOT：库级调用（阶段 5），与 `graph_of_thoughts` 工具同源逻辑。
 * `iterations` 推敲轮数限制在 [GOT_LITE_ITER_MIN, GOT_LITE_ITER_MAX]，防止 Workers CPU 触顶。
 */
export async function runGraphOfThoughtsLite(
  llm: LLMProvider,
  opts: { problem: string; iterations?: number },
): Promise<GraphOfThoughtsLiteResult> {
  const problem = opts.problem.trim();
  if (!problem) {
    return { trace: '', answer: '', iterationsUsed: 0 };
  }
  const iterations = clampIterations(opts.iterations);

  let state = '';
  const r1 = await llm.chat(
    [{ role: 'user', content: `问题：${problem}\n请给出初步分析与要点（中文）。` }],
    undefined,
  );
  state = r1.content ?? '';

  for (let i = 1; i < iterations; i++) {
    const step = await llm.chat(
      [
        {
          role: 'user',
          content: `问题：${problem}\n已有分析：\n${state}\n\n请指出漏洞、对立观点或遗漏，并补充修正后的要点（中文，简洁）。`,
        },
      ],
      undefined,
    );
    state = `${state}\n---\n轮次 ${i + 1}：${step.content ?? ''}`;
  }

  const syn = await llm.chat(
    [
      {
        role: 'user',
        content: `问题：${problem}\n以下为多轮推敲记录：\n${state}\n\n请输出最终综合结论（中文，条理清晰）。`,
      },
    ],
    undefined,
  );

  return {
    trace: state,
    answer: syn.content ?? '',
    iterationsUsed: iterations,
  };
}

/** 注入主对话 system 时的长度上限（避免撑爆上下文） */
export function formatGotBlockForSystem(
  r: GraphOfThoughtsLiteResult,
  maxAnswerChars = 2000,
  maxTraceChars = 4000,
): string {
  const a = r.answer.trim().slice(0, maxAnswerChars);
  const t = r.trace.trim().slice(0, maxTraceChars);
  if (!a && !t) return '';
  return (
    `【编排内 GOT 简报·供推理参考】\n` +
    (a ? `结论摘要：\n${a}\n` : '') +
    (t ? `推敲摘录：\n${t}\n` : '') +
    `（回答用户时请自然转述要点，勿复读本块标题。）`
  );
}
