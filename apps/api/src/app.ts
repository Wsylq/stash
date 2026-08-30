import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { Config } from './config.js';
import { openDb } from './db.js';
import { registerAuth } from './routes/auth.js';
import { registerItems } from './routes/items.js';
import { registerCollections } from './routes/collections.js';
import { registerSettings } from './routes/settings.js';
import { HttpError } from './helpers.js';

export async function buildApp(config: Config) {
  const app = Fastify({
    logger: false,
    bodyLimit: config.maxBodyBytes,
  });

  await app.register(cors, { origin: true });

  openDb(config.dataDir);

  await app.register(async (api) => {
    registerAuth(api, config);
    registerItems(api, config);
    registerCollections(api, config);
    registerSettings(api, config);
  });

  app.get('/api/v1/health', async () => ({ ok: true, service: 'stash-api', time: new Date().toISOString() }));

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.status).send({ error: err.message });
    }
    if (err && typeof err === 'object' && 'statusCode' in err && Number((err as { statusCode: unknown }).statusCode) === 413) {
      return reply.code(413).send({ error: 'Payload too large' });
    }
    console.error('[stash] unhandled error:', err);
    return reply.code(500).send({ error: 'Internal server error' });
  });

  app.setNotFoundHandler((_req, reply) => {
    return reply.code(404).send({ error: 'Not found' });
  });

  return app;
}