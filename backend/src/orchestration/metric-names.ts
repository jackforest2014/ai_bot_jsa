/**
 * 多 Agent 编排埋点名称（与 `recordMetric` 配合；阶段 0.3）。
 * OrchestrationService 落地后应在对应节点调用。
 */
export const ORCHESTRATION_METRICS = {
  DECOMPOSE: 'orchestrator_decompose',
  TASK_AGENT_ROUND: 'task_agent_round',
  CONFIRM_TASK_RETRY: 'confirm_task_retry',
  ROUTE_AGENT_START: 'route_agent_start',
  ROUTE_AGENT_COMPLETE: 'route_agent_complete',
  /** 阶段 5：编排内 GOT 预推敲（Task / Route） */
  GOT_TASK: 'orchestrator_got_task',
  GOT_ROUTE: 'orchestrator_got_route',
} as const;
