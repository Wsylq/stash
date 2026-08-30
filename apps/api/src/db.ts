import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AiLog,
  Collection,
  Item,
  ItemType,
  Tag,
} from '@stash/shared';

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) throw new Error('Database not opened');
  return _db;
}

export function openDb(dataDir: string): DatabaseSync {
  const file = path.join(dataDir, 'stash.db');
  const isNew = !fs.existsSync(file);
  const instance = new DatabaseSync(file);
  instance.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  migrate(instance);
  if (isNew) {
    console.log(`[stash] Created database at ${file}`);
  }
  _db = instance;
  return instance;
}

function migrate(d: DatabaseSync): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      settings_enc TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '',
      is_smart INTEGER NOT NULL DEFAULT 0,
      smart_rule TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      url TEXT,
      source TEXT,
      description TEXT,
      text_content TEXT,
      extracted TEXT,
      thumbnail_url TEXT,
      provider TEXT,
      model TEXT,
      ai_status TEXT NOT NULL DEFAULT 'none',
      ai_error TEXT,
      starred INTEGER NOT NULL DEFAULT 0,
      done INTEGER NOT NULL DEFAULT 0,
      done_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      search_tsv TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_items_type ON items(user_id, type);
    CREATE INDEX IF NOT EXISTS idx_items_done ON items(user_id, done);

    CREATE TABLE IF NOT EXISTS item_tags (
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (item_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS item_collections (
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      PRIMARY KEY (item_id, collection_id)
    );

    CREATE TABLE IF NOT EXISTS ai_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
      feature TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_logs_user ON ai_logs(user_id, created_at DESC);
  `);
}

// ---------- row shapes ----------

interface ItemRow {
  id: string;
  type: ItemType;
  title: string;
  url: string | null;
  source: string | null;
  description: string | null;
  text_content: string | null;
  extracted: string | null;
  thumbnail_url: string | null;
  provider: string | null;
  model: string | null;
  ai_status: string;
  ai_error: string | null;
  starred: number;
  done: number;
  done_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TagRow { id: string; name: string }
interface UserRow { id: string; email: string; password_hash: string; settings_enc: string; created_at: string }
export interface CollectionRow {
  id: string; user_id: string; name: string; emoji: string; color: string;
  is_smart: number; smart_rule: string | null; created_at: string;
}

export function rowToItem(row: ItemRow, tags: Tag[] = [], collections: string[] = []): Item {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    url: row.url,
    source: row.source,
    description: row.description,
    textContent: row.text_content,
    extracted: row.extracted ? JSON.parse(row.extracted) : null,
    thumbnailUrl: row.thumbnail_url,
    provider: row.provider,
    model: row.model,
    aiStatus: row.ai_status as Item['aiStatus'],
    aiError: row.ai_error,
    starred: !!row.starred,
    done: !!row.done,
    doneAt: row.done_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags,
    collections,
  };
}

export function rowToCollection(r: CollectionRow): Collection {
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    color: r.color,
    isSmart: !!r.is_smart,
    smartRule: r.smart_rule,
    itemCount: 0,
    createdAt: r.created_at,
  };
}

// ---------- generic helpers ----------

export function getUser(d: DatabaseSync, id: string): UserRow | undefined {
  return d.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function getUserByEmail(d: DatabaseSync, email: string): UserRow | undefined {
  return d.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
}

export function countUsers(d: DatabaseSync): number {
  const row = d.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  return row.n;
}

// ---------- items ----------

export function loadItem(d: DatabaseSync, userId: string, itemId: string): Item | null {
  const row = d.prepare('SELECT * FROM items WHERE id = ? AND user_id = ?').get(itemId, userId) as ItemRow | undefined;
  if (!row) return null;
  return rowToItem(row, itemTags(d, itemId), itemCollections(d, itemId));
}

export function itemTags(d: DatabaseSync, itemId: string): Tag[] {
  return d
    .prepare(
      `SELECT t.id, t.name FROM tags t
       JOIN item_tags it ON it.tag_id = t.id
       WHERE it.item_id = ? ORDER BY t.name COLLATE NOCASE`,
    )
    .all(itemId) as unknown as Tag[];
}

export function itemCollections(d: DatabaseSync, itemId: string): string[] {
  const rows = d
    .prepare('SELECT collection_id FROM item_collections WHERE item_id = ?')
    .all(itemId) as { collection_id: string }[];
  return rows.map((r) => r.collection_id);
}

export function ensureTag(d: DatabaseSync, userId: string, name: string): Tag {
  name = name.trim();
  const existing = d.prepare('SELECT * FROM tags WHERE user_id = ? AND name = ? COLLATE NOCASE').get(userId, name) as TagRow | undefined;
  if (existing) return existing;
  const id = `t_${Math.random().toString(16).slice(2, 14)}`;
  d.prepare('INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)').run(id, userId, name);
  return { id, name };
}

export function buildSearchTsv(item: Pick<Item, 'title' | 'url' | 'description' | 'textContent'> & { tags: Tag[]; collections: string[] }, collectionsById: Map<string, string>): string {
  const collNames = item.collections.map((c) => collectionsById.get(c) || '').join(' ');
  return [item.title, item.url, item.description, item.textContent, item.tags.map((t) => t.name).join(' '), collNames]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function insertItem(d: DatabaseSync, userId: string, params: {
  id: string;
  type: ItemType;
  title: string;
  url: string | null;
  source: string | null;
  description: string | null;
  textContent: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
  tags: Tag[];
  collections: string[];
}): void {
  const search = buildSearchTsv(
    {
      title: params.title,
      url: params.url,
      description: params.description,
      textContent: params.textContent,
      tags: params.tags,
      collections: params.collections,
    },
    collectionsByName(d, userId),
  );
  d.prepare(
    `INSERT INTO items (id, user_id, type, title, url, source, description, text_content,
       thumbnail_url, created_at, updated_at, search_tsv) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.id, userId, params.type, params.title, params.url, params.source,
    params.description, params.textContent, params.thumbnailUrl,
    params.createdAt, params.createdAt, search,
  );
  setItemTags(d, userId, params.id, params.tags);
  setItemCollections(d, userId, params.id, params.collections);
}

export function setItemTags(d: DatabaseSync, userId: string, itemId: string, tags: Tag[]): void {
  d.prepare('DELETE FROM item_tags WHERE item_id = ?').run(itemId);
  const stmt = d.prepare('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)');
  for (const t of tags) stmt.run(itemId, t.id);
  rebuildSearchTsv(d, userId, itemId);
}

export function setItemCollections(d: DatabaseSync, userId: string, itemId: string, collectionIds: string[]): void {
  d.prepare('DELETE FROM item_collections WHERE item_id = ?').run(itemId);
  const stmt = d.prepare('INSERT OR IGNORE INTO item_collections (item_id, collection_id) VALUES (?, ?)');
  for (const c of collectionIds) stmt.run(itemId, c);
  rebuildSearchTsv(d, userId, itemId);
}

export function updateItemRow(d: DatabaseSync, userId: string, itemId: string, patch: {
  title?: string;
  type?: ItemType;
  description?: string | null;
  url?: string | null;
  textContent?: string | null;
  starred?: boolean;
  done?: boolean;
  doneAt?: string | null;
  aiStatus?: string;
  aiError?: string | null;
  provider?: string | null;
  model?: string | null;
  extracted?: string | null;
}): void {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (patch.title !== undefined) { sets.push('title = ?'); values.push(patch.title); }
  if (patch.type !== undefined) { sets.push('type = ?'); values.push(patch.type); }
  if ('description' in patch) { sets.push('description = ?'); values.push(patch.description ?? null); }
  if ('url' in patch) { sets.push('url = ?'); values.push(patch.url ?? null); }
  if ('textContent' in patch) { sets.push('text_content = ?'); values.push(patch.textContent ?? null); }
  if (patch.starred !== undefined) { sets.push('starred = ?'); values.push(patch.starred ? 1 : 0); }
  if (patch.done !== undefined) {
    sets.push('done = ?', 'done_at = ?');
    values.push(patch.done ? 1 : 0, patch.done ? new Date().toISOString() : null);
  }
  if (patch.aiStatus !== undefined) { sets.push('ai_status = ?'); values.push(patch.aiStatus); }
  if ('aiError' in patch) { sets.push('ai_error = ?'); values.push(patch.aiError ?? null); }
  if ('provider' in patch) { sets.push('provider = ?'); values.push(patch.provider ?? null); }
  if ('model' in patch) { sets.push('model = ?'); values.push(patch.model ?? null); }
  if ('extracted' in patch) { sets.push('extracted = ?'); values.push(patch.extracted ?? null); }
  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  if (sets.length === 1) return;
  d.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...values, itemId, userId);
  rebuildSearchTsv(d, userId, itemId);
}

export function rebuildSearchTsv(d: DatabaseSync, userId: string, itemId: string): void {
  const row = d.prepare('SELECT * FROM items WHERE id = ? AND user_id = ?').get(itemId, userId) as ItemRow | undefined;
  if (!row) return;
  const tags = itemTags(d, itemId);
  const collIds = itemCollections(d, itemId);
  const tsv = buildSearchTsv(
    {
      title: row.title,
      url: row.url,
      description: row.description,
      textContent: row.text_content,
      tags,
      collections: collIds,
    },
    collectionsByName(d, userId),
  );
  d.prepare('UPDATE items SET search_tsv = ? WHERE id = ?').run(tsv, itemId);
}

export function deleteItem(d: DatabaseSync, userId: string, itemId: string): boolean {
  const res = d.prepare('DELETE FROM items WHERE id = ? AND user_id = ?').run(itemId, userId);
  return res.changes > 0;
}

// ---------- collections ----------

export function listCollections(d: DatabaseSync, userId: string): CollectionRow[] {
  return d
    .prepare('SELECT * FROM collections WHERE user_id = ? ORDER BY name COLLATE NOCASE')
    .all(userId) as unknown as CollectionRow[];
}

export function collectionById(d: DatabaseSync, userId: string, id: string): CollectionRow | undefined {
  return d.prepare('SELECT * FROM collections WHERE id = ? AND user_id = ?').get(id, userId) as CollectionRow | undefined;
}

export function smartCollections(d: DatabaseSync, userId: string): CollectionRow[] {
  return d
    .prepare('SELECT * FROM collections WHERE user_id = ? AND is_smart = 1')
    .all(userId) as unknown as CollectionRow[];
}

export function collectionsByName(d: DatabaseSync, userId: string): Map<string, string> {
  const rows = listCollections(d, userId);
  const m = new Map<string, string>();
  for (const r of rows) m.set(r.id, r.name);
  return m;
}

export function countCollectionItems(d: DatabaseSync, userId: string, collectionId: string): number {
  const row = d
    .prepare(
      `SELECT COUNT(*) AS n FROM item_collections ic
       JOIN items i ON i.id = ic.item_id
       WHERE ic.collection_id = ? AND i.user_id = ?`,
    )
    .get(collectionId, userId) as { n: number };
  return row.n;
}

export function itemsInCollection(d: DatabaseSync, userId: string, collectionId: string, limit: number, offset: number): Item[] {
  const rows = d
    .prepare(
      `SELECT i.* FROM items i
       JOIN item_collections ic ON ic.item_id = i.id
       WHERE ic.collection_id = ? AND i.user_id = ?
       ORDER BY i.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(collectionId, userId, limit, offset) as unknown as ItemRow[];
  return rows.map((r) => fullItem(d, r));
}

// ---------- search ----------

export interface SearchFilters {
  q?: string;
  type?: ItemType;
  collectionId?: string;
  tag?: string;
  starred?: boolean;
  done?: boolean;
  unconsumed?: boolean;
  limit: number;
  offset: number;
}

export function searchItems(d: DatabaseSync, userId: string, f: SearchFilters): { items: Item[]; total: number } {
  const where = ['i.user_id = ?'];
  const values: (string | number)[] = [userId];
  if (f.q && f.q.trim()) {
    values.push(`%${f.q.trim().toLowerCase()}%`);
    where.push('i.search_tsv LIKE ?');
  }
  if (f.type) { values.push(f.type); where.push('i.type = ?'); }
  if (f.collectionId) {
    values.push(f.collectionId);
    where.push('EXISTS (SELECT 1 FROM item_collections ic WHERE ic.item_id = i.id AND ic.collection_id = ?)');
  }
  if (f.tag) {
    values.push(f.tag);
    where.push('EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id AND t.name = ? COLLATE NOCASE)');
  }
  if (f.starred === true) where.push('i.starred = 1');
  if (f.done === true) where.push('i.done = 1');
  if (f.unconsumed === true) where.push('i.done = 0');

  const whereSql = where.join(' AND ');
  const totalRow = d.prepare(`SELECT COUNT(*) AS n FROM items i WHERE ${whereSql}`).get(...values) as { n: number };
  const rows = d
    .prepare(`SELECT i.* FROM items i WHERE ${whereSql} ORDER BY i.created_at DESC LIMIT ? OFFSET ?`)
    .all(...values, f.limit, f.offset) as unknown as ItemRow[];
  return { items: rows.map((r) => fullItem(d, r)), total: totalRow.n };
}

function fullItem(d: DatabaseSync, row: ItemRow): Item {
  const item = rowToItem(row, itemTags(d, row.id), itemCollections(d, row.id));
  return item;
}

// ---------- stats ----------

export function userStats(d: DatabaseSync, userId: string) {
  const row = d
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN done = 0 THEN 1 ELSE 0 END) AS unconsumed,
              SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN starred = 1 THEN 1 ELSE 0 END) AS starred,
              (SELECT COUNT(DISTINCT type) FROM items WHERE user_id = ?) AS types
       FROM items WHERE user_id = ?`,
    )
    .get(userId, userId) as { total: number; unconsumed: number; done: number; starred: number; types: number } | undefined;
  const byTypeRows = d
    .prepare('SELECT type, COUNT(*) AS n FROM items WHERE user_id = ? GROUP BY type')
    .all(userId) as { type: string; n: number }[];
  const byType: Record<string, number> = {};
  for (const r of byTypeRows) byType[r.type] = r.n;
  const total = row?.total ?? 0;
  return {
    total,
    unconsumed: row?.unconsumed ?? 0,
    done: row?.done ?? 0,
    starred: row?.starred ?? 0,
    byType,
    consumedRatio: total > 0 ? (row?.done ?? 0) / total : 0,
  };
}

// ---------- ai logs ----------

export function insertAiLog(d: DatabaseSync, userId: string, itemId: string | null, log: Omit<AiLog, 'id' | 'createdAt'>): void {
  d.prepare(
    `INSERT INTO ai_logs (id, user_id, item_id, feature, provider, model, prompt_tokens, completion_tokens, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `l_${Math.random().toString(16).slice(2, 14)}`, userId, itemId, log.feature, log.provider, log.model,
    log.promptTokens, log.completionTokens, log.durationMs, new Date().toISOString(),
  );
}

export function listAiLogs(d: DatabaseSync, userId: string, limit: number): AiLog[] {
  return d
    .prepare(
      `SELECT id, feature, provider, model, prompt_tokens AS promptTokens, completion_tokens AS completionTokens,
              duration_ms AS durationMs, created_at AS createdAt
       FROM ai_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userId, limit) as unknown as AiLog[];
}