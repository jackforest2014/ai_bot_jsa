import { describe, it, expect } from 'vitest';
import { signUserJwt, verifyUserJwt } from '../src/auth/jwt-hs256';

describe('jwt-hs256', () => {
  it('signs and verifies sub', async () => {
    const secret = 'test-secret-at-least-32-chars-long!!';
    const token = await signUserJwt('user-abc', secret);
    expect(token.split('.')).toHaveLength(3);
    const payload = await verifyUserJwt(token, secret);
    expect(payload?.sub).toBe('user-abc');
  });

  it('rejects wrong secret', async () => {
    const token = await signUserJwt('u1', 'secret-one-is-long-enough-here');
    const bad = await verifyUserJwt(token, 'secret-two-is-long-enough-here');
    expect(bad).toBeNull();
  });

  it('rejects malformed token', async () => {
    expect(await verifyUserJwt('not-a-jwt', 'x'.repeat(32))).toBeNull();
  });
});
