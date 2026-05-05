import type { StorageBackend } from "./storage";

export type Settings = {
  /** GitHub Personal Access Token. 未設定なら null */
  pat: string | null;
  /** ピン留めしたリポジトリ ("owner/repo" 形式) */
  pinnedRepos: string[];
  /** リポジトリカードの表示枚数 */
  repoCardCount: number;
  /** ダッシュボードを置換するか */
  enabled: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  pat: null,
  pinnedRepos: [],
  repoCardCount: 8,
  enabled: true,
};

const KEY = "settings";

export type SettingsStore = {
  get: () => Promise<Settings>;
  set: (patch: Partial<Settings>) => Promise<Settings>;
  subscribe: (listener: (settings: Settings) => void) => () => void;
};

export const createSettingsStore = (storage: StorageBackend): SettingsStore => {
  const merge = (raw: unknown): Settings => {
    if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(raw as Partial<Settings>) };
  };

  return {
    get: async () => merge(await storage.get(KEY)),
    set: async (patch) => {
      const current = merge(await storage.get(KEY));
      const next = { ...current, ...patch };
      await storage.set(KEY, next);
      return next;
    },
    subscribe: (listener) => storage.subscribe(KEY, (raw) => listener(merge(raw))),
  };
};
