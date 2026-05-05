import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "./storage";
import { createDashboardCache } from "./dashboard-cache";
import type { DashboardData } from "./github";

const sample: DashboardData = {
  viewer: { login: "u", name: null, avatarUrl: "x" },
  pinnedRepos: [],
  recentRepos: [],
  writableRepos: [],
  reviewRequests: [],
  myPullRequests: [],
  assignedIssues: [],
  mentions: [],
};

describe("DashboardCache", () => {
  it("returns null when nothing is cached", async () => {
    const cache = createDashboardCache(createMemoryStorage());
    expect(await cache.load()).toBeNull();
  });

  it("round-trips data through save/load", async () => {
    const cache = createDashboardCache(createMemoryStorage());
    await cache.save(sample);
    const loaded = await cache.load();
    expect(loaded?.data.viewer.login).toBe("u");
    expect(loaded?.fetchedAt).toBeGreaterThan(0);
  });

  it("ignores entries with mismatched version", async () => {
    const storage = createMemoryStorage({
      "dashboard-cache": { v: 999, fetchedAt: 0, data: sample },
    });
    const cache = createDashboardCache(storage);
    expect(await cache.load()).toBeNull();
  });

  it("clear removes the entry", async () => {
    const cache = createDashboardCache(createMemoryStorage());
    await cache.save(sample);
    await cache.clear();
    expect(await cache.load()).toBeNull();
  });

  it("backfills writableRepos when an older cache lacks the field", async () => {
    const legacy = {
      viewer: { login: "u", name: null, avatarUrl: "x" },
      pinnedRepos: [],
      recentRepos: [],
      reviewRequests: [],
      myPullRequests: [],
      assignedIssues: [],
      mentions: [],
    };
    const storage = createMemoryStorage({
      "dashboard-cache": { v: 1, fetchedAt: 1, data: legacy },
    });
    const cache = createDashboardCache(storage);
    const loaded = await cache.load();
    expect(loaded?.data.writableRepos).toEqual([]);
  });
});
