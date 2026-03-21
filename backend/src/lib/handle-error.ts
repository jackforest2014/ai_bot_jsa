import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { HTTPException } from 'hono/http-exception';
import { AppError } from '../errors/app-errors';
import { logger } from './logger';

/**
 * Hono `app.onError` 统一 JSON 响应；`HTTPException` 与自定义 `AppError` 分支处理。
 */
export function handleError(err: Error, c: Context): Response {
  logger.error('request error', {
    name: err.name,
    message: err.message,
    path: c.req.path,
    method: c.req.method,
  });

  if (err instanceof HTTPException) {
    return c.json({ error: err.message, code: 'HTTP_ERROR' }, err.status);
  }

  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      error: err.message,
      code: err.code,
    };
    if (err.details !== undefined) {
      body.details = err.details;
    }
    return c.json(body, err.statusCode as ContentfulStatusCode);
  }

  return c.json({ error: '服务器内部错误', code: 'INTERNAL_ERROR' }, 500);
}
