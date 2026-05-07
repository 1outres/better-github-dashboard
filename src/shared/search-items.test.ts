import { describe, expect, it } from "vitest";
import type { DashboardData, IssueLike, Repo } from "./github";
import type { ViewEntry } from "./view-stats";
import { buildSearchItems, rankSearchItems, type SearchItem } from "./search-items";

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

describe("rankSearchItems", () => {
  const items: SearchItem[] = [
    { kind: "repo", label: "octocat/hello", sub: "demo repo", url: "u1" },
    { kind: "PullRequest", label: "Add feature X", sub: "octocat/hello #1", url: "u2" },
    { kind: "Issue", label: "Fix bug Y", sub: "other/repo #5", url: "u3" },
  ];

  it("returns first 10 in input order when query is empty", () => {
    const many: SearchItem[] = Array.from({ length: 25 }, (_, i) => ({
      kind: "repo",
      label: `r${i}`,
      sub: "",
      url: `u${i}`,
    }));
    const out = rankSearchItems(many, "");
    expect(out).toHaveLength(10);
    expect(out.map((r) => r.item.url)).toEqual(many.slice(0, 10).map((m) => m.url));
    expect(out.every((r) => r.matches.label.length === 0 && r.matches.sub.length === 0)).toBe(true);
  });

  it("matches subsequence (fuzzy) across label", () => {
    const list: SearchItem[] = [
      { kind: "repo", label: "github-dashboard", sub: "", url: "u1" },
      { kind: "repo", label: "other-thing", sub: "", url: "u2" },
    ];
    const out = rankSearchItems(list, "ghd");
    expect(out.map((r) => r.item.url)).toEqual(["u1"]);
    // "github-dashboard" → g(0), h(3), d(7)
    expect(out[0]?.matches.label).toEqual([0, 3, 7]);
  });

  it("matches AND tokens across label and sub", () => {
    const out = rankSearchItems(items, "feature");
    expect(out).toHaveLength(1);
    expect(out[0]?.item.url).toBe("u2");

    const out2 = rankSearchItems(items, "octocat hello");
    expect(out2.map((r) => r.item.url).sort()).toEqual(["u1", "u2"]);

    const out3 = rankSearchItems(items, "bug other");
    expect(out3).toHaveLength(1);
    expect(out3[0]?.item.url).toBe("u3");
  });

  it("smart-case: lowercase query is case-insensitive", () => {
    const out = rankSearchItems(items, "octocat");
    expect(out).toHaveLength(2);
  });

  it("smart-case: uppercase query is case-sensitive", () => {
    const out = rankSearchItems(items, "OCTOCAT");
    expect(out).toEqual([]);
  });

  it("returns empty when no match", () => {
    expect(rankSearchItems(items, "zzz")).toEqual([]);
  });

  it("caps results at 20 when filtering", () => {
    const many: SearchItem[] = Array.from({ length: 50 }, (_, i) => ({
      kind: "repo",
      label: `match-${i}`,
      sub: "",
      url: `u${i}`,
    }));
    expect(rankSearchItems(many, "match")).toHaveLength(20);
  });

  it("ranks contiguous match higher than scattered subsequence", () => {
    const list: SearchItem[] = [
      // 'auth' は a-u-t-h を散らばらせて部分列一致するが連続ではない
      { kind: "repo", label: "a-u-t-h", sub: "", url: "scattered" },
      // 'auth' が連続部分文字列として現れる
      { kind: "repo", label: "auth-x", sub: "", url: "contiguous" },
    ];
    const out = rankSearchItems(list, "auth");
    expect(out[0]?.item.url).toBe("contiguous");
  });

  it("ranks word-boundary match higher", () => {
    const list: SearchItem[] = [
      { kind: "repo", label: "preface-thing", sub: "", url: "midword" },
      { kind: "repo", label: "front-end", sub: "", url: "wordstart" },
    ];
    const out = rankSearchItems(list, "fe");
    expect(out[0]?.item.url).toBe("wordstart");
  });

  it("breaks score ties by input order (preserving history-based pre-sort)", () => {
    const list: SearchItem[] = [
      { kind: "repo", label: "alpha/repo", sub: "", url: "first" },
      { kind: "repo", label: "alpha/repo", sub: "", url: "second" },
    ];
    const out = rankSearchItems(list, "alpha");
    expect(out.map((r) => r.item.url)).toEqual(["first", "second"]);
  });

  it("returns match positions for label and sub separately", () => {
    const list: SearchItem[] = [
      { kind: "Issue", label: "Fix bug", sub: "owner/repo #5", url: "u1" },
    ];
    const out = rankSearchItems(list, "fix repo");
    expect(out).toHaveLength(1);
    const r = out[0];
    expect(r).toBeDefined();
    expect(r?.matches.label).toEqual([0, 1, 2]);
    expect(r?.matches.sub.length).toBeGreaterThan(0);
    // sub positions は sub 文字列内のローカル index になっている
    const subLen = list[0]!.sub.length;
    expect(r?.matches.sub.every((p) => p < subLen)).toBe(true);
  });
});
