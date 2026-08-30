import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ExportPayload, Item, ItemType } from '@stash/shared';
import { ITEM_TYPES } from '@stash/shared';
import {
  getDb,
  listAiLogs,
  loadItem,
  rebuildSearchTsv,
  rowToCollection,
  userStats,
} from '../db.js';
import type { CollectionRow } from '../db.js';
import { HttpError, requireAuth, sendError } from '../helpers.js';
import type { Config } from '../config.js';
import {
  AI_PRESETS,
  aiSettingsView,
  applyPreset,
  loadAiSettings,
  saveAiSettings,
  testConnection,
} from '../services/ai.js';
import { detectTypeFromUrl, safeUrl } from '../services/fetcher.js';

const aiSettingsPatch = z.object({
  preset: z.string().trim().max(40).optional(),
  baseUrl: z.string().trim().url().max(512).optional(),
  apiKey: z.string().trim().max(1024).optional(),
  model: z.string().trim().max(120).optional(),
  features: z.object({
    summarize: z.boolean().optional(),
    categorize: z.boolean().optional(),
    extractRecipe: z.boolean().optional(),
    extractWorkout: z.boolean().optional(),
  }).optional(),
  featureModels: z.record(z.string(), z.string()).optional(),
});

const importItem = z.object({
  type: z.enum(ITEM_TYPES).optional(),
  title: z.string().trim().max(300).optional(),
  url: z.string().trim().url().max(2048).nullable().optional(),
  text: z.string().trim().max(100_000).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
  collections: z.array(z.string().trim().max(80)).max(20).optional(),
  done: z.boolean().optional(),
  starred: z.boolean().optional(),
});

const importPayload = z.object({ items: z.array(importItem).max(500) });

