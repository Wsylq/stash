'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { Folder, Home, LogIn, Plus, Search, Settings2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { SaveSheet } from './save-sheet';

interface SaveOptions {
  url?: string | null;
  text?: string | null;
  title?: string | null;
}
const SaveCtx = createContext<(opts?: SaveOptions) => void>(() => {});

export const useSave = () => useContext(SaveCtx);

export function AppShell({ children }: { children: React.ReactNode }) {
  const { authed, user, loading, logout } = useAuth();
  const pathname = usePathname();
  const isAuthRoute = pathname === '/login' || pathname === '/register';
  const [saveOpen, setSaveOpen] = useState(false);
  const [savePrefill, setSavePrefill] = useState<SaveOptions>({});

  const openSave = useCallback((opts: SaveOptions = {}) => {
    setSavePrefill(opts);
    setSaveOpen(true);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream text-4xl dark:bg-night" aria-hidden>
        🗃️
      </div>
    );
  }

  return (
    <SaveCtx.Provider value={openSave}>
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-cream dark:bg-night">
        <main className="flex-1 px-4 pb-28 pt-4 sm:pt-6">{authed || isAuthRoute ? children : <Gate userEmail={user?.email} onLogout={logout} />}</main>

        {authed && (
          <>
            <SaveSheet
              open={saveOpen}
              onClose={() => setSaveOpen(false)}
              initialUrl={savePrefill.url ?? null}
              initialText={savePrefill.text ?? null}
              initialTitle={savePrefill.title ?? null}
            />

            <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-2xl border-t border-stone-200/70 bg-card/95 backdrop-blur dark:border-night-card dark:bg-night-card/95">
              <div className="relative flex items-center justify-around px-2 py-2">
                <NavItem href="/" icon={<Home className="h-5 w-5" />} label="Home" active={pathname === '/'} />
                <NavItem href="/collections" icon={<Folder className="h-5 w-5" />} label="Collections" active={pathname.startsWith('/collections')} />
                <div className="relative -mt-6 w-14">
                  <button
                    onClick={() => openSave()}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-coral text-white shadow-lg shadow-coral/40 transition active:scale-95"
                    aria-label="Save something"
                  >
                    <Plus className="h-7 w-7" strokeWidth={2.5} />
                  </button>
                </div>
                <NavItem href="/search" icon={<Search className="h-5 w-5" />} label="Search" active={pathname.startsWith('/search')} />
                <NavItem href="/settings" icon={<Settings2 className="h-5 w-5" />} label="Settings" active={pathname.startsWith('/settings')} />
              </div>
            </nav>
          </>
        )}
      </div>
    </SaveCtx.Provider>
  );
}

function NavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={clsx(
        'flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-bold transition',
        active ? 'text-coral' : 'text-muted hover:text-ink dark:hover:text-night-ink',
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

function Gate({ userEmail, onLogout }: { userEmail?: string; onLogout: () => void }) {
  const router = useRouter();
  const goToAuth = (path: string) => {
    const { pathname, search } = window.location;
    router.push(`${path}?next=${encodeURIComponent(pathname + search)}`);
  };
  return (
    <div className="flex h-[70dvh] flex-col items-center justify-center gap-3 text-center">
      <div className="text-6xl" aria-hidden>🔐</div>
      <h2 className="text-xl font-extrabold text-ink dark:text-night-ink">Your stash is private</h2>
      <p className="max-w-xs text-sm text-muted">
        {userEmail ? `Signed in as ${userEmail}. ` : ''}Sign in to see your saved items.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => goToAuth('/login')}
          className="flex items-center gap-2 rounded-2xl bg-coral px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-coral/25"
        >
          <LogIn className="h-4 w-4" /> Sign in
        </button>
        {userEmail && (
          <button onClick={onLogout} className="rounded-2xl px-4 py-2.5 text-sm font-bold text-muted hover:bg-stone-200/60 dark:hover:bg-night-card">
            Log out
          </button>
        )}
      </div>
      <p className="text-xs text-muted/80">
        First time?{' '}
        <button type="button" onClick={() => goToAuth('/register')} className="font-bold text-coral">
          Create an account
        </button>
      </p>
    </div>
  );
}