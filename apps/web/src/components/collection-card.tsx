'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { Sparkles, Zap } from 'lucide-react';
import type { Collection, ItemType } from '@stash/shared';

const PALETTE: Record<string, { bg: string; fg: string }> = {
  coral: { bg: 'from-coral/80 to-amber-400/70', fg: 'text-white' },
  mango: { bg: 'from-mango to-amber-400', fg: 'text-white' },
  mint: { bg: 'from-mint to-teal-500', fg: 'text-white' },
  blue: { bg: 'from-sky-500 to-indigo-500', fg: 'text-white' },
  violet: { bg: 'from-violet-500 to-purple-500', fg: 'text-white' },
  rose: { bg: 'from-rose-400 to-pink-500', fg: 'text-white' },
  slate: { bg: 'from-stone-500 to-stone-700', fg: 'text-white' },
};

export function CollectionCard({ collection, onLongPressDelete }: { collection: Collection; onLongPressDelete?: (c: Collection) => void }) {
  const palette = PALETTE[collection.color] ?? PALETTE.mango;
  return (
    <Link
      href={`/collections/${collection.id}`}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPressDelete?.(collection);
      }}
      className="animate-pop group flex flex-col gap-2 rounded-3xl border border-stone-200/70 bg-card p-3 transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] dark:border-night-card dark:bg-night-card"
    >
      <div className={clsx('flex h-20 items-center justify-center rounded-2xl bg-gradient-to-br text-4xl shadow-inner', palette.bg)}>
        <span aria-hidden>{collection.emoji || '📁'}</span>
      </div>
      <div className="flex items-center justify-between gap-1 px-0.5">
        <h3 className="truncate text-sm font-bold text-ink dark:text-night-ink">{collection.name}</h3>
        <div className="flex shrink-0 items-center gap-1">
          {collection.isSmart && <SmartIcon size={14} />}
          <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-muted dark:bg-night-2">
            {collection.itemCount}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function SmartIcon({ size = 14 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">
      <Sparkles className="h-3 w-3" /> Smart
    </span>
  );
}

export function TypePill({ type }: { type: ItemType }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-coral/10 px-2 py-1 text-[11px] font-bold capitalize text-coral-dark dark:text-coral">
      <Zap className="h-3 w-3" /> {type}
    </span>
  );
}