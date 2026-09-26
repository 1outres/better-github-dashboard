import { describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import { createAppContext } from "../../runtime/app-context";
import { createMemoryStorage } from "@/shared/storage";
import type { DashboardData, Repo } from "@/shared/github";
import { createLiveSources } from "./live-sources";

const dashboard: DashboardData = {
  viewer: { login: "me", name: null, avatarUrl: "" },
  pinnedRepos: [],
  recentRepos: [],
  reviewRequests: [],
  myPullRequests: [],
  assignedIssues: [],
  mentions: [],
};

const repo: Repo = {
  nameWithOwner: "o/w",
  description: null,
  primaryLanguage: null,
  stargazerCount: 0,
  updatedAt: "2026-01-01T00:00:00Z",
  isPrivate: false,
  url: "https://github.com/o/w",
};

const setup = () => {
  const app = createAppContext({ storage: createMemoryStorage() });
  let dispose!: () => void;
  const live = createRoot((d) => {
    dispose = d;
    return createLiveSources(app);
  });
  return { app, live, dispose };
};

describe("createLiveSources", () => {
  it("starts empty when nothing is cached", async () => {
    const { live, dispose } = setup();
    await Promise.resolve();
    expect(live.dashboard()).toBeNull();
    expect(live.sources()).toEqual({ dashboard: null, writableRepos: [], viewStats: [] });
    dispose();
  });

  it("follows changes of both caches and of the view history", async () => {
    const { app, live, dispose } = setup();

    const fetchedAt = await app.dashboardCache.save(dashboard);
    await app.writableReposCache.save([repo]);
    await app.viewStats.record({
      kind: "repo",
      key: "repo:o/w",
      url: "https://github.com/o/w",
      nameWithOwner: "o/w",
      number: null,
      title: null,
    });

    await vi.waitFor(() => {
      expect(live.dashboard()).toEqual({ data: dashboard, fetchedAt });
      expect(live.sources().writableRepos).toEqual([repo]);
      expect(live.sources().viewStats.map((e) => e.key)).toEqual(["repo:o/w"]);
    });
    dispose();
  });

  it("stops following changes after dispose", async () => {
    const { app, live, dispose } = setup();
    dispose();
    await app.writableReposCache.save([repo]);
    await Promise.resolve();
    expect(live.sources().writableRepos).toEqual([]);
  });
});
