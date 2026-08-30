import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import type { Config } from '../src/config.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let dataDir: string;

const SECRET = 'integration-test-secret-0123456789';

function makeConfig(): Config {
  return {
    port: 0,
    host: '127.0.0.1',
    dataDir,
    secret: SECRET,
    maxBodyBytes: 1_000_000,
    allowSignup: true,
    fetchTimeoutMs: 2000,
  };
}

async function inject(method: string, url: string, opts: { token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return app.inject({
    method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url,
    headers,
    payload: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stash-test-'));
  app = await buildApp(makeConfig());
});

afterAll(async () => {
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('Stash API', () => {
  let token = '';

  it('health check works', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('registers the first user (bootstrap)', async () => {
    const res = await inject('POST', '/api/v1/auth/register', { body: { email: 'alice@test.dev', password: 'password123' } });
    expect(res.statusCode).toBe(201);
    const data = res.json();
    expect(data.token).toBeTruthy();
    expect(data.user.email).toBe('alice@test.dev');
    token = data.token;
  });

  it('rejects a wrong password', async () => {
    const res = await inject('POST', '/api/v1/auth/login', { body: { email: 'alice@test.dev', password: 'nope-nope-nope' } });
    expect(res.statusCode).toBe(401);
  });

  it('rejects requests without a token', async () => {
    const res = await inject('GET', '/api/v1/items');
    expect(res.statusCode).toBe(401);
  });

  it('saves a text note', async () => {
    const res = await inject('POST', '/api/v1/items', {
      token,
      body: { text: 'The quick brown fox jumps over the lazy dog. A test note.', tagNames: ['test', 'foxes'] },
    });
    expect(res.statusCode).toBe(201);
    const item = res.json().item;
    expect(item.type).toBe('note');
    const tagNames = item.tags.map((t: { name: string }) => t.name).sort();
    expect(tagNames).toEqual(['foxes', 'test']);
  });

  it('saves a link without hitting the network', async () => {
    const res = await inject('POST', '/api/v1/items', {
      token,
      body: { url: 'http://127.0.0.1:1/offline-page', type: 'link' },
    });
    expect(res.statusCode).toBe(201);
    const item = res.json().item;
    expect(item.type).toBe('link');
    expect(item.source).toBe('127.0.0.1');
  });

  it('merges duplicate tags case-insensitively', async () => {
    const res = await inject('POST', '/api/v1/items', {
      token,
      body: { text: 'tag merge check', tagNames: ['Pasta', 'pasta'] },
    });
    const tags = res.json().item.tags as { id: string }[];
    expect(new Set(tags.map((t) => t.id)).size).toBe(1);
  });

  it('creates and applies a smart collection', async () => {
    const c = await inject('POST', '/api/v1/collections', {
      token,
      body: { name: 'Watch later', emoji: '🎬', isSmart: true, smartRule: { matchType: 'video' } },
    });
    expect(c.statusCode).toBe(201);
    const saved = await inject('POST', '/api/v1/items', {
      token,
      body: { text: 'a floating video note', type: 'video', matchCollections: true },
    });
    const item = saved.json().item;
    expect(item.collections).toContain(c.json().collection.id);
  });

  it('searches items', async () => {
    const res = await inject('GET', `/api/v1/items?q=brown%20fox`, { token });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBeGreaterThan(0);
  });

  it('marks an item done and starred', async () => {
    const list = await inject('GET', '/api/v1/items?limit=1', { token });
    const id = list.json().items[0].id as string;
    const res = await inject('PATCH', `/api/v1/items/${id}`, { token, body: { done: true, starred: true } });
    expect(res.json().item.done).toBe(true);
    expect(res.json().item.starred).toBe(true);
  });

  it('re-exports and re-imports without data loss', async () => {
    const ex = await inject('GET', '/api/v1/export', { token });
    expect(ex.statusCode).toBe(200);
    const payload = ex.json();
    expect(payload.items.length).toBeGreaterThan(0);
    const im = await inject('POST', '/api/v1/import', { token, body: { items: payload.items.slice(0, 1) } });
    expect(im.statusCode).toBe(200);
    expect(im.json().imported).toBe(1);
  });

  it('hides the API key on read and encrypts at rest', async () => {
    const put = await inject('PUT', '/api/v1/settings', { token, body: { apiKey: 'sk-integration-123' } });
    expect(put.json().settings.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(put.json())).not.toContain('sk-integration-123');
    const dbFile = fs.readFileSync(path.join(dataDir, 'stash.db'), 'utf8');
    expect(dbFile).not.toContain('sk-integration-123');
  });

  it('clears the API key when requested', async () => {
    const del = await inject('DELETE', '/api/v1/settings/ai', { token });
    expect(del.json().settings.apiKeyConfigured).toBe(false);
  });

  it('reports stats', async () => {
    const res = await inject('GET', '/api/v1/stats', { token });
    expect(res.statusCode).toBe(200);
    expect(res.json().stats.total).toBeGreaterThan(0);
  });
});