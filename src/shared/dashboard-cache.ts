import type { DashboardData } from "./github";
import type { StorageBackend } from "./storage";

const KEY = "dashboard-cache";
const VERSION = 1;

type CacheEntry = {
  v: number;
  fetchedAt: number;
  data: DashboardData;
};

export type DashboardCache = {
  load: () => Promise<{ data: DashboardData; fetchedAt: number } | null>;
  save: (data: DashboardData) => Promise<void>;
  clear: () => Promise<void>;
};

export const createDashboardCache = (storage: StorageBackend): DashboardCache => {
  return {
    load: async () => {
      const raw = await storage.get<CacheEntry>(KEY);
      if (!raw || raw.v !== VERSION || !raw.data) return null;
      // writableRepos は後から追加されたため、古いキャッシュには無い
      const data: DashboardData = { ...raw.data, writableRepos: raw.data.writableRepos ?? [] };
      return { data, fetchedAt: raw.fetchedAt };
    },
    save: async (data) => {
      const entry: CacheEntry = { v: VERSION, fetchedAt: Date.now(), data };
      await storage.set(KEY, entry);
    },
    clear: () => storage.remove(KEY),
  };
};
