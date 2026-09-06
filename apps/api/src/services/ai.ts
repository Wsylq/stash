import type {
  AiFeatureKey,
  AiFeatureSettings,
  AiPreset,
  AiSettings,
  AiSettingsView,
  ItemType,
} from '@stash/shared';
import { ITEM_TYPES } from '@stash/shared';
import type { DatabaseSync } from 'node:sqlite';
import { decryptSecret, encryptSecret } from '../crypto.js';
import { getUser } from '../db.js';

export const AI_PRESETS: AiPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    note: 'Key at platform.openai.com → API keys.',
  },
  {
    id: 'google',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    note: 'Free key at aistudio.google.com. Uses Google’s OpenAI-compatible endpoint.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (OpenAI-compat)',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-haiku-20241022',
    note: 'Key at console.anthropic.com. Uses Anthropic’s OpenAI-compatible endpoint with your Anthropic key.',
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    note: 'Free tier at console.groq.com. Fast, no credit card.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    note: 'One key, many free/cheap models at openrouter.ai.',
  },
  {
    id: 'local',
    label: 'Local (Ollama / LM Studio)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    note: 'Fully offline. Run Ollama or LM Studio on your machine/network.',
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    baseUrl: 'https://',
    defaultModel: '',
    note: 'Any endpoint implementing POST /chat/completions — vLLM, Together, DeepSeek, Fireworks…',
  },
];

export const DEFAULT_FEATURES = {
  summarize: true,
  categorize: true,
  extractRecipe: true,
  extractWorkout: true,
} as const;

export function defaultAiSettings(): AiSettings {
  return {
    preset: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: '',
    features: { ...DEFAULT_FEATURES },
    featureModels: {},
  };
}

export function applyPreset(presetId: string): AiSettings {
  const preset = AI_PRESETS.find((p) => p.id === presetId);
  if (!preset) return defaultAiSettings();
  return {
    preset: preset.id,
    baseUrl: preset.baseUrl,
    model: preset.defaultModel,
    apiKey: '',
    features: { ...DEFAULT_FEATURES },
    featureModels: {},
  };
}

const logger = {
  warn: (msg: string) => console.warn(`[stash:ai] ${msg}`),
};

export function loadAiSettings(d: DatabaseSync, userId: string, secret: string): AiSettings {
  const user = getUser(d, userId);
  if (!user || !user.settings_enc) return defaultAiSettings();
  try {
    const json = decryptSecret(user.settings_enc, secret);
    const parsed = JSON.parse(json) as Partial<AiSettings>;
    return {
      ...defaultAiSettings(),
      ...parsed,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      features: { ...DEFAULT_FEATURES, ...parsed.features },
      featureModels: parsed.featureModels ?? {},
    };
  } catch (err) {
    logger.warn(`Failed to decrypt settings for user ${userId}: ${(err as Error).message}`);
    return defaultAiSettings();
  }
}

export function saveAiSettings(
  d: DatabaseSync,
  userId: string,
  secret: string,
  patch: Partial<Omit<AiSettings, 'features'>> & { features?: Partial<AiFeatureSettings> },
): AiSettings {
  const current = loadAiSettings(d, userId, secret);
  const next: AiSettings = {
    ...current,
    ...patch,
    apiKey: typeof patch.apiKey === 'string' ? patch.apiKey.trim() : current.apiKey,
    features: { ...current.features, ...(patch.features ?? {}) },
    featureModels: patch.featureModels && Object.keys(patch.featureModels).length ? patch.featureModels : current.featureModels,
  };
  if (next.preset && next.preset !== 'custom' && !next.baseUrl) {
    const preset = AI_PRESETS.find((p) => p.id === next.preset);
    if (preset) next.baseUrl = preset.baseUrl;
  }
  const enc = encryptSecret(JSON.stringify(next), secret);
  d.prepare('UPDATE users SET settings_enc = ? WHERE id = ?').run(enc, userId);
  return next;
}

export function aiSettingsView(settings: AiSettings): AiSettingsView {
  const { apiKey, ...rest } = settings;
  return { ...rest, apiKeyConfigured: apiKey.length > 0 };
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super('No AI provider configured. Add an API key in Settings → AI.');
    this.name = 'AiNotConfiguredError';
  }
}

export class AiApiError extends Error {
  status: number;
  provider: string;
  constructor(provider: string, status: number, message: string) {
    super(message);
    this.name = 'AiApiError';
    this.status = status;
    this.provider = provider;
  }
}

interface ChatJsonResult {
  json: Record<string, unknown>;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  model: string;
  provider: string;
}

