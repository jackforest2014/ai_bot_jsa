import type { FileStorageEnv } from './storage';
import type { QdrantEnv } from './vector';
import type { GeminiEnv } from './llm';

export type SerperEnv = {
  SERPER_API_KEY?: string;
  /** 单日 Serper 成功调用软上限（字符串数字，见 wrangler [vars]） */
  SERPER_DAILY_SOFT_LIMIT?: string;
};

export type Env = FileStorageEnv &
  QdrantEnv &
  GeminiEnv &
  SerperEnv & {
    task_assistant_db: D1Database;
    LLM_PROVIDER: string;
    LLM_MODEL: string;
  };
