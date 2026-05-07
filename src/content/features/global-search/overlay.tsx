import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type Component,
  type JSX,
} from "solid-js";
import type { DashboardData } from "@/shared/github";
import { createDashboardCache } from "@/shared/dashboard-cache";
import { createChromeStorage } from "@/shared/storage";
import { createViewStatsStore, scoreEntry, type ViewEntry } from "@/shared/view-stats";
import {
  buildSearchItems,
  rankSearchItems,
  type SearchItem,
} from "@/shared/search-items";
import { IssueIcon, PRIcon, SearchIcon } from "../dashboard/icons";
import { Highlight } from "../dashboard/highlight";

const storage = createChromeStorage();
const cache = createDashboardCache(storage);
const viewStatsStore = createViewStatsStore(storage);

const sortViewStats = (stats: ViewEntry[]): ViewEntry[] => {
  if (stats.length === 0) return stats;
  const now = Date.now();
  return [...stats].sort((a, b) => scoreEntry(b, now) - scoreEntry(a, now));
};

export const GlobalSearchOverlay: Component = () => {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [active, setActive] = createSignal(0);
  const [data, setData] = createSignal<DashboardData | null>(null);
  const [viewStats, setViewStats] = createSignal<ViewEntry[]>([]);
  let inputRef: HTMLInputElement | undefined;

  const allItems = createMemo(() => buildSearchItems(data(), sortViewStats(viewStats())));
  const items = createMemo(() => rankSearchItems(allItems(), query()));

  // 候補が変わったらハイライト位置をリセット
  createEffect(() => {
    items();
    setActive(0);
  });

  const refreshAll = async (): Promise<void> => {
    const [c, v] = await Promise.all([cache.load(), viewStatsStore.load()]);
    if (c) setData(c.data);
    setViewStats(v);
  };

  const navigate = (url: string): void => {
    setOpen(false);
    if (url) location.href = url;
  };

  const focusInput = () => {
    queueMicrotask(() => {
      inputRef?.focus();
      inputRef?.select();
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const isMeta = e.metaKey || e.ctrlKey;

    // Cmd+K: トグル。capture + stopImmediatePropagation で GitHub 自身の
    // Cmd+K と dashboard inline ハンドラを両方無効化する。
    if (isMeta && e.key.toLowerCase() === "k") {
      e.preventDefault();
      e.stopImmediatePropagation();
      const willOpen = !open();
      setOpen(willOpen);
      if (willOpen) {
        void refreshAll();
        focusInput();
      }
      return;
    }

    if (!open()) return;

    // Cmd+R / Cmd+L / Alt+◯ 等のシステム/ブラウザショートカットは素通しさせる。
    if (isMeta || e.altKey) return;

    // ここから先：overlay が open かつ修飾キー無し。
    // GitHub のホットキー (g p で PR タブへ、t でツリー、/ でフォーカス等) が
    // 裏側のページで発火しないよう、すべての非修飾 keydown を window 段階で握り潰す。
    // preventDefault はしないので、フォーカス中の input への文字入力は通常どおり行われる。
    e.stopImmediatePropagation();

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(items().length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      const r = items()[active()];
      if (r) {
        e.preventDefault();
        navigate(r.item.url);
      }
    }
  };

  onMount(() => {
    void refreshAll();
    const unsubCache = storage.subscribe("dashboard-cache", () => void refreshAll());
    const unsubStats = storage.subscribe("view-stats", () => void refreshAll());

    // window-capture で登録：イベントは window → document → ... → target の順に
    // capture phase が走るので、document/window のどこに付いた GitHub 側のリスナよりも先に取れる。
    window.addEventListener("keydown", onKeyDown, true);

    onCleanup(() => {
      window.removeEventListener("keydown", onKeyDown, true);
      unsubCache();
      unsubStats();
    });
  });

  const onBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) setOpen(false);
  };

  return (
    <Show when={open()}>
      <div class="bgd-overlay" onClick={onBackdropClick}>
        <div class="bgd-modal" role="dialog" aria-label="Better GitHub Dashboard search">
          <div class="bgd-search-row">
            <SearchIcon class="bgd-search-icon" />
            <input
              ref={(el) => (inputRef = el)}
              type="text"
              placeholder="Search repositories, issues, PRs…"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              autocomplete="off"
              spellcheck={false}
            />
            <kbd>esc</kbd>
          </div>
          <div class="bgd-list">
            <Show
              when={items().length > 0}
              fallback={
                <div class="bgd-empty">
                  {allItems().length === 0
                    ? "データがありません。ダッシュボードを開いて読み込んでください。"
                    : "該当なし"}
                </div>
              }
            >
              <For each={items()}>
                {(r, i) => (
                  <a
                    class={`bgd-item${i() === active() ? " active" : ""}`}
                    href={r.item.url}
                    onMouseEnter={() => setActive(i())}
                    onMouseDown={(e) => {
                      // blur で overlay が閉じる前に navigate を確定させる
                      e.preventDefault();
                      navigate(r.item.url);
                    }}
                  >
                    <span class={`kind ${kindClass(r.item.kind)}`}>{kindIcon(r.item.kind)}</span>
                    <span class="label">
                      <Highlight text={r.item.label} positions={r.matches.label} />
                    </span>
                    <span class="sub">
                      <Highlight text={r.item.sub} positions={r.matches.sub} />
                    </span>
                  </a>
                )}
              </For>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};

const kindClass = (k: SearchItem["kind"]): string =>
  k === "repo" ? "repo" : k === "PullRequest" ? "pr" : "issue";

const kindIcon = (k: SearchItem["kind"]): JSX.Element => {
  if (k === "PullRequest") return <PRIcon size={14} />;
  if (k === "Issue") return <IssueIcon size={14} />;
  return <RepoIcon />;
};

const RepoIcon: Component = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={14}
    height={14}
    fill="currentColor"
  >
    <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
  </svg>
);
