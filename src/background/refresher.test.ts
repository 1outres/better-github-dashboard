import { afterEach, describe, expect, it, vi } from "vitest";
import { createDashboardRefresher } from "./refresher";
import { createMemoryStorage } from "@/shared/storage";
import { createSettingsStore } from "@/shared/settings";
import { createDashboardCache } from "@/shared/dashboard-cache";
import { createWritableReposCache } from "@/shared/writable-repos-cache";
import type { DashboardData, GitHubClient, Repo } from "@/shared/github";

const mkDashboard = (overrides: Partial<DashboardData> = {}): DashboardData => ({
  viewer: { login: "u", name: null, avatarUrl: "" },
  pinnedRepos: [],
  recentRepos: [],
  reviewRequests: [],
  myPullRequests: [],
  assignedIssues: [],
  mentions: [],
  ...overrides,
});

const mkRepo = (nameWithOwner: string): Repo => ({
  nameWithOwner,
  description: null,
  primaryLanguage: null,
  stargazerCount: 0,
  updatedAt: "2026-01-01T00:00:00Z",
  isPrivate: false,
  url: `https://github.com/${nameWithOwner}`,
});

const mkClient = (overrides: Partial<GitHubClient> = {}): GitHubClient => ({
  fetchViewer: vi.fn(),
  fetchDashboard: vi.fn().mockResolvedValue(mkDashboard()),
  fetchWritableRepos: vi.fn().mockResolvedValue([]),
  ...overrides,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const setup = (opts: { pat?: string; client?: GitHubClient } = {}) => {
  const storage = createMemoryStorage(opts.pat ? { settings: { pat: opts.pat } } : {});
  const settings = createSettingsStore(storage);
  const dashboardCache = createDashboardCache(storage);
  const writableReposCache = createWritableReposCache(storage);
  const client = opts.client ?? mkClient();
  const github = vi.fn(() => client);
  const refresher = createDashboardRefresher({
    settings,
    dashboardCache,
    writableReposCache,
    github,
  });
  return { dashboardCache, writableReposCache, client, github, refresher };
};

const HOUR = 60 * 60 * 1000;

const saveAt = async <T,>(
  cache: { save: (data: T) => Promise<number> },
  data: T,
  at: number,
): Promise<void> => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
  await cache.save(data);
  vi.useRealTimers();
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createDashboardRefresher.refresh", () => {
  it("PAT 未設定なら GitHub に問い合わせず no-pat を返す", async () => {
    const { github, refresher, dashboardCache, writableReposCache } = setup();

    expect(await refresher.refresh()).toEqual({ ok: false, reason: "no-pat" });
    expect(github).not.toHaveBeenCalled();
    expect(await dashboardCache.load()).toBeNull();
    expect(await writableReposCache.load()).toBeNull();
  });

  it("ダッシュボードを取得してキャッシュに保存し、保存した fetchedAt を返す", async () => {
    const dashboard = mkDashboard({ recentRepos: [mkRepo("o/r")] });
    const { github, refresher, dashboardCache } = setup({
      pat: "ghp_test",
      client: mkClient({ fetchDashboard: vi.fn().mockResolvedValue(dashboard) }),
    });

    const result = await refresher.refresh();

    expect(github).toHaveBeenCalledWith("ghp_test");
    const loaded = await dashboardCache.load();
    expect(loaded?.data).toEqual(dashboard);
    expect(result).toEqual({ ok: true, fetchedAt: loaded?.fetchedAt });
  });

  it("ダッシュボードの取得が throw したら ok:false / reason:error を返す", async () => {
    const { refresher, dashboardCache } = setup({
      pat: "ghp_test",
      client: mkClient({ fetchDashboard: vi.fn().mockRejectedValue(new Error("Bad credentials")) }),
    });

    expect(await refresher.refresh()).toEqual({
      ok: false,
      reason: "error",
      message: "Bad credentials",
    });
    expect(await dashboardCache.load()).toBeNull();
  });

  it("並行 refresh はダッシュボードの取得を 1 回にまとめる", async () => {
    const gate = deferred<DashboardData>();
    const fetchDashboard = vi.fn(() => gate.promise);
    const { refresher } = setup({ pat: "ghp_test", client: mkClient({ fetchDashboard }) });

    const p1 = refresher.refresh();
    const p2 = refresher.refresh();
    await vi.waitFor(() => expect(fetchDashboard).toHaveBeenCalled());
    gate.resolve(mkDashboard());
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(fetchDashboard).toHaveBeenCalledOnce();
    expect(r1).toEqual(r2);
  });

  it("完了後の新たな refresh は別の取得を発行する", async () => {
    const fetchDashboard = vi.fn().mockResolvedValue(mkDashboard());
    const { refresher } = setup({ pat: "ghp_test", client: mkClient({ fetchDashboard }) });

    await refresher.refresh();
    await refresher.refresh();

    expect(fetchDashboard).toHaveBeenCalledTimes(2);
  });

  it("書き込み権限のあるリポジトリは専用のキャッシュに保存する", async () => {
    const { refresher, writableReposCache } = setup({
      pat: "ghp_test",
      client: mkClient({ fetchWritableRepos: vi.fn().mockResolvedValue([mkRepo("o/w")]) }),
    });

    await refresher.refresh();

    await vi.waitFor(async () =>
      expect((await writableReposCache.load())?.data).toEqual([mkRepo("o/w")]),
    );
  });

  it("ダッシュボードの保存は、取得中の間も前回のリポジトリ一覧を消さない", async () => {
    const gate = deferred<Repo[]>();
    const { refresher, writableReposCache } = setup({
      pat: "ghp_test",
      client: mkClient({ fetchWritableRepos: vi.fn(() => gate.promise) }),
    });
    await writableReposCache.save([mkRepo("o/old")]);

    const result = await refresher.refresh();

    expect(result.ok).toBe(true);
    expect((await writableReposCache.load())?.data).toEqual([mkRepo("o/old")]);
    gate.resolve([mkRepo("o/new")]);
    await vi.waitFor(async () =>
      expect((await writableReposCache.load())?.data).toEqual([mkRepo("o/new")]),
    );
  });

  it("リポジトリ一覧の取得に失敗しても ok:true のままで、前回の一覧を残す", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { refresher, writableReposCache } = setup({
      pat: "ghp_test",
      client: mkClient({ fetchWritableRepos: vi.fn().mockRejectedValue(new Error("network")) }),
    });
    await writableReposCache.save([mkRepo("o/old")]);

    const result = await refresher.refresh();

    expect(result.ok).toBe(true);
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect((await writableReposCache.load())?.data).toEqual([mkRepo("o/old")]);
  });

  it("遅れて終わったリポジトリ一覧の取得が、新しいダッシュボードを古い内容で上書きしない", async () => {
    const gate = deferred<Repo[]>();
    const fetchDashboard = vi
      .fn()
      .mockResolvedValueOnce(mkDashboard())
      .mockResolvedValueOnce(mkDashboard({ recentRepos: [mkRepo("o/newer")] }));
    const { refresher, dashboardCache, writableReposCache } = setup({
      pat: "ghp_test",
      client: mkClient({ fetchDashboard, fetchWritableRepos: vi.fn(() => gate.promise) }),
    });

    await refresher.refresh();
    await refresher.refresh();
    gate.resolve([mkRepo("o/w")]);
    await vi.waitFor(async () =>
      expect((await writableReposCache.load())?.data).toEqual([mkRepo("o/w")]),
    );

    expect((await dashboardCache.load())?.data.recentRepos).toEqual([mkRepo("o/newer")]);
  });

  it("リポジトリ一覧の取得中に refresh されても、取得は 1 本にまとめる", async () => {
    const gate = deferred<Repo[]>();
    const fetchWritableRepos = vi.fn(() => gate.promise);
    const { refresher } = setup({ pat: "ghp_test", client: mkClient({ fetchWritableRepos }) });

    await refresher.refresh();
    await refresher.refresh();

    expect(fetchWritableRepos).toHaveBeenCalledOnce();
    gate.resolve([]);
  });
});

