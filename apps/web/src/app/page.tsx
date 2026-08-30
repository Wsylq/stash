'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { ArrowRight, LayoutGrid, List, Shuffle } from 'lucide-react';
import type { Item, ItemType } from '@stash/shared';
import { ITEM_TYPE_LABELS } from '@stash/shared';
import { useAuth } from '@/lib/auth';
import { filterParams, useCollections, useItems, useStats } from '@/lib/data';
import { api } from '@/lib/api';
import { CardGrid } from '@/components/item-card';
import { EmptyState, Skeleton, useToast } from '@/components/ui';
import { EMPTY_COPY } from '@/lib/format';
import { useSave } from '@/components/app-shell';

const QUICK_FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unconsumed', label: 'Waiting' },
  { id: 'done', label: 'Done' },
  { id: 'starred', label: 'Faves' },
];

export default function HomePage() {
  const { user } = useAuth();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState<'all' | 'unconsumed' | 'done' | 'starred'>('all');
  const [userDecided, setUserDecided] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [, forceKey] = useState(0);
  const toast = useToast();
  const openSave = useSave();

  const params = useMemo(() => ({ ...filterParams[filter], limit: '120' }), [filter]);
  const { items, mutate, isLoading } = useItems(params);
  const { collections } = useCollections();
  const stats = useStats();

  const firstName = user?.email?.split('@')[0]?.split(/[._]/)[0] ?? 'friend';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const unconsumed = stats?.unconsumed ?? 0;

  async function toggleDone(item: Item) {
    const next = await api.updateItem(item.id, { done: !item.done });
    await mutate((cur) => (cur ? { ...cur, items: cur.items.map((i) => (i.id === item.id ? next.item : i)) } : cur));
    void api.stats().then(() => forceKey((k) => k + 1));
  }
  async function toggleStar(item: Item) {
    const next = await api.updateItem(item.id, { starred: !item.starred });
    await mutate((cur) => (cur ? { ...cur, items: cur.items.map((i) => (i.id === item.id ? next.item : i)) } : cur));
  }

  async function decide() {
    if (deciding) return;
    if (!unconsumed) {
      toast('Nothing waiting — save something first!', 'error');
      return;
    }
    setDeciding(true);
    setUserDecided(true);
  }

  const filterType = QUICK_FILTERS.find((f) => f.id === filter);
  const emptyKey = filter === 'unconsumed' ? 'unconsumed' : filter === 'done' ? 'done' : filter === 'starred' ? 'starred' : 'default';

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted">{greeting}</p>
          <h1 className="text-2xl font-extrabold text-ink dark:text-night-ink">
            {firstName}
            {unconsumed > 0 ? `, ${unconsumed} thing${unconsumed === 1 ? '' : 's'} waiting` : `, all clear`}
            <span className="ml-1" aria-hidden>{unconsumed > 0 ? '👀' : '✨'}</span>
          </h1>
        </div>
        <button
          onClick={() => void decide()}
          disabled={deciding}
          className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-ink px-3.5 py-2.5 text-xs font-bold text-cream shadow-lg dark:bg-night-ink dark:text-night"
        >
          <Shuffle className={clsx('h-4 w-4', deciding && 'animate-spin')} /> Decide for me
        </button>
      </header>

      <div className="rail flex items-center gap-2 overflow-x-auto pb-0.5">
        {QUICK_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id as typeof filter)}
            className={clsx(
              'shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition',
              filter === f.id ? 'bg-coral text-white shadow-md shadow-coral/25' : 'bg-card text-muted hover:text-ink dark:bg-night-card dark:hover:text-night-ink',
            )}
          >
            {f.label}
            {f.id === 'all' && stats?.total ? <span className="ml-1 opacity-70">{stats.total}</span> : null}
          </button>
        ))}
      </div>

      {collections.length > 0 && filter === 'all' && (
        <QuickCollections />
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted">{filterType?.label} ({items.length})</span>
        <div className="flex items-center gap-1 rounded-full bg-card p-1 dark:bg-night-card">
          <button
            onClick={() => setView('grid')}
            aria-label="Grid view"
            className={clsx('flex h-7 w-7 items-center justify-center rounded-full transition', view === 'grid' ? 'bg-ink text-cream dark:bg-night-ink dark:text-night' : 'text-muted')}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('list')}
            aria-label="List view"
            className={clsx('flex h-7 w-7 items-center justify-center rounded-full transition', view === 'list' ? 'bg-ink text-cream dark:bg-night-ink dark:text-night' : 'text-muted')}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <GridSkeleton view={view} />
      ) : items.length === 0 ? (
        <EmptyState
          emoji={filter === 'done' ? '🎉' : undefined}
          {...EMPTY_COPY[emptyKey]}
          action={
            <button
              onClick={() => openSave()}
              className="mt-2 rounded-2xl bg-coral px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-coral/25"
            >
              Save something
            </button>
          }
        />
      ) : (
        <CardGrid items={items} view={view} onToggleDone={(i) => void toggleDone(i)} onToggleStar={(i) => void toggleStar(i)} />
      )}

      {userDecided && <DecideOverlay onClose={() => setUserDecided(false)} />}
    </div>
  );
}

