'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SaveSheet } from '@/components/save-sheet';

export default function SavePage() {
  const params = useSearchParams();
  const [open, setOpen] = useState(true);
  const url = params.get('url');
  const text = params.get('text');
  const title = params.get('title');

  const effectiveUrl = url || (text && /^https?:\/\//.test(text.trim()) ? text.trim() : null);

  return (
    <div>
      <SaveSheet
        open={open}
        onClose={() => setOpen(false)}
        initialUrl={effectiveUrl}
        initialText={effectiveUrl === null ? text : necessaryExtra(text, url)}
        initialTitle={title}
      />
      {/* Keep the sheet mountable even if query loads after first render */}
      <div className="hidden" aria-hidden>Waiting for share…</div>
    </div>
  );
}

function necessaryExtra(text: string | null, url: string | null): string | null {
  if (!text || !url) return text;
  const stripped = text.replace(/^https?:\/\/\S+\s*/g, '').trim();
  return stripped || null;
}