'use client';

import { useEffect } from 'react';

export function SWUpdater() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV === 'development') return;
    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    if (navigator.serviceWorker.controller) {
      register();
    } else {
      window.addEventListener('load', register);
    }
    return () => window.removeEventListener('load', register);
  }, []);
  return null;
}