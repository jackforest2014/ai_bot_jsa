import type { LLMMessage, LLMProvider } from '../llm/types';
import type { Tool, ToolContext } from '../tools/tool-registry';
import { toolCallKey } from '../tools/tool-registry';

const MAX_SUBAGENT_TOOL_ROUNDS = 8;

/**
 * 单个子研究任务：仅用 search 工具做多轮 ReAct（技术方案 §9.3）。
 */
export class SubAgent {
  constructor(
    private readonly llm: LLMProvider,
    private readonly searchTool: Tool,
  ) {}

  async execute(task: string, ctx: ToolContext): Promise<string> {
    const searchDef = {
      name: this.searchTool.name,
      description: this.searchTool.description,
      parameters: this.searchTool.parametersSchema,
    };

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `你是研究子代理。必须调用 search 工具检索公开资料后再下结论。\n子任务：${task}\n用中文作答，概括搜索要点；若无结果请说明。`,
      },
    ];

    for (let i = 0; i < MAX_SUBAGENT_TOOL_ROUNDS; i++) {
      const r = await this.llm.chat(messages, [searchDef]);
      if (!r.tool_calls?.length) {
        const t = (r.content ?? '').trim();
        return t || '（模型未返回可读结论）';
      }

      messages.push({
        role: 'assistant',
        content: r.content ?? '',
        tool_calls: r.tool_calls,
      });

      for (const tc of r.tool_calls) {
        const out = await this.searchTool.execute(tc.arguments, ctx);
        messages.push({
          role: 'tool',
          content: out.output,
          tool_call_id: toolCallKey(tc.name, tc.id),
        });
      }
    }

    return '（子代理检索轮次已达上限，请缩小子任务范围。）';
  }
}

export type PlannerServiceDeps = {
  llm: LLMProvider;
  searchTool: Tool;
};

/**
 * 深度研究：拆分子任务 → SubAgent（内部 search 走同一 Serper 配额计数）→ 汇总报告。
 */
export class PlannerService {
  constructor(private readonly deps: PlannerServiceDeps) {}

  async planAndExecute(goal: string, ctx: ToolContext): Promise<string> {
    const trimmed = goal.trim();
    if (!trimmed) {
      return '（研究目标为空）';
    }

    const subTasks = await this.generateSubTasks(trimmed);
    const subAgent = new SubAgent(this.deps.llm, this.deps.searchTool);
    const results: string[] = [];

    for (let i = 0; i < subTasks.length; i++) {
      const task = subTasks[i]!;
      const summary = await subAgent.execute(task, ctx);
      results.push(`【子任务 ${i + 1}】${task}\n${summary}`);
    }

    return this.summarize(trimmed, results);
  }

  private async generateSubTasks(goal: string): Promise<string[]> {
    const r = await this.deps.llm.chat(
      [
        {
          role: 'user',
          content: `研究目标：\n${goal}\n\n请拆成 3～5 条可独立检索的子任务。每行一条，以 "- " 开头，中文，不要其它解释。`,
        },
      ],
      undefined,
    );

    const lines = (r.content ?? '')
      .split('\n')
      .map((l) => l.trim())
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
      .filter(Boolean);

    const tasks = lines.length ? lines : [goal];
    return tasks.slice(0, 6);
  }

  private async summarize(goal: string, sections: string[]): Promise<string> {
    const r = await this.deps.llm.chat(
      [
        {
          role: 'user',
          content: `你是研究员。根据下列子任务搜集结果，围绕目标写一份结构化简要报告（主要发现、分点要点、结论）。目标：\n${goal}\n\n---\n${sections.join('\n\n---\n')}`,
        },
      ],
      undefined,
    );
    return (r.content ?? '').trim() || sections.join('\n\n');
  }
}