describe("createDashboardRefresher.refreshIfStale", () => {
  it("どちらのキャッシュも新しければ取得せず、ダッシュボードの fetchedAt を返す", async () => {
    const { client, refresher, dashboardCache, writableReposCache } = setup({ pat: "ghp_test" });
    await dashboardCache.save(mkDashboard());
    await writableReposCache.save([]);

    const result = await refresher.refreshIfStale(60_000);

    expect(client.fetchDashboard).not.toHaveBeenCalled();
    expect(client.fetchWritableRepos).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, fetchedAt: (await dashboardCache.load())?.fetchedAt });
  });

  it("ダッシュボードだけ古ければダッシュボードだけ取得する", async () => {
    const { client, refresher, dashboardCache, writableReposCache } = setup({ pat: "ghp_test" });
    await saveAt(dashboardCache, mkDashboard(), Date.now() - HOUR);
    await writableReposCache.save([]);

    const result = await refresher.refreshIfStale(60_000);

    expect(result.ok).toBe(true);
    expect(client.fetchDashboard).toHaveBeenCalledOnce();
    expect(client.fetchWritableRepos).not.toHaveBeenCalled();
  });

  it("リポジトリ一覧だけ古ければリポジトリ一覧だけ取得する", async () => {
    const { client, refresher, dashboardCache, writableReposCache } = setup({ pat: "ghp_test" });
    await dashboardCache.save(mkDashboard());
    await saveAt(writableReposCache, [], Date.now() - HOUR);

    const result = await refresher.refreshIfStale(60_000);

    expect(result).toEqual({ ok: true, fetchedAt: (await dashboardCache.load())?.fetchedAt });
    expect(client.fetchDashboard).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(client.fetchWritableRepos).toHaveBeenCalledOnce());
  });

  it("キャッシュが無ければ両方取得する", async () => {
    const { client, refresher } = setup({ pat: "ghp_test" });

    const result = await refresher.refreshIfStale(60_000);

    expect(result.ok).toBe(true);
    expect(client.fetchDashboard).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(client.fetchWritableRepos).toHaveBeenCalledOnce());
  });

  it("PAT 未設定なら取得せず no-pat を返す（キャッシュ判定より優先）", async () => {
    const { client, refresher, dashboardCache } = setup();
    await dashboardCache.save(mkDashboard());

    const result = await refresher.refreshIfStale(60_000);

    expect(result).toEqual({ ok: false, reason: "no-pat" });
    expect(client.fetchDashboard).not.toHaveBeenCalled();
    expect(client.fetchWritableRepos).not.toHaveBeenCalled();
  });
});
