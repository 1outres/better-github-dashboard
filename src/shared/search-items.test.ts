import { describe, expect, it } from "vitest";
import type { DashboardData, IssueLike, Repo } from "./github";
import type { ViewEntry } from "./view-stats";
import { buildSearchItems, filterSearchItems } from "./search-items";

const mkRepo = (overrides: Partial<Repo> = {}): Repo => ({
  nameWithOwner: "o/r",
  description: null,
  primaryLanguage: null,
  stargazerCount: 0,
  updatedAt: "2026-01-01T00:00:00Z",
  isPrivate: false,
  url: "https://github.com/o/r",
  ...overrides,
});

const mkIssue = (overrides: Partial<IssueLike> = {}): IssueLike => ({
  type: "Issue",
  number: 1,
  title: "Issue 1",
  url: "https://github.com/o/r/issues/1",
  repository: { nameWithOwner: "o/r" },
  updatedAt: "2026-01-01T00:00:00Z",
  author: null,
  ...overrides,
});

const mkData = (overrides: Partial<DashboardData> = {}): DashboardData => ({
  viewer: { login: "me", name: null, avatarUrl: "" },
  pinnedRepos: [],
  recentRepos: [],
  writableRepos: [],
  reviewRequests: [],
  myPullRequests: [],
  assignedIssues: [],
  mentions: [],
  ...overrides,
});

const mkViewEntry = (overrides: Partial<ViewEntry> = {}): ViewEntry => ({
  kind: "repo",
  key: "repo:o/r",
  url: "https://github.com/o/r",
  nameWithOwner: "o/r",
  number: null,
  title: null,
  count: 1,
  lastViewedAt: Date.now(),
  ...overrides,
});

describe("buildSearchItems", () => {
  it("returns empty array when no data and no view stats", () => {
    expect(buildSearchItems(null, [])).toEqual([]);
  });

  it("dedups across pinned, recent, and writable repos", () => {
    const a = mkRepo({ nameWithOwner: "o/a", url: "https://github.com/o/a" });
    const b = mkRepo({ nameWithOwner: "o/b", url: "https://github.com/o/b" });
    const items = buildSearchItems(
      mkData({ pinnedRepos: [a], recentRepos: [a, b], writableRepos: [b] }),
      [],
    );
    expect(items.map((i) => i.url)).toEqual([
      "https://github.com/o/a",
      "https://github.com/o/b",
    ]);
  });

  it("includes issue/PR rows from all four lists", () => {
    const items = buildSearchItems(
      mkData({
        reviewRequests: [
          mkIssue({ url: "https://github.com/o/r/pull/1", type: "PullRequest", title: "PR1" }),
        ],
        assignedIssues: [mkIssue({ url: "https://github.com/o/r/issues/2", number: 2 })],
      }),
      [],
    );
    expect(items.find((i) => i.url.endsWith("/pull/1"))?.kind).toBe("PullRequest");
    expect(items.find((i) => i.url.endsWith("/issues/2"))?.kind).toBe("Issue");
  });

  it("appends view-stats entries that aren't already present", () => {
    const known = mkRepo({ nameWithOwner: "o/known", url: "https://github.com/o/known" });
    const stats = [
      mkViewEntry({
        key: "repo:o/known",
        nameWithOwner: "o/known",
        url: "https://github.com/o/known",
        count: 5,
      }),
      mkViewEntry({
        key: "repo:o/extra",
        nameWithOwner: "o/extra",
        url: "https://github.com/o/extra",
      }),
    ];
    const items = buildSearchItems(mkData({ pinnedRepos: [known] }), stats);
    const urls = items.map((i) => i.url);
    expect(urls).toContain("https://github.com/o/known");
    expect(urls).toContain("https://github.com/o/extra");
    expect(urls.filter((u) => u === "https://github.com/o/known")).toHaveLength(1);
  });

  it("works without dashboard data using only view stats", () => {
    const stats = [
      mkViewEntry({
        kind: "Issue",
        key: "Issue:o/r#3",
        url: "https://github.com/o/r/issues/3",
        nameWithOwner: "o/r",
        number: 3,
        title: "From history",
      }),
    ];
    const items = buildSearchItems(null, stats);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "Issue",
      label: "From history",
      url: "https://github.com/o/r/issues/3",
    });
  });

  it("falls back to nameWithOwner#number when issue title is missing", () => {
    const stats = [
      mkViewEntry({
        kind: "PullRequest",
        key: "PullRequest:o/r#9",
        url: "https://github.com/o/r/pull/9",
        nameWithOwner: "o/r",
        number: 9,
        title: null,
      }),
    ];
    const items = buildSearchItems(null, stats);
    expect(items[0]?.label).toBe("o/r #9");
  });
});

describe("filterSearchItems", () => {
  const items = [
    { kind: "repo" as const, label: "octocat/hello", sub: "demo repo", url: "u1" },
    { kind: "PullRequest" as const, label: "Add feature X", sub: "octocat/hello #1", url: "u2" },
    { kind: "Issue" as const, label: "Fix bug Y", sub: "other/repo #5", url: "u3" },
  ];

  it("returns first 10 when query is empty", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      kind: "repo" as const,
      label: `r${i}`,
      sub: "",
      url: `u${i}`,
    }));
    expect(filterSearchItems(many, "")).toHaveLength(10);
  });

  it("matches across label and sub (AND across whitespace tokens)", () => {
    expect(filterSearchItems(items, "feature")).toHaveLength(1);
    expect(filterSearchItems(items, "octocat hello")).toHaveLength(2);
    expect(filterSearchItems(items, "bug other")).toHaveLength(1);
  });

  it("is case-insensitive", () => {
    expect(filterSearchItems(items, "OCTOCAT")).toHaveLength(2);
  });

  it("returns empty when no match", () => {
    expect(filterSearchItems(items, "zzz")).toEqual([]);
  });

  it("caps results at 20 when filtering", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      kind: "repo" as const,
      label: `match-${i}`,
      sub: "",
      url: `u${i}`,
    }));
    expect(filterSearchItems(many, "match")).toHaveLength(20);
  });
});
