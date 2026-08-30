'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import clsx from 'clsx';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
      aria-label="Loading"
    />
  );
}

export function TypeBadge({ type, className }: { type: string; className?: string }) {
  const labels: Record<string, string> = {
    link: 'Link', article: 'Article', video: 'Video', recipe: 'Recipe', workout: 'Workout',
    note: 'Note', place: 'Place', product: 'Product', book: 'Book', movie: 'Movie',
    music: 'Music', game: 'Game', image: 'Image',
  };
  const styles: Record<string, string> = {
    video: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
    recipe: 'bg-coral/15 text-coral-dark dark:text-coral',
    workout: 'bg-mint/15 text-teal-700 dark:text-mint',
    note: 'bg-stone-500/15 text-stone-600 dark:text-stone-300',
    article: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300',
    image: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300',
    product: 'bg-amber-500/15 text-amber-700 dark:text-mango',
  };
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize tracking-wide',
        styles[type] ?? 'bg-stone-500/15 text-stone-600 dark:text-stone-300',
        className,
      )}
    >
      {labels[type] ?? type}
    </span>
  );
}

export function EmptyState({ emoji, title, subtitle, action }: { emoji?: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-3xl px-6 py-16 text-center">
      <div className="text-5xl" aria-hidden>{emoji ?? '🗂️'}</div>
      <h3 className="text-lg font-bold text-ink dark:text-night-ink">{title}</h3>
      <p className="max-w-xs text-sm text-muted dark:text-night-ink/60">{subtitle}</p>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-2xl bg-stone-300/50 dark:bg-night-card', className)} />;
}

export function AiStatusDot({ status, error, className }: { status: string; error?: string | null; className?: string }) {
  if (status === 'processing') {
    return (
      <span className={clsx('inline-flex items-center gap-1.5 text-[11px] font-medium text-mango', className)} title={error ?? 'Processing…'}>
        <Spinner className="h-3 w-3 text-mango" /> Organizing…
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className={clsx('inline-flex items-center gap-1 text-[11px] font-medium text-coral', className)} title={error ?? 'AI enrichment failed'}>
        ⚠️ AI off
      </span>
    );
  }
  return null;
}

interface Toast {
  id: number;
  message: string;
  tone: 'ok' | 'error';
}

const ToastCtx = createContext<(message: string, tone?: 'ok' | 'error') => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'animate-pop pointer-events-auto rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg',
              t.tone === 'ok' ? 'bg-ink text-cream dark:bg-night-ink dark:text-night' : 'bg-coral text-white',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}