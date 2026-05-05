/**
 * 鍵→値の薄い永続化レイヤ。chrome.storage.local とテスト用 in-memory の両実装で実体化する。
 * Settings はこの上に構築する。
 */
export type StorageBackend = {
  get: <T = unknown>(key: string) => Promise<T | undefined>;
  set: (key: string, value: unknown) => Promise<void>;
  remove: (key: string) => Promise<void>;
  subscribe: (key: string, listener: (value: unknown) => void) => () => void;
};

export const createMemoryStorage = (initial: Record<string, unknown> = {}): StorageBackend => {
  const data = new Map<string, unknown>(Object.entries(initial));
  const listeners = new Map<string, Set<(value: unknown) => void>>();

  const notify = (key: string, value: unknown) => {
    listeners.get(key)?.forEach((l) => l(value));
  };

  return {
    get: async (key) => data.get(key) as never,
    set: async (key, value) => {
      data.set(key, value);
      notify(key, value);
    },
    remove: async (key) => {
      data.delete(key);
      notify(key, undefined);
    },
    subscribe: (key, listener) => {
      const set = listeners.get(key) ?? new Set();
      set.add(listener);
      listeners.set(key, set);
      return () => set.delete(listener);
    },
  };
};

/** content script の chrome.* 呼び出しは、拡張リロード後に "Extension context invalidated" を投げる。
 *  chrome.runtime.id が消えていれば古いコンテキストと判定し、no-op で返す。 */
const isAlive = (): boolean => {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
};

export const createChromeStorage = (
  area: chrome.storage.StorageArea = chrome.storage.local,
): StorageBackend => {
  return {
    get: async (key) => {
      if (!isAlive()) return undefined;
      const result = await area.get(key);
      return result[key];
    },
    set: async (key, value) => {
      if (!isAlive()) return;
      await area.set({ [key]: value });
    },
    remove: async (key) => {
      if (!isAlive()) return;
      await area.remove(key);
    },
    subscribe: (key, listener) => {
      if (!isAlive()) return () => {};
      const handler = (
        changes: { [k: string]: chrome.storage.StorageChange },
        areaName: string,
      ) => {
        if (!isAlive()) return;
        if (areaName !== areaNameOf(area)) return;
        if (key in changes) {
          listener(changes[key]?.newValue);
        }
      };
      chrome.storage.onChanged.addListener(handler);
      return () => {
        if (!isAlive()) return;
        chrome.storage.onChanged.removeListener(handler);
      };
    },
  };
};

const areaNameOf = (area: chrome.storage.StorageArea): string => {
  if (area === chrome.storage.local) return "local";
  if (area === chrome.storage.sync) return "sync";
  if (area === chrome.storage.session) return "session";
  if (area === chrome.storage.managed) return "managed";
  return "unknown";
};
