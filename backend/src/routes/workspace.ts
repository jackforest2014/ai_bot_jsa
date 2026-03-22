import { Hono } from 'hono';
import type { Context } from 'hono';
import { FileRepository, UserRepository, getDb } from '../db';
import type { Env } from '../env';
import { requireUserFromBearer } from '../auth/resolve-user';
import { createFileStorage } from '../storage';
import { FileService, fileRowToApi, getMultipartPresignFromEnv } from '../files/file-service';
import { encodeSseEvent } from '../chat/sse';
import { AppError } from '../errors/app-errors';

function makeFileService(env: Env): FileService {
  return new FileService(
    new FileRepository(getDb(env.task_assistant_db)),
    createFileStorage(env),
    getMultipartPresignFromEnv(env),
  );
}

function parseListQuery(c: Context) {
  const folderQ = c.req.query('folder') ?? c.req.query('folder_path');
  const folder = folderQ === undefined ? undefined : folderQ;
  const type = c.req.query('type')?.trim();
  return { folder, type };
}

function fileApiId(f: Record<string, unknown>): string {
  return typeof f.id === 'string' ? f.id : '';
}

function fileApiProcessed(f: Record<string, unknown>): number {
  return typeof f.processed === 'number' ? f.processed : 0;
}

export const workspaceRoutes = new Hono<{ Bindings: Env }>();

/** 工作空间文件列表（与旧 `GET /api/files` 行为一致） */
workspaceRoutes.get('/', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  const user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  const svc = makeFileService(c.env);
  const { folder, type } = parseListQuery(c);
  const rows = await svc.listForUser(user.id, {
    ...(folder !== undefined ? { folder } : {}),
    ...(type ? { semanticType: type } : {}),
  });
  return c.json(rows.map((r) => fileRowToApi(r)));
});

const SSE_INTERVAL_MS = 2500;

/**
 * SSE：定时对比列表，推送 `snapshot` / `file_status` / `file_removed` / `processing_idle`。
 * 查询参数与 `GET /` 相同。需 `Authorization: Bearer`。
 */
workspaceRoutes.get('/events', async (c) => {
  const db = getDb(c.env.task_assistant_db);
  const users = new UserRepository(db);
  let user;
  try {
    user = await requireUserFromBearer(c.req.header('Authorization'), users, c.env);
  } catch (e) {
    if (e instanceof AppError && e.statusCode === 401) {
      return c.json({ error: '未授权', code: 'UNAUTHORIZED' }, 401);
    }
    throw e;
  }

  const svc = makeFileService(c.env);
  const { folder, type } = parseListQuery(c);
  const listOpts = {
    ...(folder !== undefined ? { folder } : {}),
    ...(type ? { semanticType: type } : {}),
  };

  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | undefined;
  const signal = c.req.raw.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* stream closed */
        }
      };

      const onAbort = () => {
        signal.removeEventListener('abort', onAbort);
        if (intervalId !== undefined) {
          clearInterval(intervalId);
          intervalId = undefined;
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      signal.addEventListener('abort', onAbort);

      const prevById = new Map<string, number>();
      let lastHadPending = false;

      try {
        const rows0 = await svc.listForUser(user.id, listOpts);
        const apis0 = rows0.map((r) => fileRowToApi(r));
        for (const f of apis0) {
          const id = fileApiId(f);
          if (id) prevById.set(id, fileApiProcessed(f));
        }
        lastHadPending = apis0.some((f) => fileApiProcessed(f) === 0);
        send(encodeSseEvent('snapshot', { files: apis0 }));

        const tick = async () => {
          if (signal.aborted) return;
          try {
            const rows = await svc.listForUser(user.id, listOpts);
            const apis = rows.map((r) => fileRowToApi(r));
            const idSet = new Set(
              apis.map((f) => fileApiId(f)).filter((id): id is string => Boolean(id)),
            );

            for (const id of [...prevById.keys()]) {
              if (!idSet.has(id)) {
                send(encodeSseEvent('file_removed', { id }));
                prevById.delete(id);
              }
            }

            for (const f of apis) {
              const fid = fileApiId(f);
              if (!fid) continue;
              const proc = fileApiProcessed(f);
              const prev = prevById.get(fid);
              if (prev === undefined || prev !== proc) {
                send(encodeSseEvent('file_status', { file: f }));
                prevById.set(fid, proc);
              }
            }

            const hasPending = apis.some((x) => fileApiProcessed(x) === 0);
            if (lastHadPending && !hasPending) {
              send(encodeSseEvent('processing_idle', {}));
            }
            lastHadPending = hasPending;

            if (!hasPending && intervalId !== undefined) {
              clearInterval(intervalId);
              intervalId = undefined;
            }
          } catch {
            send(encodeSseEvent('error', { message: 'workspace_events_tick_failed' }));
          }
        };

        intervalId = setInterval(() => {
          void tick();
        }, SSE_INTERVAL_MS);
      } catch {
        send(encodeSseEvent('error', { message: 'workspace_events_init_failed' }));
        onAbort();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});
