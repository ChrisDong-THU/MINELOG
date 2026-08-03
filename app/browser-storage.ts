"use client";

import { useCallback, useSyncExternalStore } from "react";

export type StateUpdater<T> = T | ((current: T) => T);

type JsonStorageStore<T> = {
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  subscribe: (listener: () => void) => () => void;
  set: (update: StateUpdater<T>) => void;
};

export function createJsonStorageStore<T>(key: string, fallback: T): JsonStorageStore<T> {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let cachedValue = fallback;

  const read = () => {
    if (typeof window === "undefined") return fallback;
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return cachedValue;
    }
    if (raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    if (raw === null) {
      cachedValue = fallback;
      return cachedValue;
    }
    try {
      cachedValue = JSON.parse(raw) as T;
    } catch {
      cachedValue = fallback;
    }
    return cachedValue;
  };

  const notify = () => listeners.forEach((listener) => listener());

  return {
    getSnapshot: read,
    getServerSnapshot: () => fallback,
    subscribe(listener) {
      listeners.add(listener);
      const handleStorage = (event: StorageEvent) => {
        if (event.storageArea !== window.localStorage || event.key !== key) return;
        cachedRaw = undefined;
        notify();
      };
      window.addEventListener("storage", handleStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", handleStorage);
      };
    },
    set(update) {
      const current = read();
      const next = typeof update === "function" ? (update as (value: T) => T)(current) : update;
      const raw = JSON.stringify(next);
      cachedRaw = raw;
      cachedValue = next;
      try {
        window.localStorage.setItem(key, raw);
      } catch {
        // Keep the in-memory value when storage is unavailable or full.
      }
      notify();
    },
  };
}

export function useJsonStorageState<T>(store: JsonStorageStore<T>) {
  const value = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const setValue = useCallback((update: StateUpdater<T>) => store.set(update), [store]);
  return [value, setValue] as const;
}

const subscribeHydration = () => () => undefined;

export function useHydrated() {
  return useSyncExternalStore(subscribeHydration, () => true, () => false);
}
