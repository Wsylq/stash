'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Search, X } from 'lucide-react';
import type { ItemType } from '@stash/shared';
import { ITEM_TYPES, ITEM_TYPE_LABELS } from '@stash/shared';
import { useItems } from '@/lib/data';
import { api } from '@/lib/api';
import { CardGrid } from '@/components/item-card';
import { EmptyState, Skeleton } from '@/components/ui';
import { EMPTY_COPY } from '@/lib/format';

const ALL_FILTERS: Record<string, string | undefined> = {
  all: undefined,
  unconsumed: 'true',
  done: 'true',
};

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState<'' | ItemType>('');
  const [status, setStatus] = useState<'all' | 'unconsumed' | 'done'>('all');
  const [view, setView] = useState<'grid' | 'list'>('list');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 260);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (debounced.trim()) p.q = debounced.trim();
    if (type) p.type = type;
    const st = ALL_FILTERS[status];
    if (st) p.done = st;
    return p;
  }, [debounced, type, status]);

  const { items, total, isLoading } = useItems(params);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink dark:text-night-ink">Search</h1>

      <div className="flex items-center gap-2 rounded-2xl border border-stone-300/70 bg-card px-3.5 dark:border-night-card dark:bg-night-card">
        <Search className="h-4 w-4 shrink-0 text-muted" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles, notes, recipes, tags…"
          className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted"
        />
        {q && (
          <button onClick={() => setQ('')} aria-label="Clear" className="text-muted hover:text-coral">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="rail flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {(['all', 'unconsumed', 'done'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={clsx(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold capitalize',
              status === s ? 'bg-ink text-cream dark:bg-night-ink dark:text-night' : 'bg-card text-muted hover:text-ink dark:bg-night-card',
            )}
          >
            {s === 'all' ? 'All' : s === 'unconsumed' ? 'Waiting' : 'Done'}
          </button>
        ))}
        <span className="mx-1 h-4 w-px shrink-0 bg-stone-300/70" />
        <button
          onClick={() => setType('')}
          className={clsx('shrink-0 rounded-full px-3 py-1.5 text-xs font-bold', type === '' ? 'bg-coral text-white' : 'bg-card text-muted dark:bg-night-card')}
        >
          Any type
        </button>
        {ITEM_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setType(type === t ? '' : t)}
            className={clsx(
              'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold capitalize',
              type === t ? 'bg-coral text-white' : 'bg-card text-muted dark:bg-night-card',
            )}
          >
            {ITEM_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs font-bold text-muted">
        <span>{isLoading ? 'Searching…' : `${total} result${total === 1 ? '' : 's'}`}</span>
        <div className="flex items-center gap-1 rounded-full bg-card p-1 dark:bg-night-card">
          <button
            onClick={() => setView('grid')}
            aria-label="Grid"
            className={clsx('rounded-full px-2.5 py-1', view === 'grid' ? 'bg-ink text-cream dark:bg-night-ink dark:text-night' : 'text-muted')}
          >
            Grid
          </button>
          <button
            onClick={() => setView('list')}
            aria-label="List"
            className={clsx('rounded-full px-2.5 py-1', view === 'list' ? 'bg-ink text-cream dark:bg-night-ink dark:text-night' : 'text-muted')}
          >
            List
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl bg-card p-2.5 dark:bg-night-card">
              <Skeleton className="h-14 w-14" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          emoji={q || type ? '🔍' : '🗂️'}
          title={EMPTY_COPY.search.title}
          subtitle={EMPTY_COPY.search.subtitle}
        />
      ) : (
        <CardGrid items={items} view={view} />
      )}
    </div>
  );
}