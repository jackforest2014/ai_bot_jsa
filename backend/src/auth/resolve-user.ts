import { AppError } from '../errors/app-errors';
import type { UserRepository } from '../db';
import { verifyUserJwt } from './jwt-hs256';

export type AuthEnvSlice = {
  JWT_SECRET?: string;
};

/**
 * Bearer：优先校验 JWT（`sub=user.id`）；否则将整段 token 视为明文 `users.id`（本地/脚本兼容）。
 */
export async function requireUserFromBearer(
  authHeader: string | undefined,
  users: UserRepository,
  env?: AuthEnvSlice,
) {
  const raw = authHeader?.trim();
  if (!raw?.toLowerCase().startsWith('bearer ')) {
    throw new AppError('未授权', { code: 'UNAUTHORIZED', statusCode: 401 });
  }
  const token = raw.slice(7).trim();
  if (!token) {
    throw new AppError('未授权', { code: 'UNAUTHORIZED', statusCode: 401 });
  }

  const secret = env?.JWT_SECRET?.trim();
  if (secret && token.includes('.')) {
    const payload = await verifyUserJwt(token, secret);
    if (payload?.sub) {
      const user = await users.findById(payload.sub);
      if (user) return user;
    }
  }

  const legacy = await users.findById(token);
  if (legacy) return legacy;

  throw new AppError('未授权', { code: 'UNAUTHORIZED', statusCode: 401 });
}
