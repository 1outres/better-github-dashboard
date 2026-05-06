import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "./storage";
import {
  createViewStatsStore,
  parseGithubViewUrl,
  scoreEntry,
  type ViewEntry,
} from "./view-stats";

describe("parseGithubViewUrl", () => {
  it("returns null for the dashboard root", () => {
    expect(parseGithubViewUrl(new URL("https://github.com/"))).toBeNull();
  });

  it("returns null for reserved top-level paths", () => {
    expect(parseGithubViewUrl(new URL("https://github.com/settings/profile"))).toBeNull();
    expect(parseGithubViewUrl(new URL("https://github.com/notifications"))).toBeNull();
    expect(parseGithubViewUrl(new URL("https://github.com/marketplace"))).toBeNull();
  });

  it("returns null for non-github hosts", () => {
    expect(parseGithubViewUrl(new URL("https://gist.github.com/foo/bar"))).toBeNull();
  });

  it("recognizes a repo root", () => {
    const r = parseGithubViewUrl(new URL("https://github.com/octocat/hello"));
    expect(r).toMatchObject({
      kind: "repo",
      key: "repo:octocat/hello",
      url: "https://github.com/octocat/hello",
      nameWithOwner: "octocat/hello",
    });
  });

  it("treats deep repo subpaths as a repo view", () => {
    const r = parseGithubViewUrl(new URL("https://github.com/octocat/hello/tree/main/src"));
    expect(r?.kind).toBe("repo");
    expect(r?.url).toBe("https://github.com/octocat/hello");
  });

  it("recognizes an issue", () => {
    const r = parseGithubViewUrl(new URL("https://github.com/octocat/hello/issues/42"));
    expect(r).toMatchObject({
      kind: "Issue",
      key: "Issue:octocat/hello#42",
      number: 42,
      nameWithOwner: "octocat/hello",
      url: "https://github.com/octocat/hello/issues/42",
    });
  });

  it("recognizes a pull request", () => {
    const r = parseGithubViewUrl(new URL("https://github.com/octocat/hello/pull/7"));
    expect(r).toMatchObject({
      kind: "PullRequest",
      key: "PullRequest:octocat/hello#7",
      number: 7,
    });
  });
});

describe("scoreEntry", () => {
  const base: ViewEntry = {
    kind: "repo",
    key: "repo:o/r",
    url: "https://github.com/o/r",
    nameWithOwner: "o/r",
    title: null,
    number: null,
    count: 4,
    lastViewedAt: 0,
  };

  it("equals count when age is zero", () => {
    expect(scoreEntry({ ...base, lastViewedAt: 1000 }, 1000)).toBe(4);
  });

  it("halves every half-life", () => {
    const halfLife = 14 * 24 * 60 * 60 * 1000;
    expect(scoreEntry({ ...base, lastViewedAt: 0 }, halfLife)).toBeCloseTo(2, 5);
    expect(scoreEntry({ ...base, lastViewedAt: 0 }, 2 * halfLife)).toBeCloseTo(1, 5);
  });

  it("never goes negative for past timestamps that exceed now (clock skew)", () => {
    expect(scoreEntry({ ...base, lastViewedAt: 9999 }, 0)).toBe(4);
  });
});

describe("ViewStatsStore", () => {
  it("returns an empty list when nothing is stored", async () => {
    const store = createViewStatsStore(createMemoryStorage());
    expect(await store.load()).toEqual([]);
  });

  it("records a new view with count 1", async () => {
    const storage = createMemoryStorage();
    const store = createViewStatsStore(storage);
    await store.record({
      kind: "repo",
      key: "repo:o/r",
      url: "https://github.com/o/r",
      nameWithOwner: "o/r",
      number: null,
      title: null,
    });
    const entries = await store.load();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ key: "repo:o/r", count: 1 });
    expect(entries[0]?.lastViewedAt).toBeGreaterThan(0);
  });

  it("increments count and updates lastViewedAt on subsequent records", async () => {
    const store = createViewStatsStore(createMemoryStorage());
    await store.record({
      kind: "Issue",
      key: "Issue:o/r#1",
      url: "https://github.com/o/r/issues/1",
      nameWithOwner: "o/r",
      number: 1,
      title: "Bug",
    });
    await store.record({
      kind: "Issue",
      key: "Issue:o/r#1",
      url: "https://github.com/o/r/issues/1",
      nameWithOwner: "o/r",
      number: 1,
      title: "Bug renamed",
    });
    const entries = await store.load();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.count).toBe(2);
    expect(entries[0]?.title).toBe("Bug renamed");
  });

  it("ignores legacy / mismatched schema versions", async () => {
    const storage = createMemoryStorage({
      "view-stats": { v: 999, entries: { x: { count: 5 } } },
    });
    const store = createViewStatsStore(storage);
    expect(await store.load()).toEqual([]);
  });
});
