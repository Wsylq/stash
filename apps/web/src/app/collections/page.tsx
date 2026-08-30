'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Plus, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import type { Collection, ItemType } from '@stash/shared';
import { ITEM_TYPES, ITEM_TYPE_LABELS } from '@stash/shared';
import { useCollections } from '@/lib/data';
import { api } from '@/lib/api';
import { CollectionCard } from '@/components/collection-card';
import { EmptyState, Spinner, useToast } from '@/components/ui';

const EMOJIS = ['🗂️', '🍳', '🎬', '📚', '🎵', '💪', '🛍️', '📍', '✈️', '💡', '🎮', '🖼️', '📝', '🍿'];

const PALETTES = ['coral', 'mango', 'mint', 'blue', 'violet', 'rose', 'slate'];

export default function CollectionsPage() {
  const { collections, mutate, isLoading } = useCollections();
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Collection | null>(null);
  const toast = useToast();

  async function remove(c: Collection) {
    await api.deleteCollection(c.id);
    await mutate();
    toast(`${c.name} deleted`);
  }

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink dark:text-night-ink">Collections</h1>
          <p className="text-xs text-muted">{collections.length} collection{collections.length === 1 ? '' : 's'} · long-press to delete</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-coral px-3.5 py-2.5 text-xs font-bold text-white shadow-lg shadow-coral/25"
        >
          <Plus className="h-4 w-4" /> New
        </button>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse rounded-3xl bg-stone-300/40 p-3 dark:bg-night-card">
              <div className="h-20 rounded-2xl bg-stone-400/30" />
              <div className="mt-2 h-3.5 w-2/3 rounded bg-stone-400/30" />
            </div>
          ))}
        </div>
      ) : collections.length === 0 ? (
        <EmptyState
          emoji="🗂️"
          title="No collections yet"
          subtitle="Collections keep related saves together — a recipe folder, a watch-later pile, a trip bucket list."
          action={
            <button onClick={() => setCreating(true)} className="mt-2 rounded-2xl bg-coral px-4 py-2.5 text-sm font-bold text-white">
              Create your first collection
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {collections.map((c) => (
            <CollectionCard key={c.id} collection={c} onLongPressDelete={setConfirmDelete} />
          ))}
        </div>
      )}

      {creating && <CreateCollectionDialog onClose={() => setCreating(false)} onCreated={async () => { await mutate(); setCreating(false); }} />}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-5 backdrop-blur-sm">
          <div className="animate-pop w-full max-w-xs rounded-3xl bg-cream p-5 text-center dark:bg-night-2">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-coral/15 text-coral">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-extrabold text-ink dark:text-night-ink">Delete “{confirmDelete.name}”?</h3>
            <p className="mt-1 text-sm text-muted">The items inside stay saved — they’re just unfiled.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-2xl bg-stone-200/70 px-4 py-2.5 text-sm font-bold text-muted dark:bg-night-card">
                Keep it
              </button>
              <button
                onClick={() => {
                  void remove(confirmDelete);
                  setConfirmDelete(null);
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

function CreateCollectionDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🗂️');
  const [isSmart, setIsSmart] = useState(false);
  const [smartType, setSmartType] = useState<ItemType>('video');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function create() {
    if (!name.trim()) {
      toast('Give it a name', 'error');
      return;
    }
    setBusy(true);
    try {
      const opts = { name: name.trim(), emoji, color: PALETTES[Math.floor(Math.random() * PALETTES.length)] };
      await api.createCollection(isSmart ? { ...opts, isSmart: true, smartRule: { matchType: smartType } } : opts);
      await onCreated();
      toast(isSmart ? `Smart collection “${name}” created — matching saves file themselves` : `Collection “${name}” created`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create collection', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="animate-slide-up relative z-10 w-full max-w-sm rounded-t-3xl bg-cream p-5 shadow-2xl sm:rounded-3xl dark:bg-night-2">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-ink dark:text-night-ink">New collection</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-200/70 text-muted dark:bg-night-card">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dinner ideas"
              autoFocus
              className="w-full rounded-2xl border border-stone-300/70 bg-card px-3.5 py-2.5 text-sm outline-none focus:border-coral focus:ring-2 focus:ring-coral/30 dark:border-night-card dark:bg-night-card"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Cover</label>
            <div className="rail flex gap-1.5 overflow-x-auto pb-1">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl transition', emoji === e ? 'bg-coral/20 ring-2 ring-coral' : 'bg-stone-200/70 dark:bg-night-card')}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setIsSmart((s) => !s)}
            className={clsx(
              'flex w-full items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-left',
              isSmart ? 'border-violet-500/50 bg-violet-500/10' : 'border-stone-300/70 bg-card dark:border-night-card dark:bg-night-card',
            )}
          >
            <span className={clsx('flex h-8 w-8 items-center justify-center rounded-full', isSmart ? 'bg-violet-500 text-white' : 'bg-stone-200/70 text-muted dark:bg-night-2')}>
              <Wand2 className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-bold text-ink dark:text-night-ink">Smart collection</span>
              <span className="block text-[11px] text-muted">Auto-files matching saves (e.g. all recipes)</span>
            </span>
            <span className={clsx('flex h-5 w-5 items-center justify-center rounded-full border', isSmart ? 'border-violet-500 bg-violet-500 text-white' : 'border-stone-300')}>
              {isSmart && <Sparkles className="h-3 w-3" />}
            </span>
          </button>

          {isSmart && (
            <div className="flex flex-col gap-1.5 rounded-2xl bg-stone-100 p-3 dark:bg-night-card">
              <span className="text-xs font-bold text-muted">Automatically file saves of type:</span>
              <div className="flex flex-wrap gap-1.5">
                {ITEM_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setSmartType(t)}
                    className={clsx(
                      'rounded-full px-2.5 py-1 text-[11px] font-bold capitalize',
                      smartType === t ? 'bg-violet-500 text-white' : 'bg-white text-muted shadow-sm dark:bg-night-2',
                    )}
                  >
                    {ITEM_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => void create()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-coral px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-coral/25 disabled:opacity-60"
          >
            {busy && <Spinner className="h-4 w-4" />} Create
          </button>
        </div>
      </div>
    </div>
  );
}