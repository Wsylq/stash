import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  secret: string;
  maxBodyBytes: number;
  allowSignup: boolean;
  fetchTimeoutMs: number;
}

const DEFAULT_SECRET_FILE = '.secret';

function loadSecret(dataDir: string): string {
  const fromEnv = process.env.STASH_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  const file = path.join(dataDir, DEFAULT_SECRET_FILE);
  if (fs.existsSync(file)) {
    const s = fs.readFileSync(file, 'utf8').trim();
    if (s.length >= 16) return s;
  }
  const generated = randomBytes(48).toString('hex');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, generated, { mode: 0o600 });
  console.log(`[stash] No STASH_SECRET set — generated one and stored it at ${file}.`);
  return generated;
}

export function newId(prefix = ''): string {
  return `${prefix}${randomBytes(9).toString('hex')}`;
}

export function loadConfig(): Config {
  const dataDir = process.env.STASH_DATA_DIR || path.resolve(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return {
    port: parseInt(process.env.PORT || '4000', 10),
    host: process.env.HOST || '0.0.0.0',
    dataDir,
    secret: loadSecret(dataDir),
    maxBodyBytes: parseInt(process.env.STASH_MAX_BODY_BYTES || '5000000', 10),
    allowSignup: (process.env.STASH_ALLOW_SIGNUP || 'false') === 'true',
    fetchTimeoutMs: parseInt(process.env.STASH_FETCH_TIMEOUT_MS || '10000', 10),
  };
}