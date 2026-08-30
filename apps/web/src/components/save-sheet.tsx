'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import type { ItemType } from '@stash/shared';
import { ITEM_TYPES, ITEM_TYPE_LABELS } from '@stash/shared';
import { api, fetchItemTypeHint } from '@/lib/api';
import { useCollections } from '@/lib/data';
import { useAuth } from '@/lib/auth';
import { useToast } from './ui';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
  initialUrl?: string | null;
  initialText?: string | null;
  initialTitle?: string | null;
}

export function SaveSheet({ open, onClose, onSaved, initialUrl, initialText, initialTitle }: Props) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [text, setText] = useState(initialText ?? '');
  const [title, setTitle] = useState(initialTitle ?? '');
  const [type, setType] = useState<ItemType | ''>('');
  const [enrich, setEnrich] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const { collections } = useCollections();
  const { authed } = useAuth();
  const toast = useToast();
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUrl(initialUrl ?? '');
      setText(initialText ?? '');
      setTitle(initialTitle ?? '');
      setType('');
      setTags([]);
      setTagInput('');
      setSelectedCollections([]);
      setEnrich(false);
      api
        .getSettings()
        .then((r) => setAiAvailable(r.settings.apiKeyConfigured))
        .catch(() => setAiAvailable(false));
      setTimeout(() => urlRef.current?.focus(), 250);
    }
  }, [open, initialUrl, initialText, initialTitle]);

  const previewType = useMemo(() => {
    if (type) return type;
    if (url.trim()) return fetchItemTypeHint(url.trim(), url.trim());
    if (text.trim()) return fetchItemTypeHint(text.trim());
    return null;
  }, [url, text, type]);

  if (!open) return null;

  function commitTag(tag: string) {
    const clean = tag.trim().replace(/^#/, '').toLowerCase().slice(0, 40);
    if (!clean) return;
    setTags((t) => (t.includes(clean) ? t : [...t, clean]));
    setTagInput('');
  }

  async function save() {
    if (!url.trim() && !text.trim() && !title.trim()) {
      toast('Add a URL, some text, or a title to save something', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.createItem({
        url: url.trim() || null,
        text: text.trim() || null,
        title: title.trim() || null,
        type: type || null,
        tagNames: tags,
        collectionIds: selectedCollections,
        enrich,
        matchCollections: true,
      });
      toast(enrich ? 'Saved — organizing with AI…' : 'Stashed!');
      onSaved?.(res.item.id);
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="animate-slide-up relative z-10 flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-cream shadow-2xl sm:rounded-3xl dark:bg-night-2">
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-lg font-extrabold text-ink dark:text-night-ink">New save</h2>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-200/70 text-muted hover:bg-stone-200 dark:bg-night-card dark:text-night-ink/70" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Link</label>
            <input
              ref={urlRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              inputMode="url"
              className="w-full rounded-2xl border border-stone-300/70 bg-card px-3.5 py-2.5 text-sm text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/30 dark:border-night-card dark:bg-night-card dark:text-night-ink"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Or paste text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Recipe, article text, a note…"
              rows={3}
              className="w-full resize-none rounded-2xl border border-stone-300/70 bg-card px-3.5 py-2.5 text-sm text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/30 dark:border-night-card dark:bg-night-card dark:text-night-ink"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Title (optional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A nicer name…"
              className="w-full rounded-2xl border border-stone-300/70 bg-card px-3.5 py-2.5 text-sm text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/30 dark:border-night-card dark:bg-night-card dark:text-night-ink"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Type {previewType ? `· looks like ${ITEM_TYPE_LABELS[previewType]}` : '· auto'}</label>
            <div className="rail flex gap-1.5 overflow-x-auto pb-1">
              <button
                onClick={() => setType('')}
                className={clsx(
                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition',
                  type === '' ? 'bg-ink text-cream dark:bg-night-ink dark:text-night' : 'bg-stone-200/70 text-muted dark:bg-night-card dark:text-night-ink/70',
                )}
              >
                ✨ Auto
              </button>
              {ITEM_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(type === t ? '' : t)}
                  className={clsx(
                    'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold capitalize transition',
                    type === t ? 'bg-coral text-white' : 'bg-stone-200/70 text-muted hover:text-ink dark:bg-night-card dark:text-night-ink/70',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {aiAvailable && (
            <button
              onClick={() => setEnrich((e) => !e)}
              className={clsx(
                'flex w-full items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-left transition',
                enrich ? 'border-coral/60 bg-coral/10' : 'border-stone-300/70 bg-card dark:border-night-card dark:bg-night-card',
              )}
            >
              <span className={clsx('flex h-8 w-8 items-center justify-center rounded-full', enrich ? 'bg-coral text-white' : 'bg-stone-200/70 text-muted dark:bg-night-2')}>
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-bold text-ink dark:text-night-ink">Organize with AI</span>
                <span className="block text-[11px] text-muted">Summarize, tag & extract recipes/workouts automatically</span>
              </span>
              <span className={clsx('flex h-5 w-5 items-center justify-center rounded-full border', enrich ? 'border-coral bg-coral text-white' : 'border-stone-300')}>
                {enrich && <Check className="h-3.5 w-3.5" />}
              </span>
            </button>
          )}

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Collections</label>
            <div className="rail flex gap-1.5 overflow-x-auto pb-1">
              {collections.map((c) => (
                <button
                  key={c.id}
                  onClick={() =>
                    setSelectedCollections((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))
                  }
                  className={clsx(
                    'flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition',
                    selectedCollections.includes(c.id)
                      ? 'bg-mint text-white'
                      : 'bg-stone-200/70 text-muted hover:text-ink dark:bg-night-card dark:text-night-ink/70',
                  )}
                >
                  <span>{c.emoji || '📁'}</span> {c.name}
                </button>
              ))}
              {collections.length === 0 && <span className="text-xs text-muted">No collections yet — create some in the Collections tab</span>}
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
                className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-sm text-ink outline-none placeholder:text-muted dark:text-night-ink"
              />
            </div>
          </div>
        </div>

        <div className="safe-bottom border-t border-stone-200/70 bg-cream px-5 pb-4 pt-3 dark:border-night-card dark:bg-night-2">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-coral px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-coral/25 transition active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>💾</span>}
            {authed ? (saving ? 'Saving…' : 'Save to stash') : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}