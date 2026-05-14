import type { Logger } from "./logger";
import { rootLogger } from "./logger";
import type { StorageBackend } from "@/shared/storage";
import { createChromeStorage } from "@/shared/storage";
import type { SettingsStore } from "@/shared/settings";
import { createSettingsStore } from "@/shared/settings";
import type { ViewStatsStore } from "@/shared/view-stats";
import { createViewStatsStore } from "@/shared/view-stats";
import type { DashboardCache } from "@/shared/dashboard-cache";
import { createDashboardCache } from "@/shared/dashboard-cache";
import type { GitHubClient, GitHubClientOptions } from "@/shared/github";
import { createGitHubClient } from "@/shared/github";

export type GitHubClientFactory = (pat: string, opts?: GitHubClientOptions) => GitHubClient;

/**
 * 拡張機能のコンテンツスクリプト全体で共有される依存性。
 * Feature や Solid コンポーネントはこの context を介してストア・クライアントへアクセスする。
 * モジュールトップで chrome.* を直接触らずに済むので、テスト時には createMemoryStorage や
 * モック factory を差し込める。
 */
export type AppContext = {
  readonly storage: StorageBackend;
  readonly settings: SettingsStore;
  readonly viewStats: ViewStatsStore;
  readonly dashboardCache: DashboardCache;
  readonly log: Logger;
  readonly github: GitHubClientFactory;
};

export type CreateAppContextOptions = {
  storage?: StorageBackend;
  log?: Logger;
  github?: GitHubClientFactory;
};

/**
 * StorageBackend を渡して AppContext を組み立てる。
 * 既定では chrome.storage.local を使うが、テストや代替バックエンドを差し替えられる。
 */
export const createAppContext = (opts: CreateAppContextOptions = {}): AppContext => {
  const storage = opts.storage ?? createChromeStorage();
  const log = opts.log ?? rootLogger;
  const github = opts.github ?? createGitHubClient;
  return {
    storage,
    settings: createSettingsStore(storage),
    viewStats: createViewStatsStore(storage),
    dashboardCache: createDashboardCache(storage),
    log,
    github,
  };
};
