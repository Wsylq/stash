'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Check, Star } from 'lucide-react';
import { ITEM_TYPE_LABELS } from '@stash/shared';
import type { Item } from '@stash/shared';
import { timeAgo, TYPE_EMOJI } from '@/lib/format';
import { AiStatusDot, TypeBadge } from './ui';

interface Props {
  item: Item;
  view: 'grid' | 'list';
  onToggleDone?: (item: Item) => void;
  onToggleStar?: (item: Item) => void;
}

export const THUMB_COLORS: Record<string, string> = {
  video: 'from-blue-400/60 to-indigo-500/50',
  recipe: 'from-coral/60 to-amber-400/50',
  workout: 'from-teal-400/60 to-mint/50',
  article: 'from-indigo-400/60 to-violet-500/50',
  product: 'from-amber-400/60 to-orange-500/50',
  image: 'from-fuchsia-400/60 to-pink-500/50',
  music: 'from-emerald-400/60 to-teal-500/50',
  movie: 'from-rose-400/60 to-red-500/50',
  book: 'from-sky-400/60 to-blue-500/50',
  game: 'from-lime-400/60 to-green-500/50',
  place: 'from-orange-400/60 to-red-400/50',
};

function Thumb({ item, done }: { item: Item; done: boolean }) {
  const fallback = (
    <span className={clsx('flex h-full w-full items-center justify-center bg-gradient-to-br text-4xl', THUMB_COLORS[item.type] ?? 'from-stone-400/60 to-stone-500/40')}>
      <span aria-hidden>{TYPE_EMOJI[item.type]}</span>
    </span>
  );
  if (!item.thumbnailUrl) return fallback;
  return (
    <div className="relative h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      <span
        className={clsx(
          'absolute inset-0 flex items-center justify-center text-3xl transition',
          item.aiStatus === 'processing' ? 'bg-black/30 backdrop-blur-[2px]' : 'hidden',
        )}
        aria-hidden
      >
        🪄
      </span>
      {done && (
        <span className="absolute inset-0 flex items-center justify-center bg-ink/60 text-3xl" aria-hidden>
          <Check className="h-8 w-8 text-white" strokeWidth={3} />
        </span>
      )}
    </div>
  );
}

export function ItemCard({ item, view, onToggleDone, onToggleStar }: Props) {
  const done = item.done;
  if (view === 'grid') {
    return (
      <Link
        href={`/item/${item.id}`}
        className="animate-pop group relative flex flex-col overflow-hidden rounded-3xl border border-stone-200/70 bg-card shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] dark:border-night-card dark:bg-night-card"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          <Thumb item={item} done={done} />
          <div className="absolute left-2 top-2">
            <TypeBadge type={item.type} className="bg-white/85 shadow-sm backdrop-blur dark:bg-night/70" />
          </div>
          {item.aiStatus === 'processing' && (
            <span className="absolute bottom-2 left-2">
              <AiStatusDot status="processing" />
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 p-3">
          <h3 className={clsx('line-clamp-2 text-sm font-bold leading-snug', done ? 'text-muted line-through' : 'text-ink dark:text-night-ink')}>
            {item.title || '(untitled)'}
          </h3>
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="truncate">{item.source ?? timeAgo(item.createdAt)}</span>
            {item.source && <span>· {timeAgo(item.createdAt)}</span>}
          </div>
          {(onToggleDone || onToggleStar) && (
            <div className="mt-1 flex items-center gap-1" onClick={(e) => e.preventDefault()}>
              {onToggleDone && (
                <button
                  onClick={() => onToggleDone(item)}
                  aria-label={done ? 'Mark not done' : 'Mark done'}
                  className={clsx(
                    'flex h-8 w-8 items-center justify-center rounded-full transition',
                    done ? 'bg-mint text-white' : 'bg-stone-100 text-muted hover:bg-mint/20 hover:text-mint dark:bg-night-2',
                  )}
                >
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                </button>
              )}
              {onToggleStar && (
                <button
                  onClick={() => onToggleStar(item)}
                  aria-label={item.starred ? 'Unstar' : 'Star'}
                  className={clsx(
                    'flex h-8 w-8 items-center justify-center rounded-full transition',
                    item.starred ? 'bg-mango text-white' : 'bg-stone-100 text-muted hover:bg-mango/20 hover:text-mango dark:bg-night-2',
                  )}
                >
                  <Star className={clsx('h-4 w-4', item.starred && 'fill-current')} />
                </button>
              )}
            </div>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/item/${item.id}`}
      className="animate-pop group flex items-center gap-3 rounded-2xl border border-stone-200/70 bg-card p-2.5 pr-3 transition hover:border-stone-300 dark:border-night-card dark:bg-night-card"
    >
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
        <Thumb item={item} done={done} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className={clsx('truncate text-sm font-bold', done ? 'text-muted line-through' : 'text-ink dark:text-night-ink')}>
          {item.title || '(untitled)'}
        </h3>
        <div className="mt-0.5 flex items-center gap-2">
          <TypeBadge type={item.type} />
          <span className="truncate text-[11px] text-muted">
            {item.source} · {timeAgo(item.createdAt)}
          </span>
        </div>
        {item.tags.length > 0 && (
          <div className="mt-1 flex gap-1 overflow-hidden">
            {item.tags.slice(0, 3).map((t) => (
              <span key={t.id} className="max-w-24 truncate rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-muted dark:bg-night-2">
                #{t.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1.5" onClick={(e) => e.preventDefault()}>
        {onToggleDone && (
          <button
            onClick={() => onToggleDone(item)}
            aria-label={done ? 'Mark not done' : 'Mark done'}
            className={clsx(
              'flex h-8 w-8 items-center justify-center rounded-full transition',
              done ? 'bg-mint text-white' : 'bg-stone-100 text-muted hover:bg-mint/20 hover:text-mint dark:bg-night-2',
            )}
          >
            <Check className="h-4 w-4" strokeWidth={2.5} />
          </button>
        )}
        {onToggleStar && (
          <button
            onClick={() => onToggleStar(item)}
            aria-label={item.starred ? 'Unstar' : 'Star'}
            className={clsx(
              'flex h-8 w-8 items-center justify-center rounded-full transition',
              item.starred ? 'bg-mango text-white' : 'bg-stone-100 text-muted hover:bg-mango/20 hover:text-mango dark:bg-night-2',
            )}
          >
            <Star className={clsx('h-4 w-4', item.starred && 'fill-current')} />
          </button>
        )}
      </div>
    </Link>
  );
}

/** Lightweight swipe-to-done wrapper for touch screens (list view). Swipe left = mark done. */
export function SwipeableRow({ item, onToggleDone, children }: { item: Item; onToggleDone: (i: Item) => void; children: React.ReactNode }) {
  const [dx, setDx] = useState(0);
  const startX = useRef<number | null>(null);
  const started = useRef(false);

  const reset = () => setDx(0);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse') return;
    startX.current = e.clientX;
    started.current = false;
  }
  function onPointerMove(e: React.PointerEvent) {
    if (startX.current === null) return;
    const delta = e.clientX - startX.current;
    if (Math.abs(delta) > 8) started.current = true;
    if (!started.current) return;
    setDx(Math.max(-96, Math.min(0, delta)));
  }
  function onPointerUp() {
    startX.current = null;
    if (dx < -56 && !item.done) {
      onToggleDone(item);
    }
    reset();
  }

  return (
    <div
      className="swipe-hint relative overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      style={{ touchAction: 'pan-y' }}
    >
      <div
        className="absolute inset-y-0 right-0 flex w-24 items-center justify-center rounded-2xl bg-mint text-sm font-bold text-white"
        aria-hidden
      >
        <Check className="mr-1 h-4 w-4" /> Done
      </div>
      <div style={{ transform: `translateX(${dx}px)` }} className="relative transition-transform duration-150">
        {children}
      </div>
    </div>
  );
}

export function CardGrid({ items, view, onToggleDone, onToggleStar }: { items: Item[]; view: 'grid' | 'list'; onToggleDone?: (i: Item) => void; onToggleStar?: (i: Item) => void }) {
  return (
    <div className={view === 'grid' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4' : 'flex flex-col gap-2.5'}>
      {items.map((item) =>
        view === 'list' ? (
          <SwipeableRow key={item.id} item={item} onToggleDone={onToggleDone ?? (() => {})}>
            <ItemCard item={item} view={view} onToggleDone={onToggleDone} onToggleStar={onToggleStar} />
          </SwipeableRow>
        ) : (
          <ItemCard key={item.id} item={item} view={view} onToggleDone={onToggleDone} onToggleStar={onToggleStar} />
        ),
      )}
    </div>
  );
}

export { ITEM_TYPE_LABELS };