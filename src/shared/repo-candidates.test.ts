import { describe, expect, it } from "vitest";
import type { DashboardData, IssueLike, Repo } from "./github";
import type { ViewEntry } from "./view-stats";
import { collectRepoCandidates, rankRepoCandidates } from "./repo-candidates";

const mkRepo = (nameWithOwner: string): Repo => ({
  nameWithOwner,
  description: null,
  primaryLanguage: null,
  stargazerCount: 0,
  updatedAt: "2026-01-01T00:00:00Z",
  isPrivate: false,
  url: `https://github.com/${nameWithOwner}`,
});

const mkIssue = (nameWithOwner: string, number = 1): IssueLike => ({
  type: "PullRequest",
  number,
  title: "t",
  url: `https://github.com/${nameWithOwner}/pull/${number}`,
  repository: { nameWithOwner },
  updatedAt: "2026-01-01T00:00:00Z",
  author: null,
});

const mkData = (overrides: Partial<DashboardData> = {}): DashboardData => ({
  viewer: { login: "me", name: null, avatarUrl: "" },
  pinnedRepos: [],
  recentRepos: [],
  reviewRequests: [],
  myPullRequests: [],
  assignedIssues: [],
  mentions: [],
  ...overrides,
});

const NOW = 1_000_000;

const mkView = (overrides: Partial<ViewEntry> & Pick<ViewEntry, "nameWithOwner">): ViewEntry => ({
  kind: "repo",
  key: `repo:${overrides.nameWithOwner}`,
  url: `https://github.com/${overrides.nameWithOwner}`,
  number: null,
  title: null,
  count: 1,
  lastViewedAt: NOW,
  ...overrides,
});

const names = (candidates: { nameWithOwner: string }[]) => candidates.map((c) => c.nameWithOwner);

describe("collectRepoCandidates", () => {
  it("collects pinned, recent, writable, issue-list, then view-history repos in that order", () => {
    const candidates = collectRepoCandidates({
      dashboard: mkData({
        pinnedRepos: [mkRepo("o/pinned")],
        recentRepos: [mkRepo("o/recent")],
        myPullRequests: [mkIssue("oss/contrib")],
      }),
      writableRepos: [mkRepo("o/writable")],
      viewStats: [mkView({ nameWithOwner: "oss/visited" })],
    });
    expect(names(candidates)).toEqual([
      "o/pinned",
      "o/recent",
      "o/writable",
      "oss/contrib",
      "oss/visited",
    ]);
  });

  it("keeps the first occurrence of a repo, comparing names case-insensitively", () => {
    const candidates = collectRepoCandidates({
      dashboard: mkData({ pinnedRepos: [mkRepo("O/Repo")], recentRepos: [mkRepo("o/repo")] }),
      writableRepos: [mkRepo("o/repo")],
      viewStats: [mkView({ nameWithOwner: "o/REPO" })],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.details).toEqual(mkRepo("O/Repo"));
  });

  it("has no details for repos known only from issue lists or view history", () => {
    const candidates = collectRepoCandidates({
      dashboard: mkData({ assignedIssues: [mkIssue("oss/assigned")] }),
      writableRepos: [],
      viewStats: [
        mkView({
          kind: "Issue",
          key: "Issue:oss/viewed#3",
          url: "https://github.com/oss/viewed/issues/3",
          nameWithOwner: "oss/viewed",
          number: 3,
        }),
      ],
    });
    expect(candidates).toEqual([
      { nameWithOwner: "oss/assigned", url: "https://github.com/oss/assigned", details: null },
      { nameWithOwner: "oss/viewed", url: "https://github.com/oss/viewed", details: null },
    ]);
  });

  it("works without dashboard data", () => {
    const candidates = collectRepoCandidates({
      dashboard: null,
      writableRepos: [mkRepo("o/w")],
      viewStats: [],
    });
    expect(names(candidates)).toEqual(["o/w"]);
  });
});

describe("rankRepoCandidates", () => {
  it("orders by views of the repo and its issues and PRs, keeping collected order on ties", () => {
    const viewStats = [
      mkView({ nameWithOwner: "o/b", count: 2 }),
      mkView({
        kind: "PullRequest",
        key: "PullRequest:o/c#1",
        url: "https://github.com/o/c/pull/1",
        nameWithOwner: "o/c",
        number: 1,
        count: 3,
      }),
    ];
    const candidates = collectRepoCandidates({
      dashboard: mkData({ recentRepos: ["o/a", "o/b", "o/c", "o/d"].map(mkRepo) }),
      writableRepos: [],
      viewStats: [],
    });
    expect(names(rankRepoCandidates(candidates, viewStats, NOW))).toEqual([
      "o/c",
      "o/b",
      "o/a",
      "o/d",
    ]);
  });
});
