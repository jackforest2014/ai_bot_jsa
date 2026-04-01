import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import {
  ConversationRepository,
  FileRepository,
  PromptRepository,
  SerperUsageRepository,
  SessionRepository,
  TaskRepository,
  ToolInvocationRepository,
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
import { createPlanResearchTool } from './tools/plan-research-tool';
import { createGotTool, createTotTool, isTotGotToolsEnabled } from './tools/tot-got-tools';
import { ToolRegistry } from './tools/tool-registry';
import { registerTaskTools } from './tools/task-tools';
import { registerShanghaiCalendarTool } from './tools/shanghai-calendar-tool';
import { createUpdateUserProfileTool } from './tools/user-tool';
import { createWorkspaceFilesTool } from './tools/workspace-files-tool';
import { createAmapTools } from './tools/amap-tools';
import { createLlmProvider, hasLlmConfigured, resolveLlmProviderKind } from './llm';
import { createMemoryService, hasMemoryServiceConfig } from './memory';
import type { Env } from './env';
import { authRoutes } from './routes/auth';
import { fileRoutes } from './routes/files';
import { workspaceRoutes } from './routes/workspace';
import { sessionRoutes } from './routes/sessions';
import { taskRoutes } from './routes/tasks';
import { userRoutes } from './routes/user';
import { promptRoutes } from './routes/prompts';
import { adminRoutes } from './routes/admin';
import { proxyRoutes } from './routes/proxy';
import { CHAT_SSE_EVENTS } from './chat/sse-contract';
import { isOrchestrationEnabled } from './orchestration/flags';
import { isRouteAgentGotEnabled, isTaskAgentGotEnabled } from './orchestration/got-flags';
import { OrchestrationService } from './orchestration/orchestration-service';
import { chatStreamBodySchema } from './validation/api-schemas';
import { zodIssues } from './lib/zod-errors';

function waitUntilFromContext(c: Context): ((p: Promise<unknown>) => void) | undefined {
  try {
    const x = c.executionCtx;
    return (p) => x.waitUntil(p);
  } catch {
    return undefined;
  }
}

export type { Env };

const app = new Hono<{ Bindings: Env }>();

// 必须在 `app.route('/api/*')` 之前，否则浏览器直连 Worker（如 VITE_API_BASE 指向 :8787）时响应无 CORS 头，fetch 失败并被误判为「库无用户」
app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token'],
  }),
);

app.use('*', async (c, next) => {
  const t0 = Date.now();
  await next();
  logger.info('http', {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    ms: Date.now() - t0,
  });
});

app.route('/api/auth', authRoutes);
app.route('/api/sessions', sessionRoutes);
app.route('/api/tasks', taskRoutes);
app.route('/api/user', userRoutes);
app.route('/api/workspace', workspaceRoutes);
app.route('/api/files', fileRoutes);
app.route('/api/prompts', promptRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/proxy', proxyRoutes);

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
  const bindingOk = hasR2Binding(c.env);
  const presignOk = hasR2PresignConfig(c.env);
  let note: string;
  if (bindingOk && presignOk) {
    note = 'R2 绑定与预签名环境变量均已配置；本接口不访问对象，不产生费用。';
  } else if (!bindingOk && !presignOk) {
    note =
      '未绑定 R2：在 wrangler.toml 启用 [[r2_buckets]] 并创建同名 bucket；预签名另需 R2_ACCOUNT_ID、R2_BUCKET_NAME 与 S3 API 令牌（见 README）。';
  } else if (!bindingOk) {
    note = '未绑定 R2：在 wrangler.toml 启用 [[r2_buckets]]，bucket_name 与控制台桶名一致。';
  } else {
    note =
      '预签名未齐：需 R2_ACCOUNT_ID、R2_BUCKET_NAME、R2_S3_ACCESS_KEY_ID、R2_S3_SECRET_ACCESS_KEY（见 README）。Worker 内 put/get 不依赖预签名。';
  }
  return c.json({
    binding: bindingOk ? 'configured' : 'unconfigured',
    presign_credentials: presignOk ? 'configured' : 'missing',
    note,
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
/** 对话 SSE 事件类型说明（阶段四 4.6，供前后端联调） */
app.get('/health/sse-chat', (c) =>
  c.json({
    endpoint: 'POST /api/chat/stream',
    content_type: 'text/event-stream; charset=utf-8',
    events: CHAT_SSE_EVENTS,
  }),
);

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
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求体须为 JSON', code: 'VALIDATION_ERROR' }, 400);
  }
  const parsed = chatStreamBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: '请求参数无效', code: 'VALIDATION_ERROR', issues: zodIssues(parsed.error) },
      400,
    );
  }
  const message = parsed.data.message;
  const sessionId = parsed.data.session_id;

  const sessionRepo = new SessionRepository(db);
  const sessionRow = await sessionRepo.findByIdForUser(sessionId, user.id);
  if (!sessionRow) {
    return c.json({ error: '会话不存在', code: 'NOT_FOUND' }, 404);
  }
  const sessionTitleSource = sessionRow.title_source === 'user' ? 'user' : 'auto';

  const promptRepo = new PromptRepository(db);
  const promptService = new PromptService(promptRepo);
  const conversationRepo = new ConversationRepository(db);
  const toolInvRepo = new ToolInvocationRepository(db);
  const toolRegistry = new ToolRegistry({
    persistInvocation: (row) => toolInvRepo.insert(row),
  });
  registerShanghaiCalendarTool(toolRegistry);
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
    const searchTool = createSearchTool({ apiKey: serperKey, quota: serperQuota });
    toolRegistry.register(searchTool);
    toolRegistry.register(createPlanResearchTool({ llm, searchTool }));
  }

  if (isTotGotToolsEnabled(c.env)) {
    toolRegistry.register(createTotTool(llm));
    toolRegistry.register(createGotTool(llm));
  }

  const amapKey = c.env.AMAP_WEB_KEY?.trim();
  if (amapKey) {
    for (const t of createAmapTools({ apiKey: amapKey })) {
      toolRegistry.register(t);
    }
  }

  const memoryService = createMemoryService(c.env);

  const chatService = new ChatService(
    llm,
    promptService,
    new RuleBasedIntentClassifier(),
    conversationRepo,
    sessionRepo,
    toolRegistry,
    memoryService,
    filesRepo,
    createFileStorage(c.env),
  );

  logger.info('chat stream: accepted', {
    userId: user.id,
    sessionId,
    messageChars: message.length,
    memory: !!memoryService,
    orchestration: isOrchestrationEnabled(c.env),
  });

  const correlationId = crypto.randomUUID();
  const stream = isOrchestrationEnabled(c.env)
    ? new OrchestrationService(llm, chatService).handleStream({
        user,
        userInput: message,
        sessionId,
        sessionTitleSource,
        waitUntil: waitUntilFromContext(c),
        correlationId,
        orchestrationGot: {
          taskAgent: isTaskAgentGotEnabled(c.env),
          routeAgent: isRouteAgentGotEnabled(c.env),
        },
      })
    : chatService.handleMessageStream({
        user,
        userInput: message,
        sessionId,
        sessionTitleSource,
        waitUntil: waitUntilFromContext(c),
        proxyForUserId: sessionRow.proxy_for_user_id,
      });
  // 经 Context 写出，便于与前置 CORS 中间件写在 c.res 上的头合并（见 hono Context#res setter）
  return c.body(stream, 200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
});

export default app;