export function registerSettings(app: FastifyInstance, config: Config): void {
  const db = () => getDb();

  app.get('/api/v1/settings', async (req: FastifyRequest, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      return reply.send({ settings: aiSettingsView(loadAiSettings(db(), userId, config.secret)) });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.put('/api/v1/settings', async (req: FastifyRequest, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const patch = aiSettingsPatch.parse(req.body);
      return reply.send({ settings: aiSettingsView(saveAiSettings(db(), userId, config.secret, patch)) });
    } catch (err) {
      if (err instanceof z.ZodError) return sendError(reply, new HttpError(400, err.issues.map((i) => i.message).join('; ')));
      return sendError(reply, err);
    }
  });

  app.get('/api/v1/settings/ai/presets', async (_req, reply) => {
    return reply.send({ presets: AI_PRESETS });
  });

  app.get('/api/v1/settings/ai/preset/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const preset = AI_PRESETS.find((p) => p.id === req.params.id);
      if (!preset) throw new HttpError(404, 'Unknown preset');
      const current = loadAiSettings(db(), userId, config.secret);
      const settings = applyPreset(preset.id);
      const merged = { ...settings, apiKey: current.apiKey };
      return reply.send({ settings: aiSettingsView(saveAiSettings(db(), userId, config.secret, merged)) });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/v1/settings/ai/test', async (req: FastifyRequest, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const patch = aiSettingsPatch.parse(req.body ?? {});
      const candidate = saveAiSettings(db(), userId, config.secret, patch);
      return reply.send(await testConnection(candidate));
    } catch (err) {
      if (err instanceof z.ZodError) return sendError(reply, new HttpError(400, err.issues.map((i) => i.message).join('; ')));
      return sendError(reply, err);
    }
  });

  app.delete('/api/v1/settings/ai', async (req: FastifyRequest, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const settings = saveAiSettings(db(), userId, config.secret, { apiKey: '' });
      return reply.send({ settings: aiSettingsView(settings) });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/v1/settings/ai/logs', async (req: FastifyRequest, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const q = req.query as Record<string, string | undefined>;
      const limit = Math.min(parseInt(q.limit ?? '50', 10) || 50, 200);
      return reply.send({ logs: listAiLogs(db(), userId, limit) });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/v1/stats', async (req: FastifyRequest, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      return reply.send({ stats: userStats(db(), userId) });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/v1/export', async (req: FastifyRequest, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const rows = db()
        .prepare('SELECT id FROM items WHERE user_id = ? ORDER BY created_at DESC')
        .all(userId) as unknown as { id: string }[];
      const items = rows.map((r) => loadItem(db(), userId, r.id)).filter((i): i is Item => !!i);
      const collectionRows = db()
        .prepare('SELECT * FROM collections WHERE user_id = ? ORDER BY created_at')
        .all(userId) as unknown as CollectionRow[];
      const collections = collectionRows.map((r) => rowToCollection(r));
      const idToName = new Map(collections.map((c) => [c.id, c.name]));
      const exportedItems = items.map((i) => ({
        ...i,
        collections: i.collections.map((cid) => idToName.get(cid) ?? cid),
      }));
      const payload: ExportPayload = {
        app: 'stash',
        version: '0.1.0',
        exportedAt: new Date().toISOString(),
        items: exportedItems,
        collections: collections.map(({ itemCount: _no, ...c }) => c),
      };
      const json = JSON.stringify(payload, null, 2);
      return reply
        .header('content-type', 'application/json')
        .header('content-disposition', `attachment; filename="stash-export-${new Date().toISOString().slice(0, 10)}.json"`)
        .send(json);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/v1/import', async (req: FastifyRequest, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const body = req.body;
      if (body && typeof body === 'object' && !Buffer.isBuffer(body) && Array.isArray((body as { items?: unknown }).items)) {
        const parsed = importPayload.parse(body);
        return reply.send({ imported: runImport(userId, parsed.items) });
      }
      if (typeof body === 'string') {
        return reply.send({ imported: runCsvImport(userId, body) });
      }
      throw new HttpError(400, 'Expected a JSON export payload or CSV text');
    } catch (err) {
      if (err instanceof z.ZodError) return sendError(reply, new HttpError(400, err.issues.map((i) => i.message).join('; ')));
      return sendError(reply, err);
    }
  });

  function runImport(userId: string, items: z.infer<typeof importPayload>['items']): number {
    const now = new Date().toISOString();
    const tagStmt = db().prepare('INSERT OR IGNORE INTO tags (id, user_id, name) VALUES (?, ?, ?)');
    const collStmt = db().prepare('INSERT OR IGNORE INTO collections (id, user_id, name, emoji, color, is_smart, smart_rule, created_at) VALUES (?, ?, ?, ?, ?, 0, NULL, ?)');
    const itemStmt = db().prepare(
      `INSERT INTO items (id, user_id, type, title, url, description, text_content, done, starred, created_at, updated_at, search_tsv)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const tagLink = db().prepare('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)');
    const collLink = db().prepare('INSERT OR IGNORE INTO item_collections (item_id, collection_id) VALUES (?, ?)');

    let created = 0;
    for (const item of items) {
      const id = `i_${Math.random().toString(16).slice(2, 14)}`;
      const tagIds: string[] = [];
      for (const name of item.tags ?? []) {
        const row = db().prepare('SELECT id FROM tags WHERE user_id = ? AND name = ? COLLATE NOCASE').get(userId, name) as { id: string } | undefined;
        if (row) { tagIds.push(row.id); continue; }
        const tid = `t_${Math.random().toString(16).slice(2, 14)}`;
        tagStmt.run(tid, userId, name);
        tagIds.push(tid);
      }
      const collectionIds: string[] = [];
      for (const name of item.collections ?? []) {
        const row = db().prepare('SELECT id FROM collections WHERE user_id = ? AND name = ? COLLATE NOCASE').get(userId, name) as { id: string } | undefined;
        if (row) { collectionIds.push(row.id); continue; }
        const cid = `c_${Math.random().toString(16).slice(2, 14)}`;
        collStmt.run(cid, userId, name, '', '', now);
        collectionIds.push(cid);
      }
      const type: ItemType = item.type ?? (item.url ? detectTypeFromUrl(item.url) : 'note');
      const title = item.title ?? (item.text ? item.text.slice(0, 80) : 'Untitled');
      itemStmt.run(
        id, userId, type, title.slice(0, 300), item.url ?? null, item.description ?? null, item.text ?? null,
        item.done ? 1 : 0, item.starred ? 1 : 0, now, now, '',
      );
      for (const tid of tagIds) tagLink.run(id, tid);
      for (const cid of collectionIds) collLink.run(id, cid);
      rebuildSearchTsv(db(), userId, id);
      created++;
    }
    return created;
  }

  function runCsvImport(userId: string, csv: string): number {
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const now = new Date().toISOString();
    let created = 0;
    for (const line of lines) {
      const cells = line.split(',').map((c) => c.trim());
      if (!cells[0] || cells[0].startsWith('#')) continue;
      const title = cells[0];
      const url = cells.length > 1 && safeUrl(cells[1]) ? cells[1] : null;
      const tagNames = (cells.length > 2 ? (cells[2] ?? '') : '').split('|').map((t) => t.trim()).filter(Boolean);
      const collectionName = cells.length > 3 ? cells[3] ?? '' : '';
      const done = ['1', 'true', 'done'].includes((cells.length > 4 ? cells[4] ?? '' : '').toLowerCase());
      const type: ItemType = url ? detectTypeFromUrl(url) : 'note';
      const id = `i_${Math.random().toString(16).slice(2, 14)}`;
      const tagIds: string[] = [];
      for (const name of tagNames) {
        const row = db().prepare('SELECT id FROM tags WHERE user_id = ? AND name = ? COLLATE NOCASE').get(userId, name) as { id: string } | undefined;
        if (row) { tagIds.push(row.id); continue; }
        const tid = `t_${Math.random().toString(16).slice(2, 14)}`;
        db().prepare('INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)').run(tid, userId, name);
        tagIds.push(tid);
      }
      db().prepare(
        `INSERT INTO items (id, user_id, type, title, url, done, created_at, updated_at, search_tsv)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, userId, type, title.slice(0, 300), url, done ? 1 : 0, now, now, '');
      for (const tid of tagIds) db().prepare('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)').run(id, tid);
      if (collectionName) {
        const row = db().prepare('SELECT id FROM collections WHERE user_id = ? AND name = ? COLLATE NOCASE').get(userId, collectionName) as { id: string } | undefined;
        const cid = row?.id ?? (() => {
          const id = `c_${Math.random().toString(16).slice(2, 14)}`;
          db().prepare('INSERT INTO collections (id, user_id, name, emoji, color, is_smart, smart_rule, created_at) VALUES (?, ?, ?, ?, ?, 0, NULL, ?)')
            .run(id, userId, collectionName, '', '', now);
          return id;
        })();
        db().prepare('INSERT OR IGNORE INTO item_collections (item_id, collection_id) VALUES (?, ?)').run(id, cid);
      }
      rebuildSearchTsv(db(), userId, id);
      created++;
    }
    return created;
  }
}