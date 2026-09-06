'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PublicUser } from '@stash/shared';
import { api, cacheUser, getCachedUser, isAuthed, onUnauthorized, setAuth } from './api';

interface AuthCtx {
  user: PublicUser | null;
  authed: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(() => getCachedUser());
  const [loading, setLoading] = useState(() => isAuthed());
  const authed = !!user;

  const refresh = useCallback(async () => {
    if (!isAuthed()) {
      setUser(getCachedUser());
      setLoading(false);
      return;
    }
    try {
      const me = await api.me();
      setUser(me);
      cacheUser(me);
    } catch {
      setUser(null);
      setAuth(null, null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const off = onUnauthorized(() => {
      setUser(null);
      setAuth(null, null);
    });
    const onFocus = () => {
      if (isAuthed() && !user) void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      off();
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, user]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setAuth(res.token, res.user);
    setUser(res.user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const res = await api.register(email, password);
    setAuth(res.token, res.user);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    setAuth(null, null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, authed, loading, login, register, logout, refresh }),
    [user, authed, loading, login, register, logout, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}