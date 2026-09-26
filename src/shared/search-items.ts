import { Fzf, extendedMatch, type FzfResultItem } from "fzf";
import { collectRepoCandidates, type CandidateSources } from "./repo-candidates";
import { repoKey, repoScores, scoreEntry } from "./view-stats";

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
 * Builds the candidate list of the search box from cached GitHub data and view history.
 * Items are sorted by recent views, highest first. Items with the same score keep the order
 * repos, issue/PR lists, then view history. Duplicates are merged by URL.
 * Works with view history alone, because the overlay can open before the first fetch.
 */
export const buildSearchItems = (sources: CandidateSources, now: number): SearchItem[] => {
  const { dashboard, viewStats } = sources;
  const seen = new Set<string>();
  const scored: { item: SearchItem; score: number }[] = [];

  const push = (item: SearchItem, score: number) => {
    const key = item.url.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    scored.push({ item, score });
  };

  const scores = repoScores(viewStats, now);
  for (const c of collectRepoCandidates(sources)) {
    push(
      {
        kind: "repo",
        label: c.nameWithOwner,
        sub: c.details?.description ?? c.details?.primaryLanguage?.name ?? "",
        url: c.url,
      },
      scores.get(repoKey(c.nameWithOwner)) ?? 0,
    );
  }

  const viewScoreByUrl = new Map(viewStats.map((e) => [e.url.toLowerCase(), scoreEntry(e, now)]));
  const viewScoreOf = (url: string) => viewScoreByUrl.get(url.toLowerCase()) ?? 0;

  if (dashboard) {
    for (const i of [
      ...dashboard.reviewRequests,
      ...dashboard.myPullRequests,
      ...dashboard.assignedIssues,
      ...dashboard.mentions,
    ]) {
      push(
        {
          kind: i.type,
          label: i.title,
          sub: `${i.repository.nameWithOwner} #${i.number}`,
          url: i.url,
        },
        viewScoreOf(i.url),
      );
    }
  }

  for (const e of viewStats) {
    if (e.kind === "repo") continue;
    push(
      {
        kind: e.kind,
        label: e.title ?? `${e.nameWithOwner} #${e.number}`,
        sub: `${e.nameWithOwner} #${e.number}`,
        url: e.url,
      },
      scoreEntry(e, now),
    );
  }

  return scored
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.item);
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