function providerErrorDetail(data: { error?: { message?: string; metadata?: { raw?: string } } }): string {
  const message = data.error?.message ?? '';
  let rawDetail = '';
  try {
    const raw = data.error?.metadata?.raw?.trim();
    if (raw?.startsWith('{')) {
      const parsed = JSON.parse(raw) as { message?: string };
      rawDetail = parsed.message ?? '';
    }
  } catch { /* ignore malformed metadata */ }
  return rawDetail || message;
}

const JSON_MODE_UNSUPPORTED = /response[\s_-]?format|structured[\s_-]?output|json_object|json schema|not support|unsupported/i;

async function callChat(
  settings: AiSettings,
  feature: AiFeatureKey,
  system: string,
  user: string,
  opts: { timeoutMs?: number } = {},
): Promise<ChatJsonResult> {
  if (!settings.apiKey) throw new AiNotConfiguredError();
  const model = settings.featureModels[feature] || settings.model;
  if (!model) throw new AiApiError(settings.preset, 0, 'No model configured for this feature.');
  const base = settings.baseUrl.replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  const timeoutMs = opts.timeoutMs ?? 90_000;

  const post = async (withJsonMode: boolean): Promise<Response> => {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: 0.2,
    };
    if (withJsonMode) body.response_format = { type: 'json_object' };
    return fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  };

  const started = Date.now();
  let res: Response;
  try {
    res = await post(true);
    if (!res.ok) {
      let body: { error?: { message?: string; metadata?: { raw?: string } } } | null = null;
      try {
        body = (await res.json()) as typeof body;
      } catch { /* ignore */ }
      if (body && JSON_MODE_UNSUPPORTED.test(providerErrorDetail(body))) {
        res = await post(false);
      } else {
        throw new AiApiError(settings.preset, res.status, providerErrorDetail(body ?? {}) || `Provider returned HTTP ${res.status}.`);
      }
    }
  } catch (err) {
    if (err instanceof AiApiError) throw err;
    const name = (err as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new AiApiError(settings.preset, 0, `Request timed out after ${timeoutMs}ms.`);
    }
    throw new AiApiError(settings.preset, 0, `Network error: ${(err as Error).message}`);
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = providerErrorDetail((await res.json()) as { error?: { message?: string; metadata?: { raw?: string } } });
    } catch { /* ignore */ }
    throw new AiApiError(settings.preset, res.status, detail || `Provider returned HTTP ${res.status}.`);
  }
  const data = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new AiApiError(settings.preset, 0, 'Malformed response from provider (no message content).');
  const json = parseJson(content);
  if (!json) throw new AiApiError(settings.preset, 0, 'Provider response was not valid JSON.');
  return {
    json,
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    durationMs: Date.now() - started,
    model: data.model ?? model,
    provider: settings.preset,
  };
}

function parseJson(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    const v = JSON.parse(candidate);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function stype(v: unknown): ItemType {
  return ITEM_TYPES.includes(v as ItemType) ? (v as ItemType) : 'link';
}

export async function testConnection(settings: AiSettings): Promise<{ ok: boolean; latencyMs: number; model: string; error?: string }> {
  const started = Date.now();
  try {
    const result = await callChat(settings, 'summarize', 'Reply with a single JSON object.', 'Return the JSON object {"pong":true}', { timeoutMs: 30_000 });
    return { ok: true, latencyMs: Date.now() - started, model: result.model };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - started, model: '', error: (err as Error).message };
  }
}

// ---------- enrichment ----------

export interface EnrichResult {
  status: 'ok' | 'skipped' | 'error';
  message?: string;
  type?: ItemType;
}

const SYSTEM_EXTRACT =
  `You are Stash, a save-for-later organizer. You extract structured metadata from saved content. ` +
  `Return ONLY a JSON object. No prose before or after the JSON. The JSON must match exactly: ` +
  `{"title": string|null, "type": "${ITEM_TYPES.join('" | "')}", "summary": string|null, "tags": string[], ` +
  `"recipe": {"ingredients": string[], "steps": string[], "servings": string|null, "prepTime": string|null, "cookTime": string|null} | null, ` +
  `"workout": {"exercises": [{"name": string, "sets": string|null, "reps": string|null, "duration": string|null}], "duration": string|null, "notes": string|null} | null}. ` +
  `Rules: title = clean best title (fix typos, keep language). type = detect the content type from the list. ` +
  `summary = 1-3 sentence plain-language summary, no markdown. tags = 3-6 short lowercase keywords someone might search for. ` +
  `Fill "recipe" only when the content is clearly a recipe (ingredients + instructions). Fill "workout" only when clearly a workout (exercises/sets/reps). Otherwise leave both null.`;

