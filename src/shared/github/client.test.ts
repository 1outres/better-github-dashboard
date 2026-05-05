import { describe, expect, it } from "vitest";
import { normalizeDashboard, createGitHubClient } from "./client";

describe("normalizeDashboard", () => {
  const sample = {
    viewer: {
      login: "octocat",
      name: "The Octocat",
      avatarUrl: "https://avatars/x.png",
      repositories: {
        nodes: [
          {
            nameWithOwner: "octocat/hello",
            description: "hi",
            url: "https://github.com/octocat/hello",
            isPrivate: false,
            stargazerCount: 1,
            updatedAt: "2026-05-01T00:00:00Z",
            primaryLanguage: { name: "TypeScript", color: "#3178c6" },
          },
          null,
        ],
      },
      pinnedItems: {
        nodes: [
          {
            nameWithOwner: "octocat/spoon-knife",
            description: null,
            url: "https://github.com/octocat/spoon-knife",
            isPrivate: false,
            stargazerCount: 100,
            updatedAt: "2026-04-01T00:00:00Z",
            primaryLanguage: null,
          },
        ],
      },
    },
    reviewRequests: {
      nodes: [
        {
          __typename: "PullRequest",
          number: 42,
          title: "Add feature",
          url: "https://github.com/octocat/hello/pull/42",
          updatedAt: "2026-05-04T00:00:00Z",
          isDraft: false,
          mergeable: "MERGEABLE",
          reviewDecision: "REVIEW_REQUIRED",
          author: { login: "alice" },
          repository: { nameWithOwner: "octocat/hello" },
          statusCheckRollup: { state: "SUCCESS" },
        },
      ],
    },
    authoredPRs: { nodes: [] },
    assigned: {
      nodes: [
        {
          __typename: "Issue",
          number: 7,
          title: "Bug",
          url: "https://github.com/octocat/hello/issues/7",
          updatedAt: "2026-05-03T00:00:00Z",
          author: { login: "bob" },
          repository: { nameWithOwner: "octocat/hello" },
        },
      ],
    },
    mentions: { nodes: [null] },
  } as const;

  it("flattens repositories and drops nulls", () => {
    const data = normalizeDashboard(structuredClone(sample) as never);
    expect(data.recentRepos).toHaveLength(1);
    expect(data.recentRepos[0]?.nameWithOwner).toBe("octocat/hello");
    expect(data.pinnedRepos[0]?.nameWithOwner).toBe("octocat/spoon-knife");
  });

  it("normalizes issues vs PRs preserving PR-only fields", () => {
    const data = normalizeDashboard(structuredClone(sample) as never);
    const pr = data.reviewRequests[0];
    expect(pr?.type).toBe("PullRequest");
    expect(pr?.statusCheckRollup).toBe("SUCCESS");
    expect(pr?.reviewDecision).toBe("REVIEW_REQUIRED");
    const issue = data.assignedIssues[0];
    expect(issue?.type).toBe("Issue");
    expect(issue?.statusCheckRollup).toBeUndefined();
  });

  it("filters out null search nodes", () => {
    const data = normalizeDashboard(structuredClone(sample) as never);
    expect(data.mentions).toHaveLength(0);
    expect(data.myPullRequests).toHaveLength(0);
  });

  it("carries viewer through unchanged", () => {
    const data = normalizeDashboard(structuredClone(sample) as never);
    expect(data.viewer).toEqual({
      login: "octocat",
      name: "The Octocat",
      avatarUrl: "https://avatars/x.png",
    });
  });
});

describe("createGitHubClient", () => {
  it("sends bearer token and parses dashboard response", async () => {
    const captured: { url: string | null; auth: string | null; body: unknown } = {
      url: null,
      auth: null,
      body: null,
    };
    const fakeFetch: typeof globalThis.fetch = async (url, init) => {
      captured.url = String(url);
      captured.auth = (init?.headers as Record<string, string> | undefined)?.["authorization"] ?? null;
      captured.body = JSON.parse((init?.body as string) ?? "{}");
      const payload = {
        data: {
          viewer: {
            login: "u",
            name: null,
            avatarUrl: "x",
            repositories: { nodes: [] },
            pinnedItems: { nodes: [] },
          },
          reviewRequests: { nodes: [] },
          authoredPRs: { nodes: [] },
          assigned: { nodes: [] },
          mentions: { nodes: [] },
        },
      };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const client = createGitHubClient("ghp_test", { fetch: fakeFetch });
    const data = await client.fetchDashboard();
    expect(captured.auth).toBe("bearer ghp_test");
    expect(data.viewer.login).toBe("u");
    expect(data.recentRepos).toEqual([]);
  });

  it("throws on GraphQL errors", async () => {
    const fakeFetch: typeof globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ errors: [{ message: "Bad credentials", type: "FORBIDDEN" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const client = createGitHubClient("bad", { fetch: fakeFetch });
    await expect(client.fetchDashboard()).rejects.toThrow(/Bad credentials/);
  });
});
