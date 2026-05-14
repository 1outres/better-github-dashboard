import { describe, expect, it, vi } from "vitest";
import { createDashboardRefresher } from "./refresher";
import { createMemoryStorage } from "@/shared/storage";
import { createSettingsStore } from "@/shared/settings";
import { createDashboardCache } from "@/shared/dashboard-cache";
import type { DashboardData, GitHubClient, Repo } from "@/shared/github";

const mkDashboard = (overrides: Partial<DashboardData> = {}): DashboardData => ({
  viewer: { login: "u", name: null, avatarUrl: "" },
  pinnedRepos: [],
  recentRepos: [],
  writableRepos: [],
  reviewRequests: [],
  myPullRequests: [],
  assignedIssues: [],
  mentions: [],
  ...overrides,
});

const mkClient = (overrides: Partial<GitHubClient> = {}): GitHubClient => ({
  fetchViewer: vi.fn(),
  fetchDashboard: vi.fn().mockResolvedValue(mkDashboard()),
  fetchWritableRepos: vi.fn().mockResolvedValue([]),
  ...overrides,
});

const setupStores = (initialSettings?: Record<string, unknown>) => {
  const storage = createMemoryStorage(initialSettings ? { settings: initialSettings } : {});
  const settings = createSettingsStore(storage);
  const cache = createDashboardCache(storage);
  return { storage, settings, cache };
};

describe("createDashboardRefresher", () => {
  it("PAT 未設定なら GitHub に問い合わせず no-pat を返す", async () => {
    const { settings, cache } = setupStores();
    const factory = vi.fn(() => mkClient());
    const refresher = createDashboardRefresher({ settings, cache, github: factory });

    const result = await refresher.refresh();
    expect(result).toEqual({ ok: false, reason: "no-pat" });
    expect(factory).not.toHaveBeenCalled();
    expect(await cache.load()).toBeNull();
  });

  it("PAT 設定済みなら fetchDashboard を呼びキャッシュに保存して fetchedAt を返す", async () => {
    const { settings, cache } = setupStores({ pat: "ghp_test" });
    const dashboard = mkDashboard({ recentRepos: [{ nameWithOwner: "o/r" } as Repo] });
    const client = mkClient({ fetchDashboard: vi.fn().mockResolvedValue(dashboard) });
    const factory = vi.fn(() => client);
    const refresher = createDashboardRefresher({ settings, cache, github: factory });

    const result = await refresher.refresh();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fetchedAt).toBeGreaterThan(0);
    expect(factory).toHaveBeenCalledWith("ghp_test");

    const loaded = await cache.load();
    expect(loaded?.data.recentRepos[0]?.nameWithOwner).toBe("o/r");
  });

  it("GitHub fetch が throw したら ok:false / reason:error を返す", async () => {
    const { settings, cache } = setupStores({ pat: "ghp_test" });
    const client = mkClient({
      fetchDashboard: vi.fn().mockRejectedValue(new Error("Bad credentials")),
    });
    const refresher = createDashboardRefresher({ settings, cache, github: () => client });

    const result = await refresher.refresh();
    expect(result).toEqual({ ok: false, reason: "error", message: "Bad credentials" });
    expect(await cache.load()).toBeNull();
  });

  it("並行 refresh は in-flight に coalesce される", async () => {
    const { settings, cache } = setupStores({ pat: "ghp_test" });
    let resolveFetch: ((d: DashboardData) => void) | undefined;
    const fetchDashboard = vi.fn(
      () =>
        new Promise<DashboardData>((r) => {
          resolveFetch = r;
        }),
    );
    const refresher = createDashboardRefresher({
      settings,
      cache,
      github: () => mkClient({ fetchDashboard }),
    });

    const p1 = refresher.refresh();
    const p2 = refresher.refresh();
    // settings.get() の microtask を解消してから fetchDashboard 到達を確認
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchDashboard).toHaveBeenCalledOnce();
    resolveFetch!(mkDashboard());
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
  });

  it("完了後の新たな refresh は別の fetch を発行する", async () => {
    const { settings, cache } = setupStores({ pat: "ghp_test" });
    const fetchDashboard = vi.fn().mockResolvedValue(mkDashboard());
    const refresher = createDashboardRefresher({
      settings,
      cache,
      github: () => mkClient({ fetchDashboard }),
    });

    await refresher.refresh();
    await refresher.refresh();
    expect(fetchDashboard).toHaveBeenCalledTimes(2);
  });

  it("writable repos は非同期に追加保存される", async () => {
    const { settings, cache } = setupStores({ pat: "ghp_test" });
    const writableRepos: Repo[] = [
      { nameWithOwner: "o/w" } as Repo,
    ];
    const client = mkClient({
      fetchDashboard: vi.fn().mockResolvedValue(mkDashboard()),
      fetchWritableRepos: vi.fn().mockResolvedValue(writableRepos),
    });
    const refresher = createDashboardRefresher({ settings, cache, github: () => client });

    const result = await refresher.refresh();
    expect(result.ok).toBe(true);
    // 後続の writable repos 保存を待つ
    await new Promise((r) => setTimeout(r, 0));
    const loaded = await cache.load();
    expect(loaded?.data.writableRepos.map((r) => r.nameWithOwner)).toEqual(["o/w"]);
  });

  it("writable repos の取得失敗は本流の ok:true を覆さない", async () => {
    const { settings, cache } = setupStores({ pat: "ghp_test" });
    const client = mkClient({
      fetchDashboard: vi.fn().mockResolvedValue(mkDashboard()),
      fetchWritableRepos: vi.fn().mockRejectedValue(new Error("network")),
    });
    const refresher = createDashboardRefresher({ settings, cache, github: () => client });

    const result = await refresher.refresh();
    expect(result.ok).toBe(true);
    // 失敗してもキャッシュ本体は保存されている
    const loaded = await cache.load();
    expect(loaded).not.toBeNull();
  });
});