function buildUserPrompt(ctx: EnrichContext): string {
  const parts: string[] = [];
  if (ctx.url) parts.push(`URL: ${ctx.url}`);
  if (ctx.title) parts.push(`Existing title: ${ctx.title}`);
  if (ctx.text) parts.push(`Content:\n${ctx.text}`);
  parts.push('Categorize this saved item and write a short summary. If it is a recipe or workout, extract the structured details too.');
  return parts.join('\n\n');
}

interface EnrichContext {
  url: string | null;
  title: string;
  text: string | null;
}

function recordLog(d: DatabaseSync, userId: string, itemId: string | null, feature: AiFeatureKey, result: ChatJsonResult): void {
  d.prepare(
    `INSERT INTO ai_logs (id, user_id, item_id, feature, provider, model, prompt_tokens, completion_tokens, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `l_${Math.random().toString(16).slice(2, 14)}`, userId, itemId, feature, result.provider, result.model,
    result.promptTokens, result.completionTokens, result.durationMs, new Date().toISOString(),
  );
}

function setAiStatus(d: DatabaseSync, userId: string, itemId: string, status: string, error: string | null = null): void {
  d.prepare('UPDATE items SET ai_status = ?, ai_error = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(status, error, new Date().toISOString(), itemId, userId);
}

function applyEnrichment(d: DatabaseSync, userId: string, itemId: string, options: {
  type: ItemType;
  title: string;
  description: string | null;
  tags: string[];
  extracted: Record<string, unknown> | null;
  provider: string;
  model: string;
  fallbackTitle: string;
}): void {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...options.tags]) {
    const name = raw.trim().slice(0, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    unique.push(name);
  }
  const tagRows = unique.slice(0, 8).map((name) => {
    const existing = d.prepare('SELECT id, name FROM tags WHERE user_id = ? AND name = ? COLLATE NOCASE').get(userId, name) as { id: string; name: string } | undefined;
    if (existing) return existing;
    const id = `t_${Math.random().toString(16).slice(2, 14)}`;
    d.prepare('INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)').run(id, userId, name);
    return { id, name };
  });

  d.prepare(
    `UPDATE items SET type = ?, title = ?, description = ?, extracted = ?, provider = ?, model = ?,
       ai_status = 'done', ai_error = NULL, updated_at = ? WHERE id = ? AND user_id = ?`,
  ).run(
    options.type,
    options.title && options.title !== options.fallbackTitle ? options.title.slice(0, 300) : options.fallbackTitle.slice(0, 300),
    options.description?.slice(0, 2000) ?? null,
    options.extracted ? JSON.stringify(options.extracted) : null,
    options.provider, options.model, new Date().toISOString(), itemId, userId,
  );
  d.prepare('DELETE FROM item_tags WHERE item_id = ?').run(itemId);
  const stmt = d.prepare('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)');
  for (const t of tagRows) stmt.run(itemId, t.id);
}

export async function enrichItem(
  d: DatabaseSync,
  userId: string,
  itemId: string,
  secret: string,
  ctx: EnrichContext,
  settings?: AiSettings,
): Promise<EnrichResult> {
  const s = settings ?? loadAiSettings(d, userId, secret);
  if (!s.apiKey) return { status: 'skipped', message: 'No AI key configured' };

  try {
    setAiStatus(d, userId, itemId, 'processing');
    const call = await callChat(s, 'categorize', SYSTEM_EXTRACT, buildUserPrompt(ctx));
    recordLog(d, userId, itemId, 'categorize', call);
    const j = call.json;
    const detectedType = stype(j.type);

    let extracted: Record<string, unknown> | null = null;
    const recipe = j.recipe ?? null;
    const workout = j.workout ?? null;

    if (detectedType === 'recipe' && s.features.extractRecipe && recipe && typeof recipe === 'object') {
      extracted = { recipe };
    } else if (detectedType === 'workout' && s.features.extractWorkout && workout && typeof workout === 'object') {
      extracted = { workout };
    }

    applyEnrichment(d, userId, itemId, {
      type: detectedType,
      title: typeof j.title === 'string' && j.title.trim() ? j.title.trim() : ctx.title,
      description: typeof j.summary === 'string' && j.summary.trim() ? j.summary.trim() : null,
      tags: Array.isArray(j.tags) ? (j.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [],
      extracted,
      provider: call.provider,
      model: call.model,
      fallbackTitle: ctx.title,
    });
    return { status: 'ok', type: detectedType };
  } catch (err) {
    const msg = (err as Error).message.slice(0, 120);
    setAiStatus(d, userId, itemId, 'error', msg);
    return { status: 'error', message: msg };
  }
}