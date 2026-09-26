import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "./storage";
import { createDashboardCache } from "./dashboard-cache";
import { createWritableReposCache } from "./writable-repos-cache";
import type { DashboardData, Repo } from "./github";

const sample: DashboardData = {
  viewer: { login: "u", name: null, avatarUrl: "x" },
  pinnedRepos: [],
  recentRepos: [],
  reviewRequests: [],
  myPullRequests: [],
  assignedIssues: [],
  mentions: [],
};

const repo: Repo = {
  nameWithOwner: "o/r",
  description: null,
  primaryLanguage: null,
  stargazerCount: 0,
  updatedAt: "2026-01-01T00:00:00Z",
  isPrivate: false,
  url: "https://github.com/o/r",
};

describe("DashboardCache", () => {
  it("round-trips dashboard data", async () => {
    const cache = createDashboardCache(createMemoryStorage());
    await cache.save(sample);
    expect((await cache.load())?.data.viewer.login).toBe("u");
  });

  it("drops v1 entries that still embed writableRepos", async () => {
    const storage = createMemoryStorage({
      "dashboard-cache": { v: 1, fetchedAt: 1, data: { ...sample, writableRepos: [repo] } },
    });
    expect(await createDashboardCache(storage).load()).toBeNull();
  });
});

describe("WritableReposCache", () => {
  it("is stored apart from the dashboard cache", async () => {
    const storage = createMemoryStorage();
    const dashboard = createDashboardCache(storage);
    const writable = createWritableReposCache(storage);

    await writable.save([repo]);
    await dashboard.save(sample);

    expect((await writable.load())?.data).toEqual([repo]);
    expect((await dashboard.load())?.data).toEqual(sample);
  });
});
