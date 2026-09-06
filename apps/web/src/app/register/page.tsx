'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui';

export default function RegisterPage() {
  const { register, authed } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  if (authed) {
    router.replace(nextUrl() ?? '/');
    return null;
  }

  function nextUrl(): string | null {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('next');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast('Passwords do not match', 'error');
      return;
    }
    setBusy(true);
    try {
      await register(email, password);
      router.replace(nextUrl() ?? '/');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create account', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[70dvh] items-center justify-center">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl bg-card p-6 shadow-sm dark:bg-night-card">
        <div className="flex items-center gap-2">
          <Link href="/" aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-200/70 text-muted dark:bg-night-2">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold text-ink dark:text-night-ink">Make your stash</h1>
            <p className="text-xs text-muted">Accounts live on your own server. No data leaves the box.</p>
          </div>
        </div>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-2xl border border-stone-300/70 bg-cream px-3.5 py-2.5 text-sm outline-none focus:border-coral focus:ring-2 focus:ring-coral/30 dark:border-night-card dark:bg-night"
        />
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min 8 characters)"
          className="w-full rounded-2xl border border-stone-300/70 bg-cream px-3.5 py-2.5 text-sm outline-none focus:border-coral focus:ring-2 focus:ring-coral/30 dark:border-night-card dark:bg-night"
        />
        <input
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat password"
          className="w-full rounded-2xl border border-stone-300/70 bg-cream px-3.5 py-2.5 text-sm outline-none focus:border-coral focus:ring-2 focus:ring-coral/30 dark:border-night-card dark:bg-night"
        />
        <button
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-coral px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-coral/25 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create account
        </button>
        <p className="text-center text-xs text-muted">
          Already have an account?{' '}
          <Link href="/login" className="font-bold text-coral">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}