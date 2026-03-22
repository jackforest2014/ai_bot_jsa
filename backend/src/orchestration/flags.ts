import type { Env } from '../env';

export function isOrchestrationEnabled(env: Pick<Env, 'ORCHESTRATION_ENABLED'>): boolean {
  const v = env.ORCHESTRATION_ENABLED?.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}