function QuickCollections() {
  const { collections } = useCollections();
  const latest = [...collections].sort((a, b) => (a.itemCount ?? 0) - (b.itemCount ?? 0)).slice(0, 2);
  if (latest.length === 0) return null;
  return (
    <div className="space-y-2">
      {latest.filter((c) => !c.isSmart).map((c) => (
        <Link
          key={c.id}
          href={`/collections/${c.id}`}
          className="group flex items-center gap-3 rounded-2xl border border-stone-200/70 bg-card p-3 transition hover:border-coral/40 dark:border-night-card dark:bg-night-card"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-coral/70 to-mango/60 text-xl">{c.emoji || '📁'}</span>
          <span className="flex-1">
            <span className="block text-sm font-bold text-ink dark:text-night-ink">{c.name}</span>
            <span className="block text-[11px] text-muted">{c.itemCount} saved</span>
          </span>
          <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-coral" />
        </Link>
      ))}
    </div>
  );
}

function GridSkeleton({ view }: { view: 'grid' | 'list' }) {
  if (view === 'list') {
    return (
      <div className="space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl bg-card p-2.5 dark:bg-night-card">
            <Skeleton className="h-14 w-14" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="overflow-hidden rounded-3xl bg-card dark:bg-night-card">
          <Skeleton className="aspect-[4/3] rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DecideOverlay({ onClose }: { onClose: () => void }) {
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [pool, setPool] = useState(0);
  const [loadingNext, setLoadingNext] = useState(false);

  const pick = useMemo(
    () => async (filterTypeHint?: ItemType) => {
      setLoadingNext(true);
      try {
        const res = await api.decide(filterTypeHint ? { type: filterTypeHint } : {});
        setItem(res.item);
        setPool(res.poolSize);
      } finally {
        setLoadingNext(false);
      }
    },
    [],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-5 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="animate-pop flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl bg-cream p-6 text-center shadow-2xl dark:bg-night-2">
        <span className="text-4xl" aria-hidden>🎲</span>
        {item === undefined ? (
          <>
            <h2 className="text-lg font-extrabold text-ink dark:text-night-ink">Picking for you…</h2>
            <button className="mt-1 rounded-2xl bg-coral px-4 py-2 text-sm font-bold text-white" onClick={() => void pick()} disabled={loadingNext}>
              {loadingNext ? 'Shuffling…' : 'Shuffle'}
            </button>
          </>
        ) : item === null ? (
          <>
            <h2 className="text-lg font-extrabold text-ink dark:text-night-ink">All caught up!</h2>
            <p className="text-sm text-muted">Nothing unconsumed matches right now.</p>
            <button className="mt-1 rounded-2xl bg-ink px-4 py-2 text-sm font-bold text-cream dark:bg-night-ink dark:text-night" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-widest text-muted">Your pick ({pool} in pool)</p>
            <h2 className="text-xl font-extrabold leading-snug text-ink dark:text-night-ink">{item.title || 'Untitled'}</h2>
            <p className="text-xs font-semibold text-coral">{ITEM_TYPE_LABELS[item.type]}</p>
            <div className="mt-2 flex w-full gap-2">
              <Link
                href={`/item/${item.id}`}
                onClick={onClose}
                className="flex-1 rounded-2xl bg-coral px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-coral/25"
              >
                Take me there
              </Link>
              <button
                onClick={() => void pick()}
                className="flex items-center gap-1 rounded-2xl bg-stone-200/70 px-4 py-2.5 text-sm font-bold text-muted hover:text-ink dark:bg-night-card dark:text-night-ink/70"
              >
                <Shuffle className="h-4 w-4" /> Again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}