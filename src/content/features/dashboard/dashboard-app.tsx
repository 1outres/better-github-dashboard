import {
  For,
  Match,
  Show,
  Switch,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type Component,
} from "solid-js";
import type { DashboardData, IssueLike, Repo } from "@/shared/github";
import { scoreEntry, type ViewEntry } from "@/shared/view-stats";
import type { AppContext } from "../../runtime/app-context";
import { IssueIcon, LockIcon, PRIcon, RefreshIcon, StarIcon } from "../shared/icons";
import { formatRelative } from "@/shared/relative-time";
import { CommandPalette } from "./command-palette";
import {
  DASHBOARD_STALE_MS,
  requestOpenOptions,
  requestRefreshDashboard,
} from "@/shared/messages";

const openOptions = () => {
  void requestOpenOptions().then((res) => {
    if (!res.ok) console.warn("[bgd] open-options failed:", res.error);
  });
};

export const DashboardApp: Component<{ shadowRoot: ShadowRoot; app: AppContext }> = (props) => {
  const { settings, dashboardCache, viewStats: viewStatsStore, storage } = props.app;
  const [pat, setPat] = createSignal<string | null>(null);
  const [data, setData] = createSignal<DashboardData | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [refreshing, setRefreshing] = createSignal(false);
  const [viewStats, setViewStats] = createSignal<ViewEntry[]>([]);

  /**
   * background に refresh を委譲する。fetch そのものはここでは行わず、
   * 結果のキャッシュは storage.onChanged 経由でデータ表示に反映される。
   */
  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    setError(null);
    const res = await requestRefreshDashboard();
    setRefreshing(false);
    if (!res.ok) {
      if (res.reason === "error") setError(res.message);
      // reason === "no-pat" は NoTokenBlank で誘導するのでエラー表示しない
    }
  };

  onMount(async () => {
    // キャッシュ + view-stats を hydrate（fetch を待たずに描画する）
    const cached = await dashboardCache.load();
    if (cached) setData(cached.data);
    setViewStats(await viewStatsStore.load());

    // 別ソース (overlay / view-tracker) が view-stats を書き換えたら追従する
    const unsubStats = storage.subscribe("view-stats", () => {
      void viewStatsStore.load().then(setViewStats);
    });
    // background が dashboard-cache を書き換えたら表示を更新
    const unsubCache = storage.subscribe("dashboard-cache", () => {
      void dashboardCache.load().then((c) => {
        if (c) setData(c.data);
      });
    });
    const unsubSettings = settings.subscribe((s) => setPat(s.pat));
    void settings.get().then((s) => setPat(s.pat));

    // stale 判定は background で一元化。ok レスポンスは storage 経由で反映されるので待たない。
    void requestRefreshDashboard({ maxAgeMs: DASHBOARD_STALE_MS });

    onCleanup(() => {
      unsubStats();
      unsubCache();
      unsubSettings();
    });
  });

  return (
    <div class="bgd-shell" data-testid="bgd-shell">
      <Header
        loading={refreshing()}
        onRefresh={refresh}
        canRefresh={!!pat()}
        data={data()}
        viewStats={viewStats()}
        shadowRoot={props.shadowRoot}
      />
      <Switch>
        <Match when={!pat()}>
          <NoTokenBlank />
        </Match>
        <Match when={data()}>{(d) => <DashboardContent data={d()} viewStats={viewStats()} />}</Match>
        <Match when={error() && !data()}>
          <ErrorBlank message={error()!} onRetry={refresh} />
        </Match>
        <Match when={!data()}>
          <LoadingSkeleton />
        </Match>
      </Switch>
    </div>
  );
};

/* ─────────────── Header ─────────────── */

const Header: Component<{
  loading: boolean;
  onRefresh: () => void;
  canRefresh: boolean;
  data: DashboardData | null | undefined;
  viewStats: ViewEntry[];
  shadowRoot: ShadowRoot;
}> = (props) => {
  return (
    <header class="bgd-header">
      <CommandPalette data={props.data} viewStats={props.viewStats} shadowRoot={props.shadowRoot} />
      <Show when={props.canRefresh}>
        <button
          class={`bgd-iconbtn${props.loading ? " spinning" : ""}`}
          onClick={props.onRefresh}
          title="更新"
          disabled={props.loading}
        >
          <RefreshIcon />
        </button>
      </Show>
      <button class="bgd-iconbtn" onClick={openOptions} title="設定">
        ⚙
      </button>
    </header>
  );
};

/* ─────────────── Blank states ─────────────── */

const NoTokenBlank: Component = () => (
  <div class="bgd-blank">
    <h2>はじめに</h2>
    <p>GitHub Personal Access Token を設定してください。</p>
    <a
      class="primary"
      href="#"
      onClick={(e) => {
        e.preventDefault();
        openOptions();
      }}
    >
      設定を開く
    </a>
  </div>
);

const ErrorBlank: Component<{ message: string; onRetry: () => void }> = (props) => (
  <div class="bgd-blank">
    <h2>取得に失敗しました</h2>
    <p>{props.message}</p>
    <button class="primary" onClick={props.onRetry}>
      再試行
    </button>
  </div>
);

const LoadingSkeleton: Component = () => (
  <>
    <section class="bgd-section">
      <div class="bgd-section-title">Repositories</div>
      <div class="bgd-repo-grid">
        <For each={Array(8).fill(0)}>{() => <div class="bgd-skeleton" style="height: 110px" />}</For>
      </div>
    </section>
    <section class="bgd-columns">
      <div class="bgd-skeleton" style="height: 220px" />
      <div class="bgd-skeleton" style="height: 220px" />
    </section>
  </>
);

/* ─────────────── Main content ─────────────── */

const DashboardContent: Component<{ data: DashboardData; viewStats: ViewEntry[] }> = (props) => {
  const repos = createMemo(() => pickRepos(props.data, props.viewStats));

  return (
    <>
      <section class="bgd-section">
        <div class="bgd-section-title">
          Repositories <span class="count">({repos().length})</span>
        </div>
        <div class="bgd-repo-grid">
          <For each={repos()}>{(r) => <RepoCard repo={r} />}</For>
        </div>
      </section>

      <section class="bgd-columns">
        <IssueColumn
          title="Review requested"
          items={props.data.reviewRequests}
        />
        <IssueColumn title="My pull requests" items={props.data.myPullRequests} />
      </section>

      <section class="bgd-columns">
        <IssueColumn title="Assigned" items={props.data.assignedIssues} />
        <IssueColumn title="Mentions" items={props.data.mentions} />
      </section>
    </>
  );
};

/**
 * Pinned + Recent + Writable をマージし重複排除し、直近の閲覧頻度（指数減衰スコア）
 * の降順で 8 件返す。閲覧履歴の無いリポは score 0 となり、安定ソートで元の順序
 * （ピン留め → 最近 push → write 権限）が維持される。
 */
const pickRepos = (data: DashboardData, viewStats: ViewEntry[]): Repo[] => {
  const seen = new Set<string>();
  const all: Repo[] = [];
  for (const r of [...data.pinnedRepos, ...data.recentRepos, ...data.writableRepos]) {
    if (seen.has(r.nameWithOwner)) continue;
    seen.add(r.nameWithOwner);
    all.push(r);
  }
  if (viewStats.length === 0) return all.slice(0, 8);
  const now = Date.now();
  const scoreByRepo = new Map<string, number>();
  for (const e of viewStats) {
    if (e.kind !== "repo") continue;
    scoreByRepo.set(e.nameWithOwner, scoreEntry(e, now));
  }
  return all
    .map((r, i) => ({ r, i, s: scoreByRepo.get(r.nameWithOwner) ?? 0 }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, 8)
    .map((x) => x.r);
};

const RepoCard: Component<{ repo: Repo }> = (props) => {
  const parts = () => props.repo.nameWithOwner.split("/");
  const owner = () => parts()[0] ?? "";
  const name = () => parts()[1] ?? props.repo.nameWithOwner;
  return (
    <a class="bgd-repo-card" href={props.repo.url}>
      <div class="head">
        <img
          class="avatar"
          src={`https://github.com/${owner()}.png?size=56`}
          alt=""
          loading="lazy"
          referrerpolicy="no-referrer"
        />
        <div class="name" title={props.repo.nameWithOwner}>
          <span class="owner">{owner()}</span>
          <span class="repo-name">{name()}</span>
        </div>
        <Show when={props.repo.isPrivate}>
          <LockIcon class="lock-icon" size={14} />
        </Show>
      </div>
      <Show when={props.repo.description}>
        <div class="desc">{props.repo.description}</div>
      </Show>
      <div class="meta">
        <Show when={props.repo.primaryLanguage}>
          {(lang) => (
            <span>
              <span
                class="lang-dot"
                style={{ "--lang-color": lang().color ?? "var(--bgd-fg-muted)" } as never}
              />
              {lang().name}
            </span>
          )}
        </Show>
        <Show when={props.repo.stargazerCount > 0}>
          <span>
            <StarIcon size={12} /> {props.repo.stargazerCount}
          </span>
        </Show>
        <span title={props.repo.updatedAt}>{formatRelative(props.repo.updatedAt)}</span>
      </div>
    </a>
  );
};

/* ─────────────── Issue/PR list ─────────────── */

const IssueColumn: Component<{
  title: string;
  items: IssueLike[];
}> = (props) => {
  return (
    <section class="bgd-section">
      <div class="bgd-section-title">
        {props.title} <span class="count">({props.items.length})</span>
      </div>
      <div class="bgd-list">
        <Show when={props.items.length > 0} fallback={<div class="bgd-list-empty">該当なし</div>}>
          <For each={props.items}>{(item) => <IssueItem item={item} />}</For>
        </Show>
      </div>
    </section>
  );
};

const IssueItem: Component<{ item: IssueLike }> = (props) => {
  const it = () => props.item;
  return (
    <a class="bgd-list-item" href={it().url}>
      <span class={`icon ${it().type === "PullRequest" ? "pr" : ""} ${it().isDraft ? "draft" : ""}`}>
        <Show when={it().type === "PullRequest"} fallback={<IssueIcon />}>
          <PRIcon />
        </Show>
      </span>
      <div class="body">
        <div class="title">{it().title}</div>
        <div class="repo">
          <span>
            {it().repository.nameWithOwner} #{it().number}
          </span>
          <Show when={it().author}>
            {(author) => (
              <>
                <span class="sep">·</span>
                <span>{author().login}</span>
              </>
            )}
          </Show>
          <span class="sep">·</span>
          <span title={it().updatedAt}>{formatRelative(it().updatedAt)}</span>
        </div>
        <Show when={it().type === "PullRequest"}>
          <PRBadges item={it()} />
        </Show>
      </div>
    </a>
  );
};

const PRBadges: Component<{ item: IssueLike }> = (props) => {
  const badges = () => {
    const out: { kind: "success" | "warning" | "danger" | "default"; label: string }[] = [];
    if (props.item.isDraft) out.push({ kind: "default", label: "Draft" });
    if (props.item.statusCheckRollup === "SUCCESS")
      out.push({ kind: "success", label: "✓ checks" });
    if (props.item.statusCheckRollup === "FAILURE")
      out.push({ kind: "danger", label: "✕ checks" });
    if (props.item.statusCheckRollup === "PENDING")
      out.push({ kind: "warning", label: "… checks" });
    if (props.item.mergeable === "CONFLICTING") out.push({ kind: "warning", label: "conflict" });
    if (props.item.reviewDecision === "APPROVED") out.push({ kind: "success", label: "approved" });
    if (props.item.reviewDecision === "CHANGES_REQUESTED")
      out.push({ kind: "danger", label: "changes" });
    return out;
  };
  return (
    <div class="badges">
      <For each={badges()}>
        {(b) => <span class={`bgd-badge ${b.kind === "default" ? "" : b.kind}`}>{b.label}</span>}
      </For>
    </div>
  );
};