describe("createDashboardRefresher.refreshIfStale", () => {
  it("キャッシュが maxAgeMs 内に収まっていれば fetch をスキップし既存 fetchedAt を返す", async () => {
    const { settings, cache } = setupStores({ pat: "ghp_test" });
    await cache.save(mkDashboard());
    const fetchDashboard = vi.fn().mockResolvedValue(mkDashboard());
    const refresher = createDashboardRefresher({
      settings,
      cache,
      github: () => mkClient({ fetchDashboard }),
    });

    const result = await refresher.refreshIfStale(60_000);
    expect(fetchDashboard).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      const loaded = await cache.load();
      expect(result.fetchedAt).toBe(loaded?.fetchedAt);
    }
  });

  it("キャッシュが古ければ fetch を発行する", async () => {
    const { settings, storage, cache } = setupStores({ pat: "ghp_test" });
    await storage.set("dashboard-cache", {
      v: 1,
      fetchedAt: Date.now() - 60 * 60 * 1000,
      data: mkDashboard(),
    });
    const fetchDashboard = vi.fn().mockResolvedValue(mkDashboard());
    const refresher = createDashboardRefresher({
      settings,
      cache,
      github: () => mkClient({ fetchDashboard }),
    });

    const result = await refresher.refreshIfStale(60_000);
    expect(fetchDashboard).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
  });

  it("キャッシュが無ければ fetch を発行する", async () => {
    const { settings, cache } = setupStores({ pat: "ghp_test" });
    const fetchDashboard = vi.fn().mockResolvedValue(mkDashboard());
    const refresher = createDashboardRefresher({
      settings,
      cache,
      github: () => mkClient({ fetchDashboard }),
    });

    const result = await refresher.refreshIfStale(60_000);
    expect(fetchDashboard).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
  });

  it("PAT 未設定なら fetch せず no-pat を返す（キャッシュ判定より優先）", async () => {
    const { settings, cache } = setupStores();
    await cache.save(mkDashboard()); // fresh cache はあるが PAT が無い
    const fetchDashboard = vi.fn();
    const refresher = createDashboardRefresher({
      settings,
      cache,
      github: () => mkClient({ fetchDashboard }),
    });

    const result = await refresher.refreshIfStale(60_000);
    expect(fetchDashboard).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, reason: "no-pat" });
  });
});
