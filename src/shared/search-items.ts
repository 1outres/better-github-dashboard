import { Fzf, extendedMatch, type FzfResultItem } from "fzf";
import type { DashboardData } from "./github";
import type { ViewEntry } from "./view-stats";

export type SearchItemKind = "repo" | "PullRequest" | "Issue";

export type SearchItem = {
  kind: SearchItemKind;
  label: string;
  sub: string;
  url: string;
};

export type RankedItem = {
  item: SearchItem;
  score: number;
  matches: { label: number[]; sub: number[] };
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

// label と sub を 1 本に連結して fzf に渡す。SEP は extendedMatch のトークン区切り
// (空白) に当たらないよう、改行ベースの不可視区切りを使う。連結文字列に含まれる位置を
// 後段で label / sub のローカル index に分解する。
const SEP = "\n\n";

const haystackOf = (it: SearchItem): string => `${it.label}${SEP}${it.sub}`;

const splitPositions = (
  positions: Set<number>,
  labelLen: number,
): { label: number[]; sub: number[] } => {
  const label: number[] = [];
  const sub: number[] = [];
  const subStart = labelLen + SEP.length;
  for (const p of positions) {
    if (p < labelLen) label.push(p);
    else if (p >= subStart) sub.push(p - subStart);
  }
  label.sort((a, b) => a - b);
  sub.sort((a, b) => a - b);
  return { label, sub };
};

export const rankSearchItems = (
  all: SearchItem[],
  query: string,
  opts?: { limit?: number; emptyLimit?: number },
): RankedItem[] => {
  const limit = opts?.limit ?? 20;
  const emptyLimit = opts?.emptyLimit ?? 10;
  const q = query.trim();

  if (!q) {
    return all.slice(0, emptyLimit).map((item) => ({
      item,
      score: 0,
      matches: { label: [], sub: [] },
    }));
  }

  // タイブレークで入力順（履歴スコア降順で事前ソート済み）を保つため、index を引けるようにしておく。
  const orderOf = new Map<SearchItem, number>();
  all.forEach((item, i) => orderOf.set(item, i));

  const fzf = new Fzf<readonly SearchItem[]>(all, {
    selector: haystackOf,
    match: extendedMatch,
    casing: "smart-case",
    limit,
    tiebreakers: [
      (a: FzfResultItem<SearchItem>, b: FzfResultItem<SearchItem>) =>
        (orderOf.get(a.item) ?? 0) - (orderOf.get(b.item) ?? 0),
    ],
  });

  return fzf.find(q).map((r) => ({
    item: r.item,
    score: r.score,
    matches: splitPositions(r.positions, r.item.label.length),
  }));
};
