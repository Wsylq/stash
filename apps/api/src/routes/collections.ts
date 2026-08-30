import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Collection } from '@stash/shared';
import { ITEM_TYPES } from '@stash/shared';
import { newId } from '../config.js';
import {
  getDb,
  listCollections,
  collectionById,
  rowToCollection,
  countCollectionItems,
  itemsInCollection,
  loadItem,
  setItemCollections,
  rebuildSearchTsv,
} from '../db.js';
import { HttpError, requireAuth, sendError } from '../helpers.js';
import type { Config } from '../config.js';

const collectionInput = z.object({
  name: z.string().trim().min(1).max(80),
  emoji: z.string().trim().max(8).optional(),
  color: z.string().trim().max(32).optional(),
  isSmart: z.boolean().optional(),
  smartRule: z.object({ matchType: z.enum(ITEM_TYPES).optional() }).nullable().optional(),
});

export function registerCollections(app: FastifyInstance, config: Config): void {
  const db = () => getDb();

  function hydrate(userId: string, id: string): Collection {
    const row = collectionById(db(), userId, id);
    if (!row) throw new HttpError(404, 'Collection not found');
    const c = rowToCollection(row);
    c.itemCount = countCollectionItems(db(), userId, id);
    return c;
  }

  app.get('/api/v1/collections', async (req: FastifyRequest, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const collections = listCollections(db(), userId).map((r) => {
        const c = rowToCollection(r);
        c.itemCount = countCollectionItems(db(), userId, r.id);
        return c;
      });
      return reply.send({ collections });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/v1/collections', async (req: FastifyRequest, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const input = collectionInput.parse(req.body);
      if (input.isSmart && !input.smartRule?.matchType) {
        throw new HttpError(400, 'Smart collections need a matching type rule');
      }
      const existing = db()
        .prepare('SELECT id FROM collections WHERE user_id = ? AND name = ? COLLATE NOCASE')
        .get(userId, input.name ?? '');
      if (existing) throw new HttpError(409, 'A collection with that name already exists');

      const id = newId('c_');
      db().prepare(
        `INSERT INTO collections (id, user_id, name, emoji, color, is_smart, smart_rule, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id, userId, input.name ?? '', input.emoji ?? '', input.color ?? '',
        input.isSmart ? 1 : 0,
        input.smartRule ? JSON.stringify(input.smartRule) : null,
        new Date().toISOString(),
      );
      return reply.code(201).send({ collection: hydrate(userId, id) });
    } catch (err) {
      if (err instanceof z.ZodError) return sendError(reply, new HttpError(400, err.issues.map((i) => i.message).join('; ')));
      return sendError(reply, err);
    }
  });

  app.get('/api/v1/collections/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const collection = hydrate(userId, req.params.id);
      const q = req.query as Record<string, string | undefined>;
      const limit = Math.min(parseInt(q.limit ?? '60', 10) || 60, 200);
      const offset = Math.max(parseInt(q.offset ?? '0', 10) || 0, 0);
      const all = itemsInCollection(db(), userId, req.params.id, 10_000, 0);
      const items = all.slice(offset, offset + limit);
      return reply.send({ collection, items, total: all.length, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/api/v1/collections/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      if (!collectionById(db(), userId, req.params.id)) throw new HttpError(404, 'Collection not found');
      const input = collectionInput.partial().parse(req.body);
      const sets: string[] = [];
      const values: (string | number | null)[] = [];
      if (input.name !== undefined) {
        const conflict = db()
          .prepare('SELECT id FROM collections WHERE user_id = ? AND name = ? COLLATE NOCASE AND id != ?')
          .get(userId, input.name, req.params.id);
        if (conflict) throw new HttpError(409, 'A collection with that name already exists');
        sets.push('name = ?'); values.push(input.name);
      }
      if (input.emoji !== undefined) { sets.push('emoji = ?'); values.push(input.emoji); }
      if (input.color !== undefined) { sets.push('color = ?'); values.push(input.color); }
      if (input.isSmart !== undefined) {
        sets.push('is_smart = ?', 'smart_rule = ?');
        values.push(input.isSmart ? 1 : 0, input.isSmart && input.smartRule ? JSON.stringify(input.smartRule) : null);
      }
      if (sets.length) {
        db().prepare(`UPDATE collections SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...values, req.params.id, userId);
      }
      return reply.send({ collection: hydrate(userId, req.params.id) });
    } catch (err) {
      if (err instanceof z.ZodError) return sendError(reply, new HttpError(400, err.issues.map((i) => i.message).join('; ')));
      return sendError(reply, err);
    }
  });

  app.delete('/api/v1/collections/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      if (!collectionById(db(), userId, req.params.id)) throw new HttpError(404, 'Collection not found');
      db().prepare('DELETE FROM collections WHERE id = ? AND user_id = ?').run(req.params.id, userId);
      return reply.code(204).send();
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/v1/collections/:id/apply', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const row = collectionById(db(), userId, req.params.id);
      if (!row) throw new HttpError(404, 'Collection not found');
      if (!row.is_smart || !row.smart_rule) throw new HttpError(400, 'Not a smart collection');
      const rule = JSON.parse(row.smart_rule) as { matchType?: string };
      if (!rule.matchType) throw new HttpError(400, 'Smart rule has no type');

      const rows = db()
        .prepare('SELECT id FROM items WHERE user_id = ? AND type = ? AND done = 0')
        .all(userId, rule.matchType) as { id: string }[];
      const stmt = db().prepare('INSERT OR IGNORE INTO item_collections (item_id, collection_id) VALUES (?, ?)');
      let applied = 0;
      for (const r of rows) {
        const res = stmt.run(r.id, row.id);
        applied += Number(res.changes);
        rebuildSearchTsv(db(), userId, r.id);
      }
      return reply.send({ applied });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post<{ Params: { id: string; itemId: string } }>('/api/v1/collections/:id/items/:itemId', async (req, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const row = collectionById(db(), userId, req.params.id);
      if (!row) throw new HttpError(404, 'Collection not found');
      const item = loadItem(db(), userId, req.params.itemId);
      if (!item) throw new HttpError(404, 'Item not found');
      const next = new Set(item.collections);
      next.add(row.id);
      setItemCollections(db(), userId, item.id, [...next]);
      return reply.send({ item: loadItem(db(), userId, item.id) });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete<{ Params: { id: string; itemId: string } }>('/api/v1/collections/:id/items/:itemId', async (req, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const row = collectionById(db(), userId, req.params.id);
      if (!row) throw new HttpError(404, 'Collection not found');
      const item = loadItem(db(), userId, req.params.itemId);
      if (!item) throw new HttpError(404, 'Item not found');
      const next = new Set(item.collections);
      next.delete(row.id);
      setItemCollections(db(), userId, item.id, [...next]);
      return reply.send({ item: loadItem(db(), userId, item.id) });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}