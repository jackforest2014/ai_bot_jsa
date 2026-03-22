/**
 * 进程内 Agent 通信预留（§9.9.8）：**非分布式**，仅同 Worker。
 * v1 Orchestrator 可直接函数调用子 Runner，不强制经过 Bus。
 */

export type AgentId =
  | 'orchestrator'
  | 'task_agent'
  | 'route_agent'
  | 'search_agent'
  | 'research_agent'
  | string;

/** 只读快照，避免子 Agent 共享可变引用 */
export type AgentEnvelopePayload = Record<string, unknown>;

export interface AgentEnvelope {
  from: AgentId;
  to: AgentId;
  correlation_id: string;
  session_id: string;
  user_id: string;
  payload: AgentEnvelopePayload;
}

export interface AgentBus {
  publish(envelope: AgentEnvelope): void;
}

/** 默认实现：可打 debug 日志或 no-op，便于日后换内存队列/订阅 */
export class NoOpAgentBus implements AgentBus {
  publish(_envelope: AgentEnvelope): void {
    /* 预留：后续可改为 logger.debug 或内存队列 */
  }
}

export function createAgentBus(): AgentBus {
  return new NoOpAgentBus();
}
