import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type Component,
} from "solid-js";
import type { DashboardData } from "@/shared/github";
import { scoreEntry, type ViewEntry } from "@/shared/view-stats";
import { buildSearchItems, rankSearchItems } from "@/shared/search-items";
import type { AppContext } from "../../runtime/app-context";
import { SearchIcon } from "../shared/icons";
import { SearchResultRow } from "../shared/search-result";
import { createArrowNavHandler } from "../shared/keyboard-nav";

const sortViewStats = (stats: ViewEntry[]): ViewEntry[] => {
  if (stats.length === 0) return stats;
  const now = Date.now();
  return [...stats].sort((a, b) => scoreEntry(b, now) - scoreEntry(a, now));
};

export const GlobalSearchOverlay: Component<{ app: AppContext }> = (props) => {
  const { storage, dashboardCache: cache, viewStats: viewStatsStore } = props.app;
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

  const handleArrow = createArrowNavHandler(items, active, setActive, (r) => navigate(r.item.url));

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
    handleArrow(e);
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
                  <SearchResultRow
                    result={r}
                    active={i() === active()}
                    itemClass="bgd-item"
                    onMouseEnter={() => setActive(i())}
                    onSelect={() => navigate(r.item.url)}
                  />
                )}
              </For>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};
