import type { Env } from '../env';

type AdminContext = { env: Env; req: { header: (n: string) => string | undefined } };

export function requireAdminGate(c: AdminContext) {
  const secret = c.env.ADMIN_API_SECRET?.trim();
  if (!secret) {
    return {
      ok: false as const,
      response: { error: '未配置管理员密钥', code: 'ADMIN_NOT_CONFIGURED' },
      status: 503 as const,
    };
  }
  const bearer = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  const headerToken = c.req.header('X-Admin-Token')?.trim();
  const token = headerToken || bearer;
  if (!token || token !== secret) {
    return {
      ok: false as const,
      response: { error: '未授权', code: 'UNAUTHORIZED' },
      status: 401 as const,
    };
  }
  return { ok: true as const };
}
