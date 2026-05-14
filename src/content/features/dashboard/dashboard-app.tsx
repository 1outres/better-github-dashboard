import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type Component,
} from "solid-js";
import type { DashboardData, IssueLike, Repo } from "@/shared/github";
import { scoreEntry, type ViewEntry } from "@/shared/view-stats";
import type { AppContext } from "../../runtime/app-context";
import { IssueIcon, LockIcon, PRIcon, RefreshIcon, StarIcon } from "./icons";
import { formatRelative } from "@/shared/relative-time";
import { CommandPalette } from "./command-palette";

const openOptions = () => {
  if (!chrome.runtime?.id) {
    // 拡張 context が orphan 化した場合のみここに落ちる。
    // 通常は SW 経由（tabs.query + tabs.create）で開く。
    const url = chrome.runtime?.getURL?.("src/options/index.html");
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  void chrome.runtime.sendMessage({ type: "open-options" }).then(
    (res: { ok?: boolean; error?: string } | undefined) => {
      if (!res?.ok) console.warn("[bgd] open-options failed:", res?.error ?? res);
    },
    (err: unknown) => {
      console.warn("[bgd] open-options sendMessage rejected:", err);
    },
  );
};

export const DashboardApp: Component<{ shadowRoot: ShadowRoot; app: AppContext }> = (props) => {
  const { settings, dashboardCache, viewStats: viewStatsStore, github } = props.app;
  const [pat, setPat] = createSignal<string | null>(null);
  const [data, setData] = createSignal<DashboardData | null>(null);
  const [error, setError] = createSignal<unknown>(null);
  const [refreshing, setRefreshing] = createSignal(false);
  const [viewStats, setViewStats] = createSignal<ViewEntry[]>([]);

  // 起動直後: キャッシュから即時 hydrate（fetch を待たずに描画する）
  onMount(async () => {
    const cached = await dashboardCache.load();
    if (cached && !data()) setData(cached.data);
    setViewStats(await viewStatsStore.load());

    // overlay / view-tracker など別ソースの書き込みでも view-stats を反映する。
    // dashboard が常駐している間 viewStats が古いまま放置されないようにする。
    const unsubStats = props.app.storage.subscribe("view-stats", () => {
      void viewStatsStore.load().then(setViewStats);
    });
    // 同様に PAT 以外のフィールド変更にも追従できるよう、settings 全体を購読する。
    const unsubSettings = settings.subscribe((s) => setPat(s.pat));
    void settings.get().then((s) => setPat(s.pat));

    onCleanup(() => {
      unsubStats();
      unsubSettings();
    });
  });

  const refetch = async (): Promise<void> => {
    const token = pat();
    if (!token) return;
    setRefreshing(true);
    setError(null);
    try {
      const client = github(token);
      const fresh = await client.fetchDashboard();
      setData(fresh);
      void dashboardCache.save(fresh);

      // 検索候補を充実させるため、書き込み権限のある全レポを非同期で追加読み込み。
      // 失敗してもダッシュボード本体には影響させない。
      void client
        .fetchWritableRepos()
        .then((writable) => {
          setData((prev) => (prev ? { ...prev, writableRepos: writable } : prev));
          void dashboardCache.save({ ...fresh, writableRepos: writable });
        })
        .catch(() => {});
    } catch (e) {
      setError(e);
    } finally {
      setRefreshing(false);
    }
  };

  // PAT が確定したら revalidate
  createEffect(() => {
    if (pat()) void refetch();
  });

  return (
    <div class="bgd-shell" data-testid="bgd-shell">
      <Header
        loading={refreshing()}
        onRefresh={refetch}
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
          <ErrorBlank error={error()} onRetry={refetch} />
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

const ErrorBlank: Component<{ error: unknown; onRetry: () => void }> = (props) => (
  <div class="bgd-blank">
    <h2>取得に失敗しました</h2>
    <p>{props.error instanceof Error ? props.error.message : String(props.error)}</p>
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
