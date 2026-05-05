import { graphql } from "@octokit/graphql";
import type { DashboardData, IssueLike, Repo, Viewer } from "./types";
import { DASHBOARD_QUERY, DASHBOARD_VARIABLES, WRITABLE_REPOS_QUERY } from "./queries";

export type GitHubClient = {
  fetchDashboard: () => Promise<DashboardData>;
  fetchViewer: () => Promise<Viewer>;
  fetchWritableRepos: () => Promise<Repo[]>;
};

const MAX_WRITABLE_PAGES = 5;

const isWritablePermission = (perm: string | null | undefined): boolean =>
  perm === "ADMIN" || perm === "MAINTAIN" || perm === "WRITE";

export type GitHubClientOptions = {
  /** テスト・モック差し替え用 */
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
};

export const createGitHubClient = (pat: string, opts: GitHubClientOptions = {}): GitHubClient => {
  const gql = graphql.defaults({
    headers: {
      authorization: `bearer ${pat}`,
    },
    ...(opts.fetch ? { request: { fetch: opts.fetch } } : {}),
    ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
  });

  return {
    fetchViewer: async () => {
      const data = await gql<{ viewer: Viewer }>(/* GraphQL */ `
        query Viewer {
          viewer {
            login
            name
            avatarUrl
          }
        }
      `);
      return data.viewer;
    },

    fetchDashboard: async () => {
      const raw = await gql<RawDashboardResponse>(DASHBOARD_QUERY, DASHBOARD_VARIABLES);
      return normalizeDashboard(raw);
    },

    fetchWritableRepos: async () => {
      const out: Repo[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < MAX_WRITABLE_PAGES; page++) {
        const res: RawWritableReposResponse = await gql(WRITABLE_REPOS_QUERY, { cursor });
        const nodes = compact(res.viewer.repositories.nodes);
        for (const r of nodes) {
          if (isWritablePermission(r.viewerPermission)) out.push(r);
        }
        if (!res.viewer.repositories.pageInfo.hasNextPage) break;
        cursor = res.viewer.repositories.pageInfo.endCursor;
      }
      return out;
    },
  };
};

type RawWritableReposResponse = {
  viewer: {
    repositories: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: (Repo | null)[];
    };
  };
};

type RawRepo = Repo;
type RawIssue = {
  __typename: "Issue" | "PullRequest";
  number: number;
  title: string;
  url: string;
  updatedAt: string;
  isDraft?: boolean;
  mergeable?: string;
  reviewDecision?: string | null;
  author: { login: string } | null;
  repository: { nameWithOwner: string };
  statusCheckRollup?: { state: string } | null;
};

type RawDashboardResponse = {
  viewer: Viewer & {
    repositories: { nodes: (RawRepo | null)[] };
    pinnedItems: { nodes: (RawRepo | null)[] };
  };
  reviewRequests: { nodes: (RawIssue | null)[] };
  authoredPRs: { nodes: (RawIssue | null)[] };
  assigned: { nodes: (RawIssue | null)[] };
  mentions: { nodes: (RawIssue | null)[] };
};

const compact = <T,>(arr: (T | null)[]): T[] => arr.filter((x): x is T => x !== null);

const toIssue = (n: RawIssue): IssueLike => ({
  type: n.__typename,
  number: n.number,
  title: n.title,
  url: n.url,
  updatedAt: n.updatedAt,
  repository: n.repository,
  author: n.author,
  ...(n.isDraft !== undefined ? { isDraft: n.isDraft } : {}),
  ...(n.mergeable !== undefined ? { mergeable: n.mergeable } : {}),
  ...(n.reviewDecision !== undefined ? { reviewDecision: n.reviewDecision } : {}),
  ...(n.statusCheckRollup !== undefined
    ? { statusCheckRollup: n.statusCheckRollup?.state ?? null }
    : {}),
});

export const normalizeDashboard = (raw: RawDashboardResponse): DashboardData => {
  const { viewer } = raw;
  return {
    viewer: { login: viewer.login, name: viewer.name, avatarUrl: viewer.avatarUrl },
    pinnedRepos: compact(viewer.pinnedItems.nodes),
    recentRepos: compact(viewer.repositories.nodes),
    writableRepos: [],
    reviewRequests: compact(raw.reviewRequests.nodes).map(toIssue),
    myPullRequests: compact(raw.authoredPRs.nodes).map(toIssue),
    assignedIssues: compact(raw.assigned.nodes).map(toIssue),
    mentions: compact(raw.mentions.nodes).map(toIssue),
  };
};
