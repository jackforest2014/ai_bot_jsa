function isTruthyEnv(v: string | undefined): boolean {
  const t = v?.trim().toLowerCase();
  return t === 'true' || t === '1' || t === 'yes';
}

/** 阶段 5：编排 Task Agent 内嵌 GOT（多轮 LLM，成本高，默认关） */
export function isTaskAgentGotEnabled(env: { TASK_AGENT_GOT_ENABLED?: string }): boolean {
  return isTruthyEnv(env.TASK_AGENT_GOT_ENABLED);
}

/** 阶段 5：编排 Route 专责轮前 GOT（默认关） */
export function isRouteAgentGotEnabled(env: { ROUTE_AGENT_GOT_ENABLED?: string }): boolean {
  return isTruthyEnv(env.ROUTE_AGENT_GOT_ENABLED);
}
