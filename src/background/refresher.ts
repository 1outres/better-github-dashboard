import type { SettingsStore } from "@/shared/settings";
import type { DashboardCache } from "@/shared/dashboard-cache";
import type { GitHubClientFactory } from "@/shared/github";
import type { RefreshResult } from "@/shared/messages";

export type DashboardRefresher = {
  refresh: () => Promise<RefreshResult>;
  refreshIfStale: (maxAgeMs: number) => Promise<RefreshResult>;
};

export type RefresherDeps = {
  settings: SettingsStore;
  cache: DashboardCache;
  github: GitHubClientFactory;
};

/**
 * background service worker のダッシュボード更新ロジック。
 *
 * - 同時に refresh が呼ばれても fetch は 1 回に coalesce する。
 * - PAT 未設定なら API を一切叩かない。
 * - 本流の fetchDashboard が成功したらすぐ cache に保存して ok を返し、
 *   writable repos は非同期で追加保存する（失敗しても ok は維持）。
 *
 * stale 判定は content / dashboard / overlay などの呼び手ごとに値が異なるため
 * 引数 maxAgeMs で外から渡す方針。判定そのものはここに集約する。
 */
export const createDashboardRefresher = (deps: RefresherDeps): DashboardRefresher => {
  const { settings, cache, github } = deps;
  let inFlight: Promise<RefreshResult> | null = null;

  const run = async (): Promise<RefreshResult> => {
    const s = await settings.get();
    if (!s.pat) return { ok: false, reason: "no-pat" };

    try {
      const client = github(s.pat);
      const fresh = await client.fetchDashboard();
      await cache.save(fresh);
      const fetchedAt = Date.now();

      // 検索候補拡充のための writable repos は非同期に追加。失敗しても本流に影響させない。
      void client
        .fetchWritableRepos()
        .then((writable) => cache.save({ ...fresh, writableRepos: writable }))
        .catch(() => {});

      return { ok: true, fetchedAt };
    } catch (err) {
      return {
        ok: false,
        reason: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  };

  const refresh = (): Promise<RefreshResult> => {
    if (inFlight) return inFlight;
    const p = run().finally(() => {
      inFlight = null;
    });
    inFlight = p;
    return p;
  };

  const refreshIfStale = async (maxAgeMs: number): Promise<RefreshResult> => {
    const s = await settings.get();
    if (!s.pat) return { ok: false, reason: "no-pat" };

    const cached = await cache.load();
    if (cached && Date.now() - cached.fetchedAt <= maxAgeMs) {
      return { ok: true, fetchedAt: cached.fetchedAt };
    }
    return refresh();
  };

  return { refresh, refreshIfStale };
};
