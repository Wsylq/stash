'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { ArrowLeft, LayoutGrid, List, RefreshCw, Trash2 } from 'lucide-react';
import type { Item } from '@stash/shared';
import { useCollections, useCollection } from '@/lib/data';
import { api } from '@/lib/api';
import { CardGrid } from '@/components/item-card';
import { SmartIcon } from '@/components/collection-card';
import { EmptyState, Spinner, useToast } from '@/components/ui';
import { useSave } from '@/components/app-shell';

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { collection, items, mutate, isLoading } = useCollection(id as string);
  const { collections, mutate: mutateCollections } = useCollections();
  const toast = useToast();
  const openSave = useSave();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function toggleDone(item: Item) {
    await api.updateItem(item.id, { done: !item.done });
    await mutate();
  }

  async function applying() {
    if (!collection) return;
    toast('Applying rules…');
    const res = await api.applySmart(collection.id);
    await mutate();
    await mutateCollections();
    toast(`File ${res.applied} more ${res.applied === 1 ? 'item' : 'items'} here`);
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="h-6 w-6 text-coral" />
      </div>
    );
  }
  if (!collection) {
    return (
      <div className="space-y-4">
        <Link href="/collections" className="inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <EmptyState title="Collection not found" subtitle="It may have been deleted." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-muted hover:text-ink dark:bg-night-card dark:hover:text-night-ink"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-coral/80 to-mango/60 text-3xl shadow-sm">
          <span aria-hidden>{collection.emoji || '📁'}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-extrabold text-ink dark:text-night-ink">{collection.name}</h1>
            {collection.isSmart && <SmartIcon />}
          </div>
          <p className="text-xs text-muted">{items.length} items</p>
        </div>
        {collection.isSmart && (
          <button
            onClick={() => void applying()}
            className="flex shrink-0 items-center gap-1 rounded-xl bg-violet-500/10 px-2.5 py-2 text-[11px] font-bold text-violet-600 dark:text-violet-300"
            title="Re-apply rule"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Apply
          </button>
        )}
        <button
          onClick={() => setConfirmDelete(true)}
          aria-label="Delete collection"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-muted hover:text-coral dark:bg-night-card"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {items.length > 0 && (
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-1 rounded-full bg-card p-1 dark:bg-night-card">
            <button
              onClick={() => setView('grid')}
              aria-label="Grid view"
              className={clsx('flex h-7 w-7 items-center justify-center rounded-full', view === 'grid' ? 'bg-ink text-cream dark:bg-night-ink dark:text-night' : 'text-muted')}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              aria-label="List view"
              className={clsx('flex h-7 w-7 items-center justify-center rounded-full', view === 'list' ? 'bg-ink text-cream dark:bg-night-ink dark:text-night' : 'text-muted')}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          emoji={collection.emoji || '🗂️'}
          title={collection.isSmart ? 'No matching saves yet' : 'This collection is empty'}
          subtitle={collection.isSmart ? 'Save something of the right type (or tap Apply) and it lands here automatically.' : 'Save something and file it in here.'}
          action={
            <button onClick={() => openSave()} className="mt-2 rounded-2xl bg-coral px-4 py-2.5 text-sm font-bold text-white">
              + Add a save
            </button>
          }
        />
      ) : (
        <CardGrid items={items} view={view} onToggleDone={(i) => void toggleDone(i)} />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-5 backdrop-blur-sm">
          <div className="animate-pop w-full max-w-xs rounded-3xl bg-cream p-5 text-center dark:bg-night-2">
            <h3 className="text-lg font-extrabold text-ink dark:text-night-ink">Delete “{collection.name}”?</h3>
            <p className="mt-1 text-sm text-muted">Items stay saved — they’re just unfiled.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-2xl bg-stone-200/70 px-4 py-2.5 text-sm font-bold text-muted dark:bg-night-card">
                Cancel
              </button>
              <button
                onClick={async () => {
                  await api.deleteCollection(collection.id);
                  toast('Collection deleted');
                  router.replace('/collections');
                }}
                className="flex-1 rounded-2xl bg-coral px-4 py-2.5 text-sm font-bold text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectCollection({ current, collections, onAdd }: { current: Set<string>; collections: { id: string; name: string; emoji: string }[]; onAdd: (id: string) => void }) {
  if (collections.length === 0) return null;
  return (
    <div className="rail flex items-center gap-1.5 overflow-x-auto">
      <span className="shrink-0 text-[11px] font-bold text-muted">Move to:</span>
      {collections.map((c) => (
        <button
          key={c.id}
          onClick={() => onAdd(c.id)}
          className="flex shrink-0 items-center gap-1 rounded-full bg-stone-200/70 px-2.5 py-1.5 text-[11px] font-bold text-muted hover:text-ink dark:bg-night-card dark:hover:text-night-ink"
        >
          {c.emoji || '📁'} {c.name}
        </button>
      ))}
    </div>
  );
}