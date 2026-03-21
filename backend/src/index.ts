import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  ConversationRepository,
  FileRepository,
  PromptRepository,
  SerperUsageRepository,
  TaskRepository,
  UserRepository,
  getDb,
} from './db';
import { createFileStorage, hasR2Binding, hasR2PresignConfig } from './storage';
import { createQdrantStore, hasQdrantConfig, parseEmbeddingDimensions } from './vector';
import { handleError } from './lib/handle-error';
import { logger } from './lib/logger';
import { requireUserFromBearer } from './auth/resolve-user';
import { ChatService } from './chat/chat-service';
import { RuleBasedIntentClassifier } from './intent';
import { PromptService } from './prompt';
import { FileService, getMultipartPresignFromEnv } from './files';
import { SerperQuotaService, parseSerperDailySoftLimit } from './serper';
import { createSearchTool } from './tools/search-tool';
import { ToolRegistry } from './tools/tool-registry';
import { registerTaskTools } from './tools/task-tools';
import { createUpdateUserProfileTool } from './tools/user-tool';
import { createWorkspaceFilesTool } from './tools/workspace-files-tool';
import { createLlmProvider, hasLlmConfigured, resolveLlmProviderKind } from './llm';
import { createMemoryService, hasMemoryServiceConfig } from './memory';
import type { Env } from './env';
import { fileRoutes } from './routes/files';
import { taskRoutes } from './routes/tasks';
import { userRoutes } from './routes/user';

export type { Env };

const app = new Hono<{ Bindings: Env }>();

// 必须在 `app.route('/api/*')` 之前，否则浏览器直连 Worker（如 VITE_API_BASE 指向 :8787）时响应无 CORS 头，fetch 失败并被误判为「库无用户」
app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.route('/api/tasks', taskRoutes);
app.route('/api/user', userRoutes);
app.route('/api/files', fileRoutes);

app.onError(handleError);

app.notFound((c) => c.json({ error: 'Not Found', code: 'NOT_FOUND' }, 404));

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

/** LLM 密钥是否已配置（不发起外部请求） */
app.get('/health/llm', (c) => {
  const kind = resolveLlmProviderKind(c.env);
  return c.json({
    configured: hasLlmConfigured(c.env),
    provider: kind,
    chat_model: c.env.LLM_MODEL,
    embedding_model:
      c.env.EMBEDDING_MODEL?.trim() ||
      (kind === 'qwen' ? 'text-embedding-v3' : 'text-embedding-004'),
    note:
      kind === 'qwen'
        ? 'LLM_PROVIDER=qwen：DASHSCOPE_API_KEY；可选 DASHSCOPE_BASE_URL（国际站见 README）'
        : 'LLM_PROVIDER=gemini：GEMINI_API_KEY（.dev.vars / wrangler secret）',
  });
});

app.get('/health/serper', (c) => {
  const key = c.env.SERPER_API_KEY?.trim();
  return c.json({
    configured: !!key,
    daily_soft_limit: parseSerperDailySoftLimit(c.env.SERPER_DAILY_SOFT_LIMIT),
    note: key ? 'search 工具已注册' : '未配置 SERPER_API_KEY 时不注册 search 工具',
  });
});

app.get('/health/memory', (c) =>
  c.json({
    configured: hasMemoryServiceConfig(c.env),
    note: '需 Qdrant + 当前 LLM 提供方密钥（Gemini: GEMINI_API_KEY / Qwen: DASHSCOPE_API_KEY）',
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

/**
 * 对话流式（SSE）：任务 2.6 / 技术方案 §5.1
 */
app.post('/api/chat/stream', async (c) => {
  if (!hasLlmConfigured(c.env)) {
    return c.json(
      { error: 'LLM 未配置', code: 'LLM_NOT_CONFIGURED' },
      503,
    );
  }
  const llm = createLlmProvider(c.env);
  if (!llm) {
    return c.json({ error: 'LLM 未配置', code: 'LLM_NOT_CONFIGURED' }, 503);
  }

  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求体须为 JSON', code: 'VALIDATION_ERROR' }, 400);
  }
  const msgRaw =
    body && typeof body === 'object' && body !== null && 'message' in body
      ? (body as { message: unknown }).message
      : undefined;
  const message = typeof msgRaw === 'string' ? msgRaw.trim() : '';
  if (!message) {
    return c.json({ error: 'message 不能为空', code: 'VALIDATION_ERROR' }, 400);
  }

  const promptRepo = new PromptRepository(db);
  const promptService = new PromptService(promptRepo);
  const conversationRepo = new ConversationRepository(db);
  const toolRegistry = new ToolRegistry();
  registerTaskTools(toolRegistry, new TaskRepository(db));
  const filesRepo = new FileRepository(db);
  toolRegistry.register(
    createWorkspaceFilesTool(
      new FileService(filesRepo, createFileStorage(c.env), getMultipartPresignFromEnv(c.env)),
    ),
  );
  toolRegistry.register(createUpdateUserProfileTool(users));

  const serperQuota = new SerperQuotaService(
    new SerperUsageRepository(db),
    parseSerperDailySoftLimit(c.env.SERPER_DAILY_SOFT_LIMIT),
  );
  const serperKey = c.env.SERPER_API_KEY?.trim();
  if (serperKey) {
    toolRegistry.register(createSearchTool({ apiKey: serperKey, quota: serperQuota }));
  }

  const memoryService = createMemoryService(c.env);

  const chatService = new ChatService(
    llm,
    promptService,
    new RuleBasedIntentClassifier(),
    conversationRepo,
    toolRegistry,
    memoryService,
  );

  logger.info('chat stream: accepted', {
    userId: user.id,
    messageChars: message.length,
    memory: !!memoryService,
  });

  const stream = chatService.handleMessageStream({ user, userInput: message });
  // 经 Context 写出，便于与前置 CORS 中间件写在 c.res 上的头合并（见 hono Context#res setter）
  return c.body(stream, 200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
});

export default app;
