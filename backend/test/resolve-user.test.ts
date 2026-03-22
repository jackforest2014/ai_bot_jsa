import { describe, it, expect, vi } from 'vitest';
import { requireUserFromBearer } from '../src/auth/resolve-user';
import { signUserJwt } from '../src/auth/jwt-hs256';
import { AppError } from '../src/errors/app-errors';
import type { UserRepository } from '../src/db';

describe('requireUserFromBearer', () => {
  const secret = 'unit-test-jwt-secret-min-length-ok';

  it('resolves JWT sub to user', async () => {
    const token = await signUserJwt('uid-1', secret);
    const users = {
      findById: vi.fn(async (id: string) =>
        id === 'uid-1'
          ? {
              id: 'uid-1',
              name: 'N',
              email: null,
              ai_nickname: 'A',
              preferences_json: null,
              created_at: 0,
            } satisfies import('../src/db').UserRow
          : undefined,
      ),
    } as unknown as UserRepository;

    const u = await requireUserFromBearer(`Bearer ${token}`, users, { JWT_SECRET: secret });
    expect(u.id).toBe('uid-1');
  });

  it('falls back to plaintext user id', async () => {
    const users = {
      findById: vi.fn(async (id: string) =>
        id === 'plain-dev'
          ? {
              id: 'plain-dev',
              name: 'D',
              email: null,
              ai_nickname: 'A',
              preferences_json: null,
              created_at: 0,
            } satisfies import('../src/db').UserRow
          : undefined,
      ),
    } as unknown as UserRepository;

    const u = await requireUserFromBearer('Bearer plain-dev', users, { JWT_SECRET: secret });
    expect(u.id).toBe('plain-dev');
  });

  it('401 without Bearer', async () => {
    const users = { findById: vi.fn() } as unknown as UserRepository;
    await expect(requireUserFromBearer('Basic x', users, {})).rejects.toThrow(AppError);
  });
});
