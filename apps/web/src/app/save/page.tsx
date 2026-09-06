'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { SaveSheet } from '@/components/save-sheet';

export default function SavePage() {
  const params = useSearchParams();
  const url = params.get('url');
  const text = params.get('text');
  const title = params.get('title');

  const effectiveUrl = url || (text && /^https?:\/\//.test(text.trim()) ? text.trim() : null);
  const hasPrefill = !!(effectiveUrl || text || title);
  const [open, setOpen] = useState(hasPrefill);

  return (
    <div className="pt-2">
      <SaveSheet
        open={open}
        onClose={() => setOpen(false)}
        initialUrl={effectiveUrl}
        initialText={effectiveUrl === null ? text : necessaryExtra(text, url)}
        initialTitle={title}
      />
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-stone-300/80 bg-card/50 px-6 py-10 text-center transition hover:border-coral/60 dark:border-night-card dark:bg-night-card/40"
        >
          <Plus className="h-8 w-8 text-coral" />
          <span className="text-sm font-extrabold text-ink dark:text-night-ink">Save something</span>
          <span className="text-xs text-muted">Share a link, note, or reel from any app to Stash.</span>
        </button>
      )}
    </div>
  );
}

function necessaryExtra(text: string | null, url: string | null): string | null {
  if (!text || !url) return text;
  const stripped = text.replace(/^https?:\/\/\S+\s*/g, '').trim();
  return stripped || null;
}