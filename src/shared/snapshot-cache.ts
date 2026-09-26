import type { StorageBackend } from "./storage";

type Entry<T> = {
  v: number;
  fetchedAt: number;
  data: T;
};

export type Snapshot<T> = {
  data: T;
  fetchedAt: number;
};

/**
 * Stores one fetched value under one storage key, together with the time it was fetched.
 * Each save replaces the whole value, so readers never see a half-updated mix of old and new data.
 */
export type SnapshotCache<T> = {
  load: () => Promise<Snapshot<T> | null>;
  /** Resolves with the fetchedAt written to storage. */
  save: (data: T) => Promise<number>;
  clear: () => Promise<void>;
  subscribe: (listener: () => void) => () => void;
};

export type SnapshotCacheOptions = {
  storage: StorageBackend;
  key: string;
  /** Bump when the shape of T changes. Entries with another version are treated as missing. */
  version: number;
};

export const createSnapshotCache = <T>(opts: SnapshotCacheOptions): SnapshotCache<T> => {
  const { storage, key, version } = opts;
  return {
    load: async () => {
      const raw = await storage.get<Entry<T>>(key);
      if (!raw || raw.v !== version || raw.data === undefined) return null;
      return { data: raw.data, fetchedAt: raw.fetchedAt };
    },
    save: async (data) => {
      const entry: Entry<T> = { v: version, fetchedAt: Date.now(), data };
      await storage.set(key, entry);
      return entry.fetchedAt;
    },
    clear: () => storage.remove(key),
    subscribe: (listener) => storage.subscribe(key, () => listener()),
  };
};
