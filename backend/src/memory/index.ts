import { createLlmProvider, hasLlmConfigured, type LlmDispatcherEnv } from '../llm';
import { createQdrantStore, hasQdrantConfig, type QdrantEnv } from '../vector';
import { MemoryService } from './memory-service';

export type {
  MemoryAddMetadata,
  MemoryEntryType,
  MemoryHit,
  MemoryRagCitation,
  MemoryRetrieveOptions,
} from './memory-service';
export { MemoryService } from './memory-service';

export type MemoryServiceEnv = QdrantEnv & LlmDispatcherEnv;

export function hasMemoryServiceConfig(env: MemoryServiceEnv): boolean {
  return hasQdrantConfig(env) && hasLlmConfigured(env);
}

export function createMemoryService(
  env: MemoryServiceEnv,
  fetchImpl?: typeof fetch,
): MemoryService | null {
  const store = createQdrantStore(env, fetchImpl);
  const embedder = createLlmProvider(env, fetchImpl);
  if (!store || !embedder) {
    return null;
  }
  return new MemoryService(store, embedder);
}
