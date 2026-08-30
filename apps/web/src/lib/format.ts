import type { ItemType } from '@stash/shared';

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const TYPE_EMOJI: Record<ItemType, string> = {
  link: '🔗',
  article: '📄',
  video: '🎬',
  recipe: '🍳',
  workout: '💪',
  note: '📝',
  place: '📍',
  product: '🛍️',
  book: '📚',
  movie: '🎥',
  music: '🎵',
  game: '🎮',
  image: '🖼️',
};

export const EMPTY_COPY: Record<string, { title: string; subtitle: string }> = {
  default: {
    title: 'Nothing stashed yet',
    subtitle: 'Save a link, a video, a recipe — anything you want to come back to.',
  },
  unconsumed: {
    title: 'All clear!',
    subtitle: 'Nothing waiting. Everything here got consumed. Nice work.',
  },
  done: {
    title: 'No history yet',
    subtitle: 'Items you mark as done will show up here.',
  },
  starred: {
    title: 'No favourites yet',
    subtitle: 'Star the things you definitely want to find again.',
  },
  video: { title: 'No videos stashed', subtitle: 'Share a YouTube/TikTok/Instagram link and it lands here.' },
  recipe: { title: 'No recipes stashed', subtitle: 'Paste a link or text with ingredients and steps.' },
  workout: { title: 'No workouts stashed', subtitle: 'Save a routine or an exercise video.' },
  search: { title: 'No matches', subtitle: 'Nothing in your stash matches that.' },
};