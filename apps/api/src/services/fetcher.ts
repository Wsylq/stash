import type { ItemType, MetaSeo } from '@stash/shared';

const MAX_FETCH_BYTES = 1_500_000;
const MAX_TEXT_CHARS = 20_000;

const OEMBED_PROVIDERS: { match: RegExp; url: (u: string) => string }[] = [
  {
    match: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/,
    url: (u) => `https://www.youtube.com/oembed?url=${encodeURIComponent(u)}&format=json`,
  },
  {
    match: /(^|\.)vimeo\.com$/,
    url: (u) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}`,
  },
  {
    match: /(^|\.)tiktok\.com$/,
    url: (u) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`,
  },
  {
    match: /(^|\.)reddit\.com$/,
    url: (u) => `https://www.reddit.com/oembed?url=${encodeURIComponent(u)}`,
  },
  {
    match: /(^|\.)soundcloud\.com$/,
    url: (u) => `https://soundcloud.com/oembed?url=${encodeURIComponent(u)}&format=json`,
  },
  {
    match: /(^|\.)open\.spotify\.com$/,
    url: (u) => `https://open.spotify.com/oembed?url=${encodeURIComponent(u)}`,
  },
];

const RECIPE_DOMAINS = [
  /^recipes\.|(^|\.)allrecipes\.com$/, /(^|\.)foodnetwork\.com$/,
  /(^|\.)seriouseats\.com$/, /(^|\.)bonappetit\.com$/, /(^|\.)food52\.com$/,
  /(^|\.)nyt?cooking\.|(^|\.)cooking\.nytimes\.com$/, /(^|\.)budgetbytes\.com$/,
  /(^|\.)delish\.com$/, /(^|\.)bbcgoodfood\.com$/, /(^|\.)kitchenstories\.com$/,
];

const VIDEO_DOMAINS = [
  /(^|\.)youtube\.com$/, /(^|\.)youtu\.be$/, /(^|\.)vimeo\.com$/, /(^|\.)tiktok\.com$/,
  /(^|\.)twitch\.tv$/, /(^|\.)dailymotion\.com$/,
];

export function safeUrl(input: string): URL | null {
  try {
    const u = new URL(input.trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u : null;
  } catch {
    return null;
  }
}

export function sourceName(url: string): string {
  return safeUrl(url)?.hostname.replace(/^www\./, '') || '';
}

export function detectTypeFromUrl(input: string, ogType?: string | null): ItemType {
  const u = safeUrl(input);
  if (!u) return 'link';
  const host = u.hostname;
  if (RECIPE_DOMAINS.some((re) => re.test(host))) return 'recipe';
  if (VIDEO_DOMAINS.some((re) => re.test(host))) return 'video';
  if (/instagram\.com$/.test(host) && /\/reel\//.test(u.pathname)) return 'video';
  if (/instagram\.com$/.test(host)) return 'image';
  if (/pinterest\.(com|ca|co\.uk)/.test(host)) return 'image';
  if (/goodreads\.com$/.test(host)) return 'book';
  if (/imdb\.com$/.test(host) || /letterboxd\.com$/.test(host)) return 'movie';
  if (/open\.spotify\.com$/.test(host) || /soundcloud\.com$/.test(host) || /music\.apple\.com$/.test(host)) return 'music';
  if (/twitch\.tv$/.test(host)) return 'video';
  if (/amazon\.|store\.steampowered\.com/.test(host)) return 'product';
  if (/weather\.com|google\.com\/maps|maps\.apple\.com|yelp\.|tripadvisor\./i.test(input)) return 'place';
  const ot = (ogType || '').toLowerCase();
  if (ot.includes('video')) return 'video';
  if (ot.includes('article')) return 'article';
  if (ot.includes('image')) return 'image';
  return 'link';
}

export function isLikelyVideoUrl(input: string): boolean {
  const u = safeUrl(input);
  if (!u) return false;
  return VIDEO_DOMAINS.some((re) => re.test(u.hostname));
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  return fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; Stash/0.1; +https://github.com/yourname/stash) StashBot/0.1' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export interface OEmbedData {
  title?: string;
  description?: string;
  thumbnail_url?: string;
  site_name?: string;
  type?: string;
  provider_name?: string;
}

export async function fetchOEmbed(url: string, timeoutMs: number): Promise<OEmbedData | null> {
  for (const p of OEMBED_PROVIDERS) {
    try {
      const u = safeUrl(url);
      if (!u || !p.match.test(u.hostname)) continue;
      const res = await fetchWithTimeout(p.url(url), timeoutMs);
      if (!res.ok) continue;
      return (await res.json()) as OEmbedData;
    } catch {
      // continue to next provider / fall back to meta scraping
    }
  }
  return null;
}

function metaContent(html: string, names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i');
    const match = html.match(re);
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, 'i');
    const match2 = html.match(re2);
    const m = match ?? match2;
    if (m) {
      let value = m[1]
        .replace(/&amp;/g, '&')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
      if (value) return value;
    }
  }
  return null;
}

export async function fetchMeta(url: string, timeoutMs: number): Promise<MetaSeo | null> {
  const res = await fetchWithTimeout(url, timeoutMs);
  if (!res.ok) return null;
  const raw = await res.arrayBuffer();
  if (raw.byteLength > MAX_FETCH_BYTES) return null;
  const html = Buffer.from(raw).toString('utf8');
  const title =
    metaContent(html, ['og:title', 'twitter:title']) ??
    (() => {
      const m = html.match(/<title[^>]*>([^<]*)<\s*\/title>/i);
      return m ? m[1].trim() : null;
    })();
  const description = metaContent(html, ['og:description', 'twitter:description', 'description']);
  const image = metaContent(html, ['og:image', 'twitter:image'])?.replace(/^\/\//, 'https://');
  const siteName = metaContent(html, ['og:site_name', 'al:ios:app_name']) || sourceName(url);
  const ogType = metaContent(html, ['og:type']);
  return { title, description, image: image || null, siteName: siteName || null, url };
}

/** Naive HTML-to-text used only to feed the AI extractor (content parsers are a later-phase upgrade). */
export async function fetchPageText(url: string, timeoutMs: number, maxChars = MAX_TEXT_CHARS): Promise<string | null> {
  const res = await fetchWithTimeout(url, timeoutMs);
  if (!res.ok) return null;
  const raw = await res.arrayBuffer();
  if (raw.byteLength > MAX_FETCH_BYTES) return null;
  const html = Buffer.from(raw).toString('utf8');
  const text = html
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&(#\d+|lt|gt|quot|apos|#x[0-9a-f]+);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maxChars);
}

export function isMostlyUrlText(input: string): boolean {
  return !!safeUrl(input);
}