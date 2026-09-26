import type { SettingsStore } from "@/shared/settings";
import type { DashboardCache } from "@/shared/dashboard-cache";
import type { WritableReposCache } from "@/shared/writable-repos-cache";
import type { GitHubClientFactory } from "@/shared/github";
import type { RefreshResult } from "@/shared/messages";
import type { Snapshot } from "@/shared/snapshot-cache";

export type DashboardRefresher = {
  refresh: () => Promise<RefreshResult>;
  refreshIfStale: (maxAgeMs: number) => Promise<RefreshResult>;
};

export type RefresherDeps = {
  settings: SettingsStore;
  dashboardCache: DashboardCache;
  writableReposCache: WritableReposCache;
  github: GitHubClientFactory;
};

/** Shares one running call among all callers until it settles. */
const singleFlight = <T>(run: () => Promise<T>): (() => Promise<T>) => {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (inFlight) return inFlight;
    const p = run().finally(() => {
      inFlight = null;
    });
    inFlight = p;
    return p;
  };
};

const isFresh = <T>(snapshot: Snapshot<T> | null, maxAgeMs: number): snapshot is Snapshot<T> =>
  snapshot !== null && Date.now() - snapshot.fetchedAt <= maxAgeMs;

/**
 * Refresh logic for the background service worker.
 *
 * The dashboard and the writable repo list live in separate caches and are refreshed
 * separately, so saving one never overwrites or clears the other.
 * The writable repo list takes several seconds to page through, so callers do not wait for it.
 * If it fails, the previous list stays.
 */
export const createDashboardRefresher = (deps: RefresherDeps): DashboardRefresher => {
  const { settings, dashboardCache, writableReposCache, github } = deps;

  const refreshDashboard = singleFlight(async (): Promise<RefreshResult> => {
    const { pat } = await settings.get();
    if (!pat) return { ok: false, reason: "no-pat" };
    try {
      const data = await github(pat).fetchDashboard();
      const fetchedAt = await dashboardCache.save(data);
      return { ok: true, fetchedAt };
    } catch (err) {
      return {
        ok: false,
        reason: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  const refreshWritableRepos = singleFlight(async (): Promise<void> => {
    const { pat } = await settings.get();
    if (!pat) return;
    try {
      await writableReposCache.save(await github(pat).fetchWritableRepos());
    } catch (err) {
      console.warn("[bgd] writable repos refresh failed:", err);
    }
  });

  const refresh = (): Promise<RefreshResult> => {
    void refreshWritableRepos();
    return refreshDashboard();
  };

  const refreshIfStale = async (maxAgeMs: number): Promise<RefreshResult> => {
    const { pat } = await settings.get();
    if (!pat) return { ok: false, reason: "no-pat" };

    const [dashboard, writableRepos] = await Promise.all([
      dashboardCache.load(),
      writableReposCache.load(),
    ]);
    if (!isFresh(writableRepos, maxAgeMs)) void refreshWritableRepos();
    if (isFresh(dashboard, maxAgeMs)) {
      return { ok: true, fetchedAt: dashboard.fetchedAt };
    }
    return refreshDashboard();
  };

  return { refresh, refreshIfStale };
};
