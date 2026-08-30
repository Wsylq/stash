'use client';

import useSWR from 'swr';
import type { Collection, Item, ItemType, Stats } from '@stash/shared';
import { api } from './api';

const defaultInit = { revalidateOnFocus: false, revalidateOnReconnect: true, dedupingInterval: 4000 };

export function useItems(params: Record<string, string | undefined> = {}) {
  const key = params.q || params.type || params.collection || params.starred || params.done || params.unconsumed || params.tag
    ? `/items?${new URLSearchParams(Object.entries(params).filter(([, v]) => v).map(([k, v]) => [k, v as string]))}`
    : `/items`;
  const { data, error, mutate, isLoading } = useSWR<{ items: Item[]; total: number }>(key, () => api.listItems(params), defaultInit);
  return { items: data?.items ?? [], total: data?.total ?? 0, error, mutate, isLoading };
}

export function useItem(id: string | null) {
  return useSWR<Item | null>(id ? `/items/${id}` : null, () => (id ? api.getItem(id).then((r) => r.item) : null), defaultInit);
}

export function useCollections() {
  const { data, error, mutate, isLoading } = useSWR<Collection[]>('/collections', () => api.listCollections().then((r) => r.collections), defaultInit);
  return { collections: data ?? [], error, mutate, isLoading };
}

export function useCollection(id: string | null) {
  const { data, error, mutate, isLoading } = useSWR(id ? `/collections/${id}` : null, () => (id ? api.getCollection(id) : null), defaultInit);
  return { collection: data?.collection, items: data?.items ?? [], total: data?.total ?? 0, error, mutate, isLoading };
}

export function useStats() {
  const { data } = useSWR<Stats | null>('/stats', () => api.stats().then((r) => r.stats), defaultInit);
  return data;
}

export type FilterKey = 'all' | 'unconsumed' | 'done' | 'starred' | ItemType;

export const filterParams: Record<'all' | 'unconsumed' | 'done' | 'starred', Record<string, string>> = {
  all: {},
  unconsumed: { unconsumed: 'true' },
  done: { done: 'true' },
  starred: { starred: 'true' },
};