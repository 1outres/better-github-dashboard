export type { Repo, IssueLike, Viewer, DashboardData } from "./types";
export { createGitHubClient, normalizeDashboard } from "./client";
export type { GitHubClient, GitHubClientOptions } from "./client";

import type { GitHubClient, GitHubClientOptions } from "./client";

/**
 * createGitHubClient と同じシグネチャの factory 型。
 * AppContext / background の refresher 双方で client 生成を抽象化するために共有する。
 */
export type GitHubClientFactory = (pat: string, opts?: GitHubClientOptions) => GitHubClient;
