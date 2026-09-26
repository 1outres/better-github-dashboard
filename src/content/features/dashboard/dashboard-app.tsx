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
import type { DashboardData, IssueLike } from "@/shared/github";
import {
  collectRepoCandidates,
  rankRepoCandidates,
  type CandidateSources,
  type RepoCandidate,
} from "@/shared/repo-candidates";
import type { AppContext } from "../../runtime/app-context";
import { IssueIcon, LockIcon, PRIcon, RefreshIcon, StarIcon } from "../shared/icons";
import { createLiveSources } from "../shared/live-sources";
import { formatRelative } from "@/shared/relative-time";
import { CommandPalette } from "./command-palette";
import { RefreshAlert } from "./refresh-alert";
import { isUnresolved, toRefreshFailure, type RefreshFailure } from "./refresh-failure";
import {
  DASHBOARD_STALE_MS,
  requestOpenOptions,
  requestRefreshDashboard,
  type RefreshResult,
} from "@/shared/messages";

const REPO_CARD_COUNT = 8;

const openOptions = () => {
  void requestOpenOptions().then((res) => {
    if (!res.ok) console.warn("[bgd] open-options failed:", res.error);
  });
};

export const DashboardApp: Component<{ shadowRoot: ShadowRoot; app: AppContext }> = (props) => {
  const { settings } = props.app;
  const live = createLiveSources(props.app);
  const [pat, setPat] = createSignal<string | null>(null);
  const [failure, setFailure] = createSignal<RefreshFailure | null>(null);
  const [refreshing, setRefreshing] = createSignal(false);

  const data = () => live.dashboard()?.data ?? null;
  const unresolvedFailure = () => {
    const f = failure();
    return isUnresolved(f, live.dashboard()?.fetchedAt ?? null) ? f : null;
  };

  const applyRefreshResult = (res: RefreshResult) => setFailure(toRefreshFailure(res, Date.now()));

  /**
   * background に refresh を委譲する。fetch そのものはここでは行わず、
   * 結果のキャッシュは storage.onChanged 経由でデータ表示に反映される。
   */
  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    const res = await requestRefreshDashboard();
    setRefreshing(false);
    applyRefreshResult(res);
  };

  onMount(() => {
    const unsubSettings = settings.subscribe((s) => setPat(s.pat));
    void settings.get().then((s) => setPat(s.pat));

    // The background decides whether the cache is stale. New data arrives through storage.
    void requestRefreshDashboard({ maxAgeMs: DASHBOARD_STALE_MS }).then(applyRefreshResult);

    onCleanup(unsubSettings);
  });

  return (
    <div class="bgd-shell" data-testid="bgd-shell">
      <Header
        loading={refreshing()}
        onRefresh={refresh}
        canRefresh={!!pat()}
        fetchedAt={live.dashboard()?.fetchedAt ?? null}
        sources={live.sources()}
        shadowRoot={props.shadowRoot}
      />
      <Switch>
        <Match when={!pat()}>
          <NoTokenBlank />
        </Match>
        <Match when={live.dashboard()}>
          {(snapshot) => (
            <>
              <Show when={unresolvedFailure()}>
                {(f) => (
                  <RefreshAlert
                    message={f().message}
                    fetchedAt={snapshot().fetchedAt}
                    onRetry={refresh}
                  />
                )}
              </Show>
              <DashboardContent data={snapshot().data} sources={live.sources()} />
            </>
          )}
        </Match>
        <Match when={!data() && unresolvedFailure()}>
          {(f) => <ErrorBlank message={f().message} onRetry={refresh} />}
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
  fetchedAt: number | null;
  sources: CandidateSources;
  shadowRoot: ShadowRoot;
}> = (props) => {
  const refreshTitle = () =>
    props.fetchedAt === null
      ? "更新"
      : `更新（最終更新: ${formatRelative(new Date(props.fetchedAt).toISOString())}）`;
  return (
    <header class="bgd-header">
      <CommandPalette sources={props.sources} shadowRoot={props.shadowRoot} />
      <Show when={props.canRefresh}>
        <button
          class={`bgd-iconbtn${props.loading ? " spinning" : ""}`}
          onClick={props.onRefresh}
          title={refreshTitle()}
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

const DashboardContent: Component<{ data: DashboardData; sources: CandidateSources }> = (props) => {
  const repos = createMemo(() => pickRepos(props.sources));

  return (
    <>
      <section class="bgd-section">
        <div class="bgd-section-title">
          Repositories <span class="count">({repos().length})</span>
        </div>
        <div class="bgd-repo-grid">
          <For each={repos()}>{(r) => <RepoCard candidate={r} />}</For>
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

const pickRepos = (sources: CandidateSources): RepoCandidate[] =>
  rankRepoCandidates(collectRepoCandidates(sources), sources.viewStats, Date.now()).slice(
    0,
    REPO_CARD_COUNT,
  );

const RepoCard: Component<{ candidate: RepoCandidate }> = (props) => {
  const parts = () => props.candidate.nameWithOwner.split("/");
  const owner = () => parts()[0] ?? "";
  const name = () => parts()[1] ?? props.candidate.nameWithOwner;
  return (
    <a class="bgd-repo-card" href={props.candidate.url}>
      <div class="head">
        <img
          class="avatar"
          src={`https://github.com/${owner()}.png?size=56`}
          alt=""
          loading="lazy"
          referrerpolicy="no-referrer"
        />
        <div class="name" title={props.candidate.nameWithOwner}>
          <span class="owner">{owner()}</span>
          <span class="repo-name">{name()}</span>
        </div>
        <Show when={props.candidate.details?.isPrivate}>
          <LockIcon class="lock-icon" size={14} />
        </Show>
      </div>
      <Show when={props.candidate.details}>
        {(repo) => (
          <>
            <Show when={repo().description}>
              <div class="desc">{repo().description}</div>
            </Show>
            <div class="meta">
              <Show when={repo().primaryLanguage}>
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
              <Show when={repo().stargazerCount > 0}>
                <span>
                  <StarIcon size={12} /> {repo().stargazerCount}
                </span>
              </Show>
              <span title={repo().updatedAt}>{formatRelative(repo().updatedAt)}</span>
            </div>
          </>
        )}
      </Show>
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
