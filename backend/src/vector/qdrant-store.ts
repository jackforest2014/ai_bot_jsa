import type { VectorPoint, VectorStore } from './vector-store';

export type QdrantStoreOptions = {
  baseUrl: string;
  apiKey: string;
  collection: string;
  /** 与 Embedding 模型输出维度一致；upsert/search 时校验向量长度 */
  embeddingDimensions: number;
  fetchImpl?: typeof fetch;
};

type QdrantScoredPoint = {
  id: string | number;
  payload?: Record<string, unknown>;
  vector?: number[] | Record<string, number[]>;
};

/**
 * 使用 Qdrant HTTP API（fetch），无官方 JS 客户端依赖，适配 Cloudflare Workers。
 * @see https://api.qdrant.tech/
 */
export class QdrantStore implements VectorStore {
  private readonly root: string;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly opts: QdrantStoreOptions) {
    this.root = opts.baseUrl.replace(/\/$/, '');
    this.fetchFn = opts.fetchImpl ?? fetch;
  }

  private headers(): Headers {
    const h = new Headers({ 'Content-Type': 'application/json' });
    if (this.opts.apiKey) {
      h.set('api-key', this.opts.apiKey);
    }
    return h;
  }

  private collectionPath(suffix: string): string {
    const name = encodeURIComponent(this.opts.collection);
    return `${this.root}/collections/${name}${suffix}`;
  }

  async upsert(points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;
    const { embeddingDimensions } = this.opts;
    for (const p of points) {
      if (p.vector.length !== embeddingDimensions) {
        throw new Error(
          `Vector dimension mismatch: expected ${embeddingDimensions}, got ${p.vector.length} (point id=${p.id})`,
        );
      }
    }

    const body = {
      points: points.map((p) => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload as Record<string, unknown>,
      })),
    };

    const res = await this.fetchFn(this.collectionPath('/points?wait=true'), {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Qdrant upsert failed: ${res.status} ${text}`);
    }
  }

  async search(
    vector: number[],
    filter?: Record<string, unknown>,
    limit = 10,
  ): Promise<VectorPoint[]> {
    if (vector.length !== this.opts.embeddingDimensions) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.opts.embeddingDimensions}, got ${vector.length}`,
      );
    }

    const qdrantFilter = filter ? toQdrantFilter(filter) : undefined;
    const body: Record<string, unknown> = {
      vector,
      limit,
      with_payload: true,
      with_vector: true,
    };
    if (qdrantFilter !== undefined) {
      body.filter = qdrantFilter;
    }

    const res = await this.fetchFn(this.collectionPath('/points/search'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Qdrant search failed: ${res.status} ${text}`);
    }

    const json = (await res.json()) as { result?: QdrantScoredPoint[] };
    const rows = json.result ?? [];
    return rows.map((hit) => normalizeHit(hit));
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const res = await this.fetchFn(this.collectionPath('/points/delete?wait=true'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ points: ids }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Qdrant delete failed: ${res.status} ${text}`);
    }
  }

  /** GET /collections/{name}，用于健康检查 */
  async getCollectionInfo(): Promise<{ status?: string; points_count?: number }> {
    const res = await this.fetchFn(this.collectionPath(''), {
      method: 'GET',
      headers: this.headers(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Qdrant get collection failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as {
      result?: { status?: string; points_count?: number };
    };
    return json.result ?? {};
  }
}

function normalizeHit(hit: QdrantScoredPoint): VectorPoint {
  const id = String(hit.id);
  let vec: number[] = [];
  if (Array.isArray(hit.vector)) {
    vec = hit.vector;
  } else if (hit.vector && typeof hit.vector === 'object') {
    const first = Object.values(hit.vector)[0];
    if (Array.isArray(first)) vec = first;
  }
  return {
    id,
    vector: vec,
    payload: (hit.payload ?? {}) as VectorPoint['payload'],
  };
}

/**
 * 将简易 filter 转为 Qdrant Filter；支持原生结构透传。
 * 无有效条件时返回 `undefined`，避免向 Qdrant 发送空 filter。
 */
export function toQdrantFilter(
  filter: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if ('must' in filter || 'should' in filter || 'must_not' in filter) {
    return filter;
  }

  const must: unknown[] = [];
  for (const [key, raw] of Object.entries(filter)) {
    if (raw === undefined || raw === null) continue;
    if (Array.isArray(raw)) {
      must.push({ key, match: { any: raw } });
    } else {
      must.push({ key, match: { value: raw } });
    }
  }
  return must.length ? { must } : undefined;
}

/** Worker / wrangler 环境片段 */
export type QdrantEnv = {
  QDRANT_URL?: string;
  QDRANT_API_KEY?: string;
  QDRANT_COLLECTION?: string;
  /** 与 vars 一致时常为字符串，如 "768" */
  EMBEDDING_DIMENSIONS?: string;
};

export function parseEmbeddingDimensions(env: QdrantEnv): number {
  const raw = env.EMBEDDING_DIMENSIONS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 768;
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid EMBEDDING_DIMENSIONS: ${env.EMBEDDING_DIMENSIONS}`);
  }
  return n;
}

export function hasQdrantConfig(env: QdrantEnv): boolean {
  return !!(env.QDRANT_URL?.trim() && env.QDRANT_API_KEY?.trim());
}

export function createQdrantStore(env: QdrantEnv, fetchImpl?: typeof fetch): QdrantStore | null {
  if (!hasQdrantConfig(env)) {
    return null;
  }
  const baseUrl = env.QDRANT_URL!.trim();
  const apiKey = env.QDRANT_API_KEY!.trim();
  const collection = env.QDRANT_COLLECTION?.trim() || 'memory';
  const embeddingDimensions = parseEmbeddingDimensions(env);

  return new QdrantStore({
    baseUrl,
    apiKey,
    collection,
    embeddingDimensions,
    fetchImpl,
  });
}
