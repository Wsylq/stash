import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
const SCRYPT_SALT_LEN = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_LEN).toString('base64');
  const hash = scryptSync(password, salt, SCRYPT.keylen, SCRYPT).toString('base64');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, expectedB64] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !expectedB64) return false;
  const expected = Buffer.from(expectedB64, 'base64');
  const actual = scryptSync(password, salt, expected.length, SCRYPT);
  return timingSafeEqual(actual, expected);
}

interface TokenPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function b64urlDecode<T>(input: string): T {
  return JSON.parse(Buffer.from(input, 'base64url').toString('utf8')) as T;
}

export function signToken(userId: string, email: string, secret: string): string {
  const payload: TokenPayload = {
    sub: userId,
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 60, // 60 days
  };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string, secret: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest();
  const actual = Buffer.from(sig, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = b64urlDecode<TokenPayload>(body);
    if (typeof payload.sub !== 'string' || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}