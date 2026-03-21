import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDb, PromptRepository } from './db';
import {
  createFileStorage,
  hasR2Binding,
  hasR2PresignConfig,
  type FileStorageEnv,
} from './storage';
import {
  createQdrantStore,
  hasQdrantConfig,
  parseEmbeddingDimensions,
  type QdrantEnv,
} from './vector';

export type Env = FileStorageEnv &
  QdrantEnv & {
    task_assistant_db: D1Database;
    LLM_PROVIDER: string;
    LLM_MODEL: string;
  };

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.get('/', (c) =>
  c.json({
    ok: true,
    service: 'ai-task-assistant',
    message: 'Cloudflare Worker + Hono scaffold (task 1.1)',
  }),
);

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    llm_model: c.env.LLM_MODEL,
  }),
);

/** R2 绑定与预签名配置（不发起真实对象请求，避免产生费用） */
app.get('/health/r2', (c) => {
  return c.json({
    binding: hasR2Binding(c.env) ? 'configured' : 'unconfigured',
    presign_credentials: hasR2PresignConfig(c.env) ? 'configured' : 'missing',
    note: 'binding 需在 wrangler.toml 启用 [[r2_buckets]] 并创建同名 bucket；预签名需 R2 S3 API 令牌 + vars（见 README）',
  });
});

/** 可选：绑定 R2 后对测试 key 做一次 head（调试用，默认关闭避免噪声） */
app.get('/health/r2/probe', async (c) => {
  if (!c.env.FILES) {
    return c.json({ ok: false, reason: 'FILES binding missing' }, 503);
  }
  try {
    await c.env.FILES.head('__health_probe_nonexistent__');
    return c.json({ ok: true, head: 'reachable' });
  } catch (e) {
    return c.json(
      {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      },
      500,
    );
  }
});

/** 验证 FileStorage 工厂（无 R2 时为 NullFileStorage） */
app.get('/health/storage', (c) => {
  const storage = createFileStorage(c.env);
  const name = storage.constructor.name;
  return c.json({ implementation: name });
});

/** Qdrant 可达性与 collection 元信息（不写入向量；无配置时 503） */
app.get('/health/qdrant', async (c) => {
  if (!hasQdrantConfig(c.env)) {
    return c.json(
      {
        configured: false,
        hint: '设置 QDRANT_URL + QDRANT_API_KEY（.dev.vars 或 wrangler secret）；可选 QDRANT_COLLECTION、EMBEDDING_DIMENSIONS',
      },
      503,
    );
  }
  try {
    const store = createQdrantStore(c.env);
    if (!store) {
      return c.json({ configured: false }, 503);
    }
    const info = await store.getCollectionInfo();
    return c.json({
      configured: true,
      collection: c.env.QDRANT_COLLECTION?.trim() || 'memory',
      embedding_dimensions: parseEmbeddingDimensions(c.env),
      status: info.status,
      points_count: info.points_count,
    });
  } catch (e) {
    return c.json(
      {
        configured: true,
        reachable: false,
        message: e instanceof Error ? e.message : String(e),
      },
      502,
    );
  }
});

/** 验证 D1 连接与迁移（需已执行 npm run db:apply:local 或 remote） */
app.get('/health/db', async (c) => {
  try {
    await c.env.task_assistant_db.prepare('SELECT 1 AS v').first<{ v: number }>();
    const db = getDb(c.env.task_assistant_db);
    const prompts = new PromptRepository(db);
    const list = await prompts.list();
    return c.json({
      d1: 'ok',
      prompt_template_count: list.length,
    });
  } catch (err) {
    return c.json(
      {
        d1: 'error',
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});

export default app;
