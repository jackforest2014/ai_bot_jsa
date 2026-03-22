/**
 * 轻量 HS256 JWT（Workers Web Crypto），无第三方依赖。
 * `sub` 存放 `users.id`。
 */

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type JwtPayload = {
  sub: string;
  iat: number;
  exp: number;
};

const TTL_SEC = 60 * 60 * 24 * 30; // 30d

export async function signUserJwt(userId: string, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = { sub: userId, iat: now, exp: now + TTL_SEC };
  const header = { alg: 'HS256', typ: 'JWT' };
  const encHeader = bytesToB64url(new TextEncoder().encode(JSON.stringify(header)));
  const encPayload = bytesToB64url(new TextEncoder().encode(JSON.stringify(payload)));
  const data = `${encHeader}.${encPayload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${bytesToB64url(new Uint8Array(sig))}`;
}

export async function verifyUserJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  if (!h || !p || !s) return null;
  const data = `${h}.${p}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const sigBytes = b64urlToBytes(s);
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    new TextEncoder().encode(data),
  );
  if (!ok) return null;
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  } catch {
    return null;
  }
  const sub = (body as { sub?: unknown }).sub;
  const exp = (body as { exp?: unknown }).exp;
  if (typeof sub !== 'string' || !sub.trim()) return null;
  if (typeof exp !== 'number' || exp < Math.floor(Date.now() / 1000)) return null;
  return body as JwtPayload;
}
