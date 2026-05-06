import type { DashboardData } from "./github";
import type { ViewEntry } from "./view-stats";

export type SearchItemKind = "repo" | "PullRequest" | "Issue";

export type SearchItem = {
  kind: SearchItemKind;
  label: string;
  sub: string;
  url: string;
};

/**
 * ダッシュボードのキャッシュと閲覧履歴を結合し、コマンドパレットの候補リストを構築する。
 * 重複は URL で吸収する。データが無くても view-stats だけで返せる（オーバーレイは
 * 非ダッシュボードページからキャッシュ未取得状態で開かれる可能性があるため）。
 */
export const buildSearchItems = (
  data: DashboardData | null | undefined,
  viewStats: ViewEntry[],
): SearchItem[] => {
  const seen = new Set<string>();
  const out: SearchItem[] = [];

  const push = (it: SearchItem) => {
    if (seen.has(it.url)) return;
    seen.add(it.url);
    out.push(it);
  };

  if (data) {
    for (const r of [...data.pinnedRepos, ...data.recentRepos, ...data.writableRepos]) {
      push({
        kind: "repo",
        label: r.nameWithOwner,
        sub: r.description ?? r.primaryLanguage?.name ?? "",
        url: r.url,
      });
    }
    for (const i of [
      ...data.reviewRequests,
      ...data.myPullRequests,
      ...data.assignedIssues,
      ...data.mentions,
    ]) {
      push({
        kind: i.type,
        label: i.title,
        sub: `${i.repository.nameWithOwner} #${i.number}`,
        url: i.url,
      });
    }
  }

  // 呼び出し側が事前にスコア降順ソートしている前提（dashboard / overlay の両方でそうしている）。
  for (const e of viewStats) {
    if (e.kind === "repo") {
      push({ kind: "repo", label: e.nameWithOwner, sub: "", url: e.url });
    } else {
      push({
        kind: e.kind,
        label: e.title ?? `${e.nameWithOwner} #${e.number}`,
        sub: `${e.nameWithOwner} #${e.number}`,
        url: e.url,
      });
    }
  }
  return out;
};

export const filterSearchItems = (all: SearchItem[], query: string): SearchItem[] => {
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, 10);
  const tokens = q.split(/\s+/).filter(Boolean);
  return all
    .filter((it) => {
      const hay = `${it.label} ${it.sub}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    })
    .slice(0, 20);
};
