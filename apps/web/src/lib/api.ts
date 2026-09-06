'use client';

import type {
  AiLog,
  AiPreset,
  AiSettings,
  AiSettingsView,
  AuthResponse,
  Collection,
  CollectionInput,
  DecidedItem,
  ExportPayload,
  Item,
  ItemInput,
  ItemType,
  ItemUpdate,
  PublicUser,
  Stats,
} from '@stash/shared';

const TOKEN_KEY = 'stash_token';
const USER_KEY = 'stash_user';
const API = '/api/v1';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAuth(token: string | null, user: PublicUser | null): void {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
  if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  else window.localStorage.removeItem(USER_KEY);
}

export function getCachedUser(): PublicUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as PublicUser) : null;
  } catch {
    return null;
  }
}

export function cacheUser(user: PublicUser): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function onUnauthorized(cb: () => void): () => void {
  if (typeof window !== 'undefined') {
    window.addEventListener('stash:unauthorized', cb);
    return () => window.removeEventListener('stash:unauthorized', cb);
  }
  return () => {};
}

export function isAuthed(): boolean {
  return !!getToken();
}

type Body = Record<string, unknown> | BodyInit | null;

async function request<T>(path: string, options: { method?: string; body?: Body; headers?: Record<string, string> } = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  const isForm = options.body instanceof FormData;
  if (options.body && !isForm && typeof options.body === 'object' && !(options.body instanceof Blob) && !(options.body instanceof ArrayBuffer)) {
    headers['content-type'] = 'application/json';
  }
  if (token) headers.authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body
        ? isForm
          ? (options.body as FormData)
          : typeof options.body === 'string' || options.body instanceof Blob || options.body instanceof ArrayBuffer
            ? options.body
            : JSON.stringify(options.body)
        : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the Stash server. Is it running?');
  }

  if (res.status === 401 && (token || getCachedUser())) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('stash:unauthorized'));
    throw new ApiError(401, 'Session expired — sign in again');
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch { /* keep default */ }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  // auth
  register: (email: string, password: string) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: { email, password } }),
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request<PublicUser>('/auth/me'),
  getItemMedia: (id: string) =>
    request<{ type: 'video' | 'image' | 'carousel' | 'embed'; url?: string; poster?: string | null; items?: { type: 'image' | 'video'; url: string; poster?: string | null }[] }>(`/items/${id}/media`),

  // items
  listItems: (params: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    const s = qs.toString();
    return request<{ items: Item[]; total: number }>(`/items${s ? `?${s}` : ''}`);
  },
  getItem: (id: string) => request<{ item: Item }>(`/items/${id}`),
  createItem: (input: ItemInput) => request<{ item: Item }>('/items', { method: 'POST', body: input as unknown as Record<string, unknown> }),
  updateItem: (id: string, patch: ItemUpdate) =>
    request<{ item: Item }>(`/items/${id}`, { method: 'PATCH', body: patch as unknown as Record<string, unknown> }),
  deleteItem: (id: string) => request<void>(`/items/${id}`, { method: 'DELETE' }),
  enrichItem: (id: string) => request<{ item: Item }>(`/items/${id}/enrich`, { method: 'POST' }),
  decide: (params: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    return request<DecidedItem>(`/decide?${qs.toString()}`);
  },

  // collections
  listCollections: () => request<{ collections: Collection[] }>('/collections'),
  getCollection: (id: string) => request<{ collection: Collection; items: Item[]; total: number }>(`/collections/${id}`),
  createCollection: (input: CollectionInput) =>
    request<{ collection: Collection }>('/collections', { method: 'POST', body: input as unknown as Record<string, unknown> }),
  updateCollection: (id: string, input: Partial<CollectionInput>) =>
    request<{ collection: Collection }>(`/collections/${id}`, { method: 'PATCH', body: input as unknown as Record<string, unknown> }),
  deleteCollection: (id: string) => request<void>(`/collections/${id}`, { method: 'DELETE' }),
  applySmart: (id: string) => request<{ applied: number }>(`/collections/${id}/apply`, { method: 'POST' }),

  // settings / AI
  getSettings: () => request<{ settings: AiSettingsView }>('/settings'),
  saveSettings: (patch: Partial<AiSettings>) =>
    request<{ settings: AiSettingsView }>('/settings', { method: 'PUT', body: patch as unknown as Record<string, unknown> }),
  applyPreset: (id: string) => request<{ settings: AiSettingsView }>(`/settings/ai/preset/${id}`),
  testAi: (patch: Partial<AiSettings>) =>
    request<{ ok: boolean; latencyMs: number; model: string; error?: string }>('/settings/ai/test', {
      method: 'POST',
      body: patch as unknown as Record<string, unknown>,
    }),
  clearAi: () => request<{ settings: AiSettingsView }>('/settings/ai', { method: 'DELETE' }),
  aiPresets: () => request<{ presets: AiPreset[] }>('/settings/ai/presets'),
  aiLogs: (limit = 100) => request<{ logs: AiLog[] }>(`/settings/ai/logs?limit=${limit}`),

  stats: () => request<{ stats: Stats }>('/stats'),

  exportJson: async (): Promise<{ blob: Blob; payload: ExportPayload }> => {
    const token = getToken();
    const res = await fetch(`${API}/export`, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new ApiError(res.status, `Export failed (${res.status})`);
    const payload = (await res.json()) as ExportPayload;
    return { blob: new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), payload };
  },

  importJson: (payload: { items: unknown[] }) =>
    request<{ imported: number }>('/import', { method: 'POST', body: payload as unknown as Record<string, unknown> }),
};

export function fetchItemTypeHint(text: string, url?: string | null): ItemType | null {
  if (url) {
    const u = new URL(url);
    const host = u.hostname;
    if (/(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|twitch\.tv)$/.test(host)) return 'video';
    if (/(^|\.)(allrecipes\.com|foodnetwork\.com|seriouseats\.com|bonappetit\.com|food52\.com)$/.test(host)) return 'recipe';
    if (/instagram\.com$/.test(host)) return /\/reel\/|\/reels\/|\/tv\//.test(u.pathname) ? 'video' : 'image';
    if (/amazon\.|store\.steampowered\.com/.test(host)) return 'product';
    if (/open\.spotify\.com|soundcloud\.com/.test(host)) return 'music';
    if (/imdb\.com|letterboxd\.com/.test(host)) return 'movie';
    return null;
  }
  const t = (text ?? '').toLowerCase();
  if (/\b(ingredients|recipe|preheat|bake|tbsp|teaspoon|cup of)\b/.test(t)) return 'recipe';
  if (/\b(sets|x\s?\d|reps|squat|deadlift|push.?up|workout|routine)\b/.test(t)) return 'workout';
  return null;
}