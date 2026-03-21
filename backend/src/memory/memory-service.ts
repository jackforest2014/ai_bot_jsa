import type { LLMProvider } from '../llm/types';
import type { MemoryVectorPayload, VectorStore } from '../vector/vector-store';

export type MemoryEntryType = 'conversation' | 'document';

/** 写入 Qdrant payload 的扩展字段（§4.2） */
export type MemoryAddMetadata = {
  file_id?: string;
  filename?: string;
  semantic_type?: string;
  folder_path?: string;
  tags?: string[];
};

export type MemoryRetrieveOptions = {
  limit?: number;
  /**
   * Cosine 相似度下限（Qdrant 返回的 score，越大越相似）。
   * 技术方案 §8.2.2 示例为 0.75；设为 `0` 可关闭过滤。
   */
  minScore?: number;
  semantic_type?: string;
  /** 非空时按 payload 精确匹配 */
  folder_path?: string;
  /** 与 payload.tags（数组）配合：Qdrant `match.any` */
  tags?: string[];
};

export type MemoryHit = {
  source: string;
  score?: number;
  payload: Record<string, unknown>;
};

/** 供 SSE `citation` 与系统提示拼装（技术方案 §8.2.2） */
export type MemoryRagCitation = {
  kind: 'document' | 'conversation';
  file_id?: string;
  filename?: string;
  semantic_type?: string;
  excerpt: string;
  score?: number;
};

const DEFAULT_LIMIT = 5;
const DEFAULT_MIN_SCORE = 0.75;

export class MemoryService {
  constructor(
    private readonly vectorStore: VectorStore,
    private readonly embedder: LLMProvider,
  ) {}

  /**
   * 向量化 query，在 Qdrant 中按 `user_id` 及可选条件检索，返回 `source` 文本列表。
   */
  async retrieve(
    query: string,
    userId: string,
    options?: MemoryRetrieveOptions,
  ): Promise<string[]> {
    const hits = await this.retrieveWithScores(query, userId, options);
    return hits.map((h) => h.source);
  }

  /** 同 `retrieve`，保留 score / payload 供上层调试或排序 */
  async retrieveWithScores(
    query: string,
    userId: string,
    options?: MemoryRetrieveOptions,
  ): Promise<MemoryHit[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const vector = await this.embedder.embed(trimmed);
    const filter = buildRetrieveFilter(userId, options);
    const limit = options?.limit ?? DEFAULT_LIMIT;
    const minScore = options?.minScore ?? DEFAULT_MIN_SCORE;

    const rawLimit = minScore > 0 ? Math.max(limit * 4, limit) : limit;
    const results = await this.vectorStore.search(vector, filter, rawLimit);

    const scored = results
      .map((r) => {
        const payload = r.payload as Record<string, unknown>;
        const source = String(
          (payload as MemoryVectorPayload).source ?? payload.source ?? '',
        ).trim();
        return {
          source,
          score: r.score,
          payload,
        };
      })
      .filter((h) => h.source);

    const filtered =
      minScore <= 0
        ? scored
        : scored.filter((h) => (h.score ?? 0) >= minScore);

    return filtered.slice(0, limit);
  }

  /**
   * 将向量化后的片段写入向量库；`timestamp` 为 Unix 秒。
   */
  async addToMemory(
    text: string,
    userId: string,
    type: MemoryEntryType,
    metadata?: MemoryAddMetadata,
  ): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const vector = await this.embedder.embed(trimmed);
    const ts = Math.floor(Date.now() / 1000);

    const payload: MemoryVectorPayload = {
      user_id: userId,
      type,
      source: trimmed,
      timestamp: ts,
      file_id: metadata?.file_id,
      semantic_type: metadata?.semantic_type,
      folder_path: metadata?.folder_path?.trim() || undefined,
      tags: metadata?.tags?.length ? metadata.tags : undefined,
    };

    await this.vectorStore.upsert([
      {
        id: crypto.randomUUID(),
        vector,
        payload,
      },
    ]);
  }

  /**
   * 检索并格式化为 Chat 注入块 + 前端 `citation` 列表。
   * `filename` 仅当 payload 扩展字段存在时带出（否则可只用 `file_id`）。
   */
  async retrieveForRag(
    query: string,
    userId: string,
    options?: MemoryRetrieveOptions,
  ): Promise<{ citations: MemoryRagCitation[]; ragContextBlock: string }> {
    const hits = await this.retrieveWithScores(query, userId, options);
    const citations: MemoryRagCitation[] = hits.map((h) => {
      const p = h.payload as MemoryVectorPayload;
      const kind = p.type === 'document' ? 'document' : 'conversation';
      const excerpt = h.source.length > 500 ? `${h.source.slice(0, 500)}…` : h.source;
      return {
        kind,
        file_id: p.file_id,
        filename: p.filename,
        semantic_type: p.semantic_type,
        excerpt,
        score: h.score,
      };
    });

    const lines = hits.map((h, i) => {
      const label = (h.score ?? 0).toFixed(3);
      const snippet = h.source.length > 500 ? `${h.source.slice(0, 500)}…` : h.source;
      return `- 片段${i + 1}（相似度 ${label}）：${snippet}`;
    });
    const ragContextBlock = lines.length ? `相关历史记忆：\n${lines.join('\n')}` : '';

    return { citations, ragContextBlock };
  }
}

function buildRetrieveFilter(
  userId: string,
  options?: MemoryRetrieveOptions,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    user_id: userId,
  };
  if (options?.semantic_type?.trim()) {
    filter.semantic_type = options.semantic_type.trim();
  }
  if (options?.folder_path !== undefined && options.folder_path.trim() !== '') {
    filter.folder_path = options.folder_path.trim();
  }
  if (options?.tags?.length) {
    filter.tags = options.tags.map((t) => t.trim()).filter(Boolean);
  }
  return filter;
}
