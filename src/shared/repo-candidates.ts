import type { DashboardData, Repo } from "./github";
import { repoKey, repoScores, type ViewEntry } from "./view-stats";

/** Everything the dashboard and the search box pick repos, issues, and PRs from. */
export type CandidateSources = {
  dashboard: DashboardData | null;
  writableRepos: Repo[];
  viewStats: ViewEntry[];
};

export type RepoCandidate = {
  nameWithOwner: string;
  url: string;
  /** null when the repo is known only from issue lists or view history. */
  details: Repo | null;
};

/**
 * Lists every repo the user is likely to open, without duplicates.
 * Order: pinned, recently pushed, writable, repos of the issue/PR lists, then view history.
 * Rankers keep this order for repos with the same score.
 */
export const collectRepoCandidates = (sources: CandidateSources): RepoCandidate[] => {
  const { dashboard, writableRepos, viewStats } = sources;
  const seen = new Set<string>();
  const out: RepoCandidate[] = [];

  const add = (nameWithOwner: string, details: Repo | null) => {
    const key = repoKey(nameWithOwner);
    if (seen.has(key)) return;
    seen.add(key);
    const url = details?.url ?? `https://github.com/${nameWithOwner}`;
    out.push({ nameWithOwner, url, details });
  };

  if (dashboard) {
    for (const r of [...dashboard.pinnedRepos, ...dashboard.recentRepos]) add(r.nameWithOwner, r);
  }
  for (const r of writableRepos) add(r.nameWithOwner, r);
  if (dashboard) {
    for (const i of [
      ...dashboard.reviewRequests,
      ...dashboard.myPullRequests,
      ...dashboard.assignedIssues,
      ...dashboard.mentions,
    ]) {
      add(i.repository.nameWithOwner, null);
    }
  }
  for (const e of viewStats) add(e.nameWithOwner, null);
  return out;
};

/** Sorts by how often the repo and its issues and PRs were viewed recently. */
export const rankRepoCandidates = (
  candidates: RepoCandidate[],
  viewStats: ViewEntry[],
  now: number,
): RepoCandidate[] => {
  const scores = repoScores(viewStats, now);
  const scoreOf = (c: RepoCandidate) => scores.get(repoKey(c.nameWithOwner)) ?? 0;
  return candidates
    .map((c, i) => ({ c, i, s: scoreOf(c) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
};
