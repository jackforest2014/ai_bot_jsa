import { AppError } from '../errors/app-errors';
import type { UserRepository } from '../db';

/**
 * 简化鉴权：Bearer token 即 `users.id`（与当前前端存 token 方式一致）。
 */
export async function requireUserFromBearer(
  authHeader: string | undefined,
  users: UserRepository,
) {
  const raw = authHeader?.trim();
  if (!raw?.toLowerCase().startsWith('bearer ')) {
    throw new AppError('未授权', { code: 'UNAUTHORIZED', statusCode: 401 });
  }
  const token = raw.slice(7).trim();
  if (!token) {
    throw new AppError('未授权', { code: 'UNAUTHORIZED', statusCode: 401 });
  }
  const user = await users.findById(token);
  if (!user) {
    throw new AppError('未授权', { code: 'UNAUTHORIZED', statusCode: 401 });
  }
  return user;
}
