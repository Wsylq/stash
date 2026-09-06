export function getEmbedUrl(url?: string | null): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();

  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    const m = u.pathname.match(/^\/(reel|reels|p|tv)\/([^/?#]+)/);
    if (m) return `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/embed/`;
    return null;
  }
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    if (id) return `https://www.youtube.com/embed/${id}`;
    return null;
  }
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    const id = u.pathname.startsWith('/watch')
      ? u.searchParams.get('v')
      : u.pathname.match(/^\/(shorts|embed|v)\/([^/?#]+)/)?.[2];
    if (id) return `https://www.youtube.com/embed/${id}`;
    return null;
  }
  if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
    const id = u.pathname.split('/')[1];
    if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    return null;
  }
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    const m = u.pathname.match(/\/video\/(\d+)/);
    if (m) return `https://www.tiktok.com/embed/v2/${m[1]}`;
    return null;
  }
  return null;
}

export function isPortraitEmbed(url?: string | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'instagram.com' || host.endsWith('.instagram.com') || host.endsWith('.tiktok.com');
  } catch {
    return false;
  }
}