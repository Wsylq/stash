'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { ArrowLeft, Check, ExternalLink, Loader2, Pencil, RefreshCw, Sparkles, Star, Trash2, X } from 'lucide-react';
import type { Item, ItemType } from '@stash/shared';
import { ITEM_TYPES, ITEM_TYPE_LABELS } from '@stash/shared';
import { useItem, useCollections } from '@/lib/data';
import { api } from '@/lib/api';
import { AiStatusDot, Spinner, TypeBadge, useToast } from '@/components/ui';
import { timeAgo, TYPE_EMOJI } from '@/lib/format';

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: item, mutate, isLoading } = useItem((id as string) ?? null);
  const { collections } = useCollections();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [enriching, setEnriching] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="h-6 w-6 text-coral" />
      </div>
    );
  }
  if (!item) {
    return (
      <div className="space-y-4">
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="py-16 text-center">
          <div className="text-5xl" aria-hidden>🫥</div>
          <h3 className="mt-2 text-lg font-bold text-ink dark:text-night-ink">Item not found</h3>
          <p className="mt-1 text-sm text-muted">It may have been deleted.</p>
        </div>
      </div>
    );
  }

  const toggleDone = async () => {
    const next = await api.updateItem(item.id, { done: !item.done });
    await mutate(next.item, { revalidate: false });
  };
  const toggleStar = async () => {
    const next = await api.updateItem(item.id, { starred: !item.starred });
    await mutate(next.item, { revalidate: false });
  };
  const runEnrich = async () => {
    setEnriching(true);
    try {
      await api.enrichItem(item.id);
      toast('Organizing…');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not start enrichment', 'error');
    } finally {
      setEnriching(false);
    }
  };

  const recipe = extractRecipe(item);
  const workout = extractWorkout(item);
  const attachments = item.collections
    .map((cid) => collections.find((c) => c.id === cid))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const canEnrich = item.aiStatus === 'error' || item.aiStatus === 'none';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-muted hover:text-ink dark:bg-night-card dark:hover:text-night-ink"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 overflow-hidden">
          <h1 className="truncate text-xl font-extrabold text-ink dark:text-night-ink">{item.title || '(untitled)'}</h1>
          <div className="flex items-center gap-2 text-xs text-muted">
            <TypeBadge type={item.type} />
            {item.source && <span className="truncate">{item.source}</span>}
            <span>· {timeAgo(item.createdAt)}</span>
          </div>
        </div>
        <button
          onClick={() => void toggleDone()}
          aria-label={item.done ? 'Mark not done' : 'Mark done'}
          className={clsx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition',
            item.done ? 'bg-mint text-white' : 'bg-card text-muted hover:bg-mint/20 hover:text-mint dark:bg-night-card',
          )}
        >
          <Check className="h-5 w-5" strokeWidth={2.5} />
        </button>
        <button
          onClick={() => void toggleStar()}
          aria-label={item.starred ? 'Unstar' : 'Star'}
          className={clsx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition',
            item.starred ? 'bg-mango text-white' : 'bg-card text-muted hover:bg-mango/20 hover:text-mango dark:bg-night-card',
          )}
        >
          <Star className={clsx('h-5 w-5', item.starred && 'fill-current')} />
        </button>
      </div>

      {item.thumbnailUrl && (
        <div className="overflow-hidden rounded-3xl border border-stone-200/70 dark:border-night-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.thumbnailUrl} alt="" className="aspect-video w-full object-cover" loading="lazy" />
        </div>
      )}

      <AiStatusDot status={item.aiStatus} error={item.aiError} className="pl-1" />

      {item.aiStatus === 'done' && item.provider && (
        <p className="pl-1 text-[11px] text-muted">
          Organized by {item.provider} · {item.model}
        </p>
      )}

      {canEnrich && (
        <button
          onClick={() => void runEnrich()}
          disabled={enriching}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-500/40 bg-violet-500/10 px-4 py-2.5 text-sm font-bold text-violet-600 disabled:opacity-60 dark:text-violet-300"
        >
          {enriching ? <Loader2 className="h-4 w-4 animate-spin" /> : item.aiStatus === 'error' ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {item.aiStatus === 'error' ? 'Retry AI organizing' : 'Organize with AI'}
        </button>
      )}

      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-2xl border border-stone-300/70 bg-card px-4 py-3 text-sm font-bold text-coral transition hover:border-coral dark:border-night-card dark:bg-night-card"
        >
          <ExternalLink className="h-4 w-4 shrink-0" /> Open original
          <span className="ml-auto truncate text-xs font-normal text-muted">{new URL(item.url).hostname}</span>
        </a>
      )}

      {item.description && (
        <section className="rounded-3xl bg-card p-4 dark:bg-night-card">
          <h2 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
            <Sparkles className="h-3.5 w-3.5" /> AI summary
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink dark:text-night-ink">{item.description}</p>
        </section>
      )}

      {recipe && <RecipeSection recipe={recipe} />}
      {workout && <WorkoutSection workout={workout} />}

      {item.tags.length > 0 && (
        <section className="flex flex-wrap gap-1.5">
          {item.tags.map((t) => (
            <span key={t.id} className="rounded-full bg-stone-200/70 px-2.5 py-1 text-xs font-semibold text-muted dark:bg-night-card dark:text-night-ink/70">
              #{t.name}
            </span>
          ))}
        </section>
      )}

      {attachments.length > 0 && (
        <section className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted">In:</span>
          {attachments.map((c) => (
            <Link
              key={c.id}
              href={`/collections/${c.id}`}
              className="flex items-center gap-1 rounded-full bg-mint/15 px-2.5 py-1 text-xs font-bold text-teal-700 dark:text-mint"
            >
              <span>{c.emoji || '📁'}</span> {c.name}
            </Link>
          ))}
        </section>
      )}

      {item.textContent && (
        <section className="rounded-3xl bg-card p-4 dark:bg-night-card">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Original text</h2>
          <p className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm text-ink dark:text-night-ink">{item.textContent}</p>
        </section>
      )}

      <div className="safe-bottom flex gap-2 pt-2">
        <button
          onClick={() => setEditing(true)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-card px-4 py-2.5 text-sm font-bold text-muted hover:text-ink dark:bg-night-card dark:hover:text-night-ink"
        >
          <Pencil className="h-4 w-4" /> Edit
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-coral/10 px-4 py-2.5 text-sm font-bold text-coral"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </button>
      </div>

      {editing && (
        <EditSheet
          item={item}
          onClose={async (next) => {
            setEditing(false);
            if (next) {
              await mutate(next, { revalidate: false });
              toast('Saved');
            }
          }}
          allCollections={collections}
        />
      )}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-5 backdrop-blur-sm">
          <div className="animate-pop w-full max-w-xs rounded-3xl bg-cream p-5 text-center dark:bg-night-2">
            <h3 className="text-lg font-extrabold text-ink dark:text-night-ink">Delete this save?</h3>
            <p className="mt-1 text-sm text-muted">This can’t be undone.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-2xl bg-stone-200/70 px-4 py-2.5 text-sm font-bold text-muted dark:bg-night-card">
                Cancel
              </button>
              <button
                onClick={async () => {
                  await api.deleteItem(item.id);
                  toast('Deleted');
                  router.replace('/');
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

interface Recipe { ingredients: string[]; steps: string[]; servings: string | null; prepTime: string | null; cookTime: string | null }

function extractRecipe(item: Item): Recipe | null {
  const r = item.extracted as { recipe?: Partial<Recipe> } | null;
  const recipe = r?.recipe;
  if (!recipe) return null;
  return {
    ingredients: Array.isArray(recipe.ingredients) ? (recipe.ingredients as string[]) : [],
    steps: Array.isArray(recipe.steps) ? (recipe.steps as string[]) : [],
    servings: recipe.servings ?? null,
    prepTime: recipe.prepTime ?? null,
    cookTime: recipe.cookTime ?? null,
  };
}

function RecipeSection({ recipe }: { recipe: Recipe }) {
  return (
    <section className="rounded-3xl bg-card p-4 dark:bg-night-card">
      <h2 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <span aria-hidden>🍳</span> Recipe
      </h2>
      {(recipe.servings || recipe.prepTime || recipe.cookTime) && (
        <div className="mb-3 flex flex-wrap gap-1.5 text-[11px]">
          {recipe.servings && <span className="rounded-full bg-coral/10 px-2 py-0.5 font-bold text-coral-dark dark:text-coral">Serves {recipe.servings}</span>}
          {recipe.prepTime && <span className="rounded-full bg-stone-200/70 px-2 py-0.5 font-semibold text-muted dark:bg-night-2">Prep {recipe.prepTime}</span>}
          {recipe.cookTime && <span className="rounded-full bg-stone-200/70 px-2 py-0.5 font-semibold text-muted dark:bg-night-2">Cook {recipe.cookTime}</span>}
        </div>
      )}
      {recipe.ingredients.length > 0 && (
        <details className="group mb-3" open>
          <summary className="cursor-pointer text-sm font-bold text-ink dark:text-night-ink">Ingredients ({recipe.ingredients.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 pl-4 text-sm text-ink marker:text-muted dark:text-night-ink">
            {recipe.ingredients.map((ing, i) => (
              <li key={i} className="list-disc">{ing}</li>
            ))}
          </ul>
        </details>
      )}
      {recipe.steps.length > 0 && (
        <ol className="flex flex-col gap-2.5">
          {recipe.steps.map((step, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-ink dark:text-night-ink">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint text-[11px] font-bold text-white">{i + 1}</span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

interface Workout { exercises: { name: string; sets: string | null; reps: string | null; duration: string | null }[]; duration: string | null; notes: string | null }

function extractWorkout(item: Item): Workout | null {
  const w = item.extracted as { workout?: Partial<Workout> } | null;
  const workout = w?.workout;
  if (!workout || !Array.isArray(workout.exercises)) return null;
  return {
    exercises: (workout.exercises as Workout['exercises']).map((e) => ({
      name: e.name ?? 'Exercise',
      sets: e.sets ?? null,
      reps: e.reps ?? null,
      duration: e.duration ?? null,
    })),
    duration: workout.duration ?? null,
    notes: workout.notes ?? null,
  };
}

function WorkoutSection({ workout }: { workout: Workout }) {
  return (
    <section className="rounded-3xl bg-card p-4 dark:bg-night-card">
      <h2 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <span aria-hidden>💪</span> Workout
      </h2>
      {workout.duration && <p className="mb-2 text-sm font-bold text-teal-700 dark:text-mint">{workout.duration}</p>}
      <ol className="flex flex-col gap-2">
        {workout.exercises.map((ex, i) => (
          <li key={i} className="flex items-center justify-between gap-3 rounded-2xl bg-stone-100 px-3 py-2 dark:bg-night-2">
            <span className="min-w-0 truncate text-sm font-bold text-ink dark:text-night-ink">{ex.name}</span>
            <span className="shrink-0 text-xs font-semibold text-muted">
              {[ex.sets, ex.reps, ex.duration].filter(Boolean).join(' · ')}
            </span>
          </li>
        ))}
      </ol>
      {workout.notes && <p className="mt-3 text-xs leading-relaxed text-muted">{workout.notes}</p>}
    </section>
  );
}

const TYPE_COLORS: Record<string, string> = {
  video: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
  recipe: 'bg-coral/15 text-coral-dark dark:text-coral',
  workout: 'bg-mint/15 text-teal-700 dark:text-mint',
};

function EditSheet({ item, onClose, allCollections }: { item: Item; onClose: (next?: Item) => void; allCollections: { id: string; name: string; emoji: string }[] }) {
  const [title, setTitle] = useState(item.title);
  const [type, setType] = useState<ItemType>(item.type);
  const [description, setDescription] = useState(item.description ?? '');
  const [selected, setSelected] = useState<string[]>(item.collections);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(item.tags.map((t) => t.name));
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  function commitTag(t: string) {
    const clean = t.trim().replace(/^#/, '').toLowerCase().slice(0, 40);
    if (!clean) return;
    setTags((x) => (x.includes(clean) ? x : [...x, clean]));
    setTagInput('');
  }

  async function save() {
    setBusy(true);
    try {
      const res = await api.updateItem(item.id, {
        title: title.trim() || null,
        type,
        description: description.trim() || null,
        collectionIds: selected,
        tagNames: tags,
      });
      onClose(res.item);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => onClose()} aria-label="Close" />
      <div className="animate-slide-up relative z-10 flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-cream shadow-2xl sm:rounded-3xl dark:bg-night-2">
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-lg font-extrabold text-ink dark:text-night-ink">Edit save</h2>
          <button onClick={() => onClose()} className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-200/70 text-muted dark:bg-night-card" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-2xl border border-stone-300/70 bg-card px-3.5 py-2.5 text-sm outline-none focus:border-coral focus:ring-2 focus:ring-coral/30 dark:border-night-card dark:bg-night-card"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Type</label>
            <div className="rail flex gap-1.5 overflow-x-auto pb-1">
              {ITEM_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={clsx(
                    'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold capitalize transition',
                    type === t
                      ? TYPE_COLORS[t] ?? 'bg-ink text-cream dark:bg-night-ink dark:text-night'
                      : 'bg-stone-200/70 text-muted dark:bg-night-card dark:text-night-ink/70',
                  )}
                >
                  {TYPE_EMOJI[t]} {ITEM_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">AI summary</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-2xl border border-stone-300/70 bg-card px-3.5 py-2.5 text-sm outline-none focus:border-coral focus:ring-2 focus:ring-coral/30 dark:border-night-card dark:bg-night-card"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Collections</label>
            <div className="rail flex gap-1.5 overflow-x-auto pb-1">
              {allCollections.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))}
                  className={clsx(
                    'flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition',
                    selected.includes(c.id) ? 'bg-mint text-white' : 'bg-stone-200/70 text-muted dark:bg-night-card dark:text-night-ink/70',
                  )}
                >
                  <span>{c.emoji || '📁'}</span> {c.name}
                </button>
              ))}
              {allCollections.length === 0 && <span className="text-xs text-muted">No collections yet</span>}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Tags</label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-stone-300/70 bg-card px-2 py-1.5 focus-within:border-coral focus-within:ring-2 focus-within:ring-coral/30 dark:border-night-card dark:bg-night-card">
              {tags.map((t) => (
                <span key={t} className="flex items-center gap-1 rounded-full bg-mint/15 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:text-mint">
                  #{t}
                  <button onClick={() => setTags((x) => x.filter((y) => y !== t))} className="text-muted hover:text-coral" aria-label={`Remove ${t}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    commitTag(tagInput);
                  } else if (e.key === 'Backspace' && !tagInput && tags.length) {
                    setTags((x) => x.slice(0, -1));
                  }
                }}
                onBlur={() => tagInput && commitTag(tagInput)}
                placeholder={tags.length ? '' : 'tag1, tag2…'}
                className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted"
              />
            </div>
          </div>
        </div>
        <div className="safe-bottom border-t border-stone-200/70 bg-cream px-5 pb-4 pt-3 dark:border-night-card dark:bg-night-2">
          <button
            onClick={() => void save()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-coral px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-coral/25 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
          </button>
        </div>
      </div>
    </div>
  );
}