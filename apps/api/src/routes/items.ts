import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ItemType } from '@stash/shared';
import { ITEM_TYPES } from '@stash/shared';
import { newId } from '../config.js';
import {
  getDb,
  insertItem,
  loadItem,
  ensureTag,
  setItemTags,
  setItemCollections,
  updateItemRow,
  deleteItem,
  searchItems,
  smartCollections,
  itemCollections,
  rebuildSearchTsv,
} from '../db.js';
import { HttpError, requireAuth, sendError } from '../helpers.js';
import type { Config } from '../config.js';
import { enrichItem, loadAiSettings } from '../services/ai.js';
import { detectTypeFromUrl, fetchMeta, fetchOEmbed, fetchPageText, isLikelyVideoUrl, safeUrl } from '../services/fetcher.js';

const itemInput = z.object({
  url: z.string().trim().url().max(2048).nullable().optional(),
  text: z.string().trim().max(100_000).nullable().optional(),
  title: z.string().trim().max(300).nullable().optional(),
  type: z.enum(ITEM_TYPES).nullable().optional(),
  collectionIds: z.array(z.string().max(64)).max(50).optional(),
  tagNames: z.array(z.string().trim().max(40)).max(20).optional(),
  enrich: z.boolean().optional(),
  matchCollections: z.boolean().optional(),
});

const itemPatch = z.object({
  title: z.string().trim().max(300).nullable().optional(),
  type: z.enum(ITEM_TYPES).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  url: z.string().url().max(2048).nullable().optional(),
  textContent: z.string().max(100_000).nullable().optional(),
  starred: z.boolean().nullable().optional(),
  done: z.boolean().nullable().optional(),
  collectionIds: z.array(z.string().max(64)).max(50).nullable().optional(),
  tagNames: z.array(z.string().trim().max(40)).max(20).nullable().optional(),
});

type ItemInput = z.infer<typeof itemInput>;

function firstLine(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

interface DirectMediaItem {
  type: 'image' | 'video';
  url: string;
  poster?: string | null;
}

interface DirectMedia {
  type: 'video' | 'image' | 'carousel';
  url?: string;
  poster?: string | null;
  items?: DirectMediaItem[];
}

const mediaCache = new Map<string, { at: number; data: DirectMedia | null }>();

function unescapeEmbedUrl(raw: string): string {
  return raw
    .replace(/\\+u002F/g, '/')
    .replace(/\\+u0026/g, '&')
    .replace(/\\+u0025/g, '%')
    .replace(/\\+u003D/g, '=')
    .replace(/\\+u002B/g, '+')
    .replace(/\\+u003A/g, ':')
    .replace(/\\+u003F/g, '?')
    .replace(/\\+\//g, '/')
    .replace(/\\+/g, '')
    .replace(/&amp;/g, '&');
}

function collectEmbedImages(html: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    if (!raw) return;
    const url = raw.replace(/&amp;/g, '&');
    if (!url.startsWith('http')) return;
    try {
      if (/s100x100|s150x150|s200x200|rsrc\.php/.test(url)) return;
      const basename = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
      if (!basename || seen.has(basename)) return;
      seen.add(basename);
      out.push(url);
    } catch { /* ignore malformed URLs */ }
  };
  for (const m of html.matchAll(/["']EmbeddedMediaImage["'][^>]*src=["']([^"']+)["']/g)) add(m[1]);
  let idx = html.indexOf('display_url');
  while (idx !== -1) {
    const start = html.indexOf('https', idx);
    const end = html.indexOf('\\"', start);
    if (start !== -1 && end !== -1 && end - start < 4096) add(unescapeEmbedUrl(html.slice(start, end)));
    idx = html.indexOf('display_url', idx + 1);
  }
  return out;
}

function collectEmbedVideos(html: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let idx = html.indexOf('video_url');
  while (idx !== -1) {
    const start = html.indexOf('https', idx);
    const end = html.indexOf('\\"', start);
    if (start !== -1 && end !== -1 && end - start < 4096) {
      const url = unescapeEmbedUrl(html.slice(start, end));
      if (url.startsWith('http') && !seen.has(url)) {
        seen.add(url);
        out.push(url);
      }
    }
    idx = html.indexOf('video_url', idx + 1);
  }
  return out;
}

async function fetchDirectMedia(url: string): Promise<DirectMedia | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host !== 'instagram.com' && !host.endsWith('.instagram.com')) return null;
  const m = u.pathname.match(/^\/(reel|reels|p|tv)\/([^/?#]+)/);
  if (!m) return null;

  const kind = m[1] === 'reels' ? 'reel' : m[1];
  const cacheKey = `${kind}/${m[2]}`;
  const hit = mediaCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.data;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  let data: DirectMedia | null = null;
  try {
    const res = await fetch(`https://www.instagram.com/${kind}/${m[2]}/embed/`, {
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/126' },
    });
    if (res.ok) {
      const html = await res.text();
      const images = collectEmbedImages(html);
      const videos = collectEmbedVideos(html);
      if (videos.length === 1 && images.length <= 1) {
        data = { type: 'video', url: videos[0], poster: images[0] ?? null };
      } else if (videos.length === 0 && images.length === 1) {
        data = { type: 'image', url: images[0] };
      } else if (images.length > 0 || videos.length > 0) {
        const items: DirectMediaItem[] = [];
        if (images.length > 0 && images.length === videos.length) {
          for (let i = 0; i < images.length; i++) items.push({ type: 'video', url: videos[i], poster: images[i] });
        } else {
          for (const image of images) items.push({ type: 'image', url: image });
          for (const video of videos) items.push({ type: 'video', url: video });
        }
        data = { type: 'carousel', items };
      }
    }
  } catch {
    data = null;
  } finally {
    clearTimeout(timer);
  }

  mediaCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

export function registerItems(app: FastifyInstance, config: Config): void {
  const db = () => getDb();

  app.post('/api/v1/items', async (req: FastifyRequest, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const input = itemInput.parse(req.body) as ItemInput;
      if (!input.url && !input.text) {
        throw new HttpError(400, 'Provide a URL and/or text to save');
      }
      if (input.url && !safeUrl(input.url)) {
        throw new HttpError(400, 'That does not look like a valid http(s) URL');
      }

      let title = input.title ?? '';
      let description: string | null = null;
      let thumbnail: string | null = null;
      let ogType: string | null = null;
      let source: string | null = null;

      if (input.url) {
        const parsed = safeUrl(input.url)!;
        source = parsed.hostname.replace(/^www\./, '');
        try {
          if (isLikelyVideoUrl(input.url)) {
            const oembed = await fetchOEmbed(input.url, config.fetchTimeoutMs);
            if (oembed) {
              title = title || (oembed.title ?? '');
              thumbnail = oembed.thumbnail_url ?? null;
              description = oembed.description ?? null;
            }
          }
          const meta = title ? null : await fetchMeta(input.url, config.fetchTimeoutMs);
          if (meta) {
            title = title || (meta.title ?? '');
            description = description ?? meta.description;
            thumbnail = thumbnail ?? meta.image;
            ogType = meta.title ? ogType : null;
          }
        } catch { /* metadata fetch is best-effort */ }
        if (!title) title = input.url;
      }

      if (!input.url && input.text) {
        title = title || firstLine(input.text);
        if (!input.text.trim() && !title) throw new HttpError(400, 'Nothing to save — add a URL or some text');
      }
      if (input.text && !input.url && !title) title = firstLine(input.text);

      const declaredType: ItemType | undefined = input.type ?? undefined;
      const type: ItemType = declaredType ?? (input.url ? detectTypeFromUrl(input.url, ogType) : 'note');

      const tagRows = (input.tagNames ?? []).filter((t) => t.trim()).map((t) => ensureTag(db(), userId, t));
      let collectionIds = input.collectionIds ?? [];
      if (collectionIds.length) {
        const own = db()
          .prepare('SELECT COUNT(*) AS n FROM collections WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))')
          .get(userId, JSON.stringify(collectionIds)) as { n: number };
        if (own.n !== new Set(collectionIds).size) throw new HttpError(404, 'One or more collections not found');
      }

      const id = newId('i_');
      const now = new Date().toISOString();
      insertItem(db(), userId, {
        id,
        type,
        title: (title || '(untitled)').slice(0, 300),
        url: input.url ?? null,
        source,
        description,
        textContent: input.text ?? null,
        thumbnailUrl: thumbnail,
        createdAt: now,
        tags: tagRows,
        collections: collectionIds,
      });

      if (input.matchCollections !== false) {
        matchSmartCollections(userId, id, type);
      }

      const enrichRequested = !!input.enrich;
      if (enrichRequested) {
        void runEnrichment(userId, id, typeof input.url === 'string' ? input.url : null, input.text ?? null, config);
      }

      const item = loadItem(db(), userId, id);
      return reply.code(201).send({ item });
    } catch (err) {
      if (err instanceof z.ZodError) return sendError(reply, new HttpError(400, err.issues.map((i) => i.message).join('; ')));
      return sendError(reply, err);
    }
  });

  app.get('/api/v1/items', async (req: FastifyRequest, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const q = req.query as Record<string, string | undefined>;
      const { items, total } = searchItems(db(), userId, {
        q: q.q,
        type: q.type && ITEM_TYPES.includes(q.type as ItemType) ? (q.type as ItemType) : undefined,
        collectionId: q.collection,
        tag: q.tag,
        starred: q.starred === 'true',
        done: q.done === 'true',
        unconsumed: q.unconsumed === 'true',
        limit: Math.min(parseInt(q.limit ?? '60', 10) || 60, 200),
        offset: Math.max(parseInt(q.offset ?? '0', 10) || 0, 0),
      });
      return reply.send({ items, total, limit: 60, offset: Number(q.offset ?? 0) });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/v1/items/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const item = loadItem(db(), userId, req.params.id);
      if (!item) throw new HttpError(404, 'Item not found');
      return reply.send({ item });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/v1/items/:id/media', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const item = loadItem(db(), userId, req.params.id);
      if (!item) throw new HttpError(404, 'Item not found');
      return reply.send((await fetchDirectMedia(item.url ?? '')) ?? { type: 'embed' });
    } catch {
      return reply.send({ type: 'embed' });
    }
  });

  app.patch('/api/v1/items/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const patch = itemPatch.parse(req.body);
      const item = loadItem(db(), userId, req.params.id);
      if (!item) throw new HttpError(404, 'Item not found');

      await updateItemRow(db(), userId, item.id, {
        ...(patch.title !== undefined && patch.title !== null ? { title: patch.title } : {}),
        ...(patch.type ? { type: patch.type } : {}),
        ...(patch.description !== undefined ? { description: patch.description ?? '' } : {}),
        ...(patch.url !== undefined ? { url: patch.url ?? null } : {}),
        ...(patch.textContent !== undefined ? { textContent: patch.textContent ?? '' } : {}),
        ...(patch.starred !== undefined && patch.starred !== null ? { starred: patch.starred } : {}),
        ...(patch.done !== undefined && patch.done !== null ? { done: patch.done } : {}),
      });

      if (patch.tagNames !== undefined && patch.tagNames !== null) {
        const tags = patch.tagNames.filter((t) => t.trim()).map((t) => ensureTag(db(), userId, t));
        setItemTags(db(), userId, item.id, tags);
      }
      if (patch.collectionIds !== undefined && patch.collectionIds !== null) {
        setItemCollections(db(), userId, item.id, patch.collectionIds);
      }

      return reply.send({ item: loadItem(db(), userId, item.id) });
    } catch (err) {
      if (err instanceof z.ZodError) return sendError(reply, new HttpError(400, err.issues.map((i) => i.message).join('; ')));
      return sendError(reply, err);
    }
  });

  app.delete('/api/v1/items/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      if (!deleteItem(db(), userId, req.params.id)) throw new HttpError(404, 'Item not found');
      return reply.code(204).send();
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/v1/items/:id/enrich', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const itemId = req.params.id;
      const item = loadItem(db(), userId, itemId);
      if (!item) throw new HttpError(404, 'Item not found');
      const settings = loadAiSettings(db(), userId, config.secret);
      if (!settings.apiKey) throw new HttpError(400, 'No AI provider configured — add an API key in Settings → AI');
      const text = item.textContent ?? (item.url ? (await fetchPageText(item.url, config.fetchTimeoutMs)) : null);
      if (item.url && !item.textContent && text) {
        updateItemRow(db(), userId, itemId, { textContent: text });
      }
      void runEnrichment(userId, itemId, item.url, text);
      return reply.send({ item: loadItem(db(), userId, itemId) });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/v1/decide', async (req: FastifyRequest, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const q = req.query as Record<string, string | undefined>;
      const { items, total } = searchItems(db(), userId, {
        type: q.type && ITEM_TYPES.includes(q.type as ItemType) ? (q.type as ItemType) : undefined,
        collectionId: q.collection,
        unconsumed: true,
        limit: 200,
        offset: 0,
      });
      if (items.length === 0) return reply.send({ item: null, poolSize: 0 });
      const pick = items[Math.floor(Math.random() * items.length)];
      return reply.send({ item: pick, poolSize: total });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  function matchSmartCollections(userId: string, itemId: string, type: ItemType): void {
    const collections = smartCollections(db(), userId);
    const matches = collections.filter((c) => {
      try {
        const rule = JSON.parse(c.smart_rule ?? 'null') as { matchType?: string } | null;
        return rule?.matchType === type;
      } catch {
        return false;
      }
    });
    if (!matches.length) return;
    const existing = new Set(itemCollections(db(), itemId));
    for (const m of matches) existing.add(m.id);
    setItemCollections(db(), userId, itemId, [...existing]);
  }

  async function runEnrichment(userId: string, itemId: string, url: string | null, existingText: string | null, cfg?: Config): Promise<void> {
    try {
      let text = existingText;
      if (!text && url) {
        try {
          text = await fetchPageText(url, cfg?.fetchTimeoutMs ?? config.fetchTimeoutMs);
        } catch { text = null; }
        if (text) {
          db().prepare('UPDATE items SET text_content = ?, updated_at = ? WHERE id = ? AND user_id = ?')
            .run(text, new Date().toISOString(), itemId, userId);
        }
      }
      const item = loadItem(db(), userId, itemId);
      if (!item) return;
      const settings = loadAiSettings(db(), userId, config.secret);
      await enrichItem(db(), userId, itemId, config.secret, {
        url,
        title: item.title,
        text: text ?? item.textContent,
      }, settings);
      rebuildSearchTsv(db(), userId, itemId);
    } catch (err) {
      console.error(`[stash] enrichment failed for ${itemId}: ${(err as Error).message}`);
    }
  }
}