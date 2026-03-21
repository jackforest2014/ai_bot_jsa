import { createGeminiProvider, hasGeminiConfig, type GeminiEnv } from './gemini-provider';
import { createQwenProvider, hasQwenConfig, type QwenDashScopeEnv } from './qwen-provider';
import type { LLMProvider } from './types';

/** Worker `Env` 中与 LLM 调度相关的子集 */
export type LlmDispatcherEnv = GeminiEnv & QwenDashScopeEnv & { LLM_PROVIDER?: string };

export function resolveLlmProviderKind(env: LlmDispatcherEnv): 'gemini' | 'qwen' {
  const p = (env.LLM_PROVIDER ?? 'gemini').trim().toLowerCase();
  if (p === 'qwen' || p === 'dashscope') return 'qwen';
  return 'gemini';
}

export function hasLlmConfigured(env: LlmDispatcherEnv): boolean {
  return resolveLlmProviderKind(env) === 'qwen' ? hasQwenConfig(env) : hasGeminiConfig(env);
}

export function createLlmProvider(
  env: LlmDispatcherEnv,
  fetchImpl?: typeof fetch,
): LLMProvider | null {
  if (resolveLlmProviderKind(env) === 'qwen') {
    return createQwenProvider(env, fetchImpl);
  }
  return createGeminiProvider(env, fetchImpl);
}
