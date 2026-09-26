import { describe, expect, it, vi } from "vitest";
import { createMemoryStorage } from "./storage";
import {
  createViewStatsStore,
  extractViewTitle,
  parseGithubViewUrl,
  repoKey,
  repoScores,
  scoreEntry,
  type ViewEntry,
  type ViewSeed,
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

  it("returns null for org, user, and other site pages that look like owner/repo", () => {
    for (const path of [
      "orgs/mNi-Cloud/repositories",
      "users/octocat/projects/1",
      "enterprises/acme/settings",
      "copilot/c/123",
      "sessions/two-factor",
      "advisories/GHSA-xxxx-yyyy",
    ]) {
      expect(parseGithubViewUrl(new URL(`https://github.com/${path}`))).toBeNull();
    }
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

describe("repoScores", () => {
  const now = 1_000_000;
  const entry = (overrides: Partial<ViewEntry>): ViewEntry => ({
    kind: "repo",
    key: "repo:o/r",
    url: "https://github.com/o/r",
    nameWithOwner: "o/r",
    number: null,
    title: null,
    count: 1,
    lastViewedAt: now,
    ...overrides,
  });

  it("adds issue and PR views to the score of their repo", () => {
    const scores = repoScores(
      [
        entry({ count: 2 }),
        entry({ kind: "Issue", key: "Issue:o/r#1", number: 1, count: 3 }),
        entry({ kind: "PullRequest", key: "PullRequest:o/r#2", number: 2, count: 4 }),
        entry({ key: "repo:o/other", nameWithOwner: "o/other", count: 1 }),
      ],
      now,
    );
    expect(scores.get(repoKey("o/r"))).toBe(9);
    expect(scores.get(repoKey("o/other"))).toBe(1);
  });

  it("treats owner/repo names case-insensitively", () => {
    const scores = repoScores(
      [
        entry({ nameWithOwner: "Owner/Repo" }),
        entry({ key: "repo:owner/repo", nameWithOwner: "owner/repo" }),
      ],
      now,
    );
    expect(scores.get(repoKey("OWNER/REPO"))).toBe(2);
  });
});

describe("extractViewTitle", () => {
  const issueSeed: ViewSeed = {
    kind: "Issue",
    key: "Issue:cli/cli#13118",
    url: "https://github.com/cli/cli/issues/13118",
    nameWithOwner: "cli/cli",
    number: 13118,
    title: null,
  };
  const prSeed: ViewSeed = {
    ...issueSeed,
    kind: "PullRequest",
    key: "PullRequest:cli/cli#14519",
    url: "https://github.com/cli/cli/pull/14519",
    number: 14519,
  };

  it("extracts the title of an issue page", () => {
    expect(extractViewTitle("Upcoming key rotation · Issue #13118 · cli/cli", issueSeed)).toBe(
      "Upcoming key rotation",
    );
  });

  it("drops the author suffix of a pull request page", () => {
    const title = "Document search by operators by waldyrious · Pull Request #14519 · cli/cli";
    expect(extractViewTitle(title, prSeed)).toBe("Document search by operators");
  });

  it("accepts the trailing site name and a title that contains the separator", () => {
    expect(extractViewTitle("A · B · Issue #13118 · cli/cli · GitHub", issueSeed)).toBe("A · B");
  });

  it("returns null when the title belongs to another page (not yet updated)", () => {
    expect(extractViewTitle("Pull requests · cli/cli · GitHub", issueSeed)).toBeNull();
    expect(extractViewTitle("Other · Issue #1 · cli/cli", issueSeed)).toBeNull();
    expect(extractViewTitle("Other · Issue #13118 · cli/other", issueSeed)).toBeNull();
    expect(extractViewTitle("Upcoming key rotation · Issue #13118 · cli/cli", prSeed)).toBeNull();
  });

  it("compares the repo name case-insensitively", () => {
    expect(extractViewTitle("T · Issue #13118 · CLI/cli", issueSeed)).toBe("T");
  });
});

describe("ViewStatsStore", () => {
  it("notifies subscribers after a record", async () => {
    const store = createViewStatsStore(createMemoryStorage());
    const listener = vi.fn();
    store.subscribe(listener);
    await store.record({
      kind: "repo",
      key: "repo:o/r",
      url: "https://github.com/o/r",
      nameWithOwner: "o/r",
      number: null,
      title: null,
    });
    expect(listener).toHaveBeenCalledOnce();
  });

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
