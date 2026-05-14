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
import { SearchIcon } from "../shared/icons";
import { SearchResultRow } from "../shared/search-result";
import { createArrowNavHandler } from "../shared/keyboard-nav";

const sortViewStats = (stats: ViewEntry[]): ViewEntry[] => {
  if (stats.length === 0) return stats;
  const now = Date.now();
  return [...stats].sort((a, b) => scoreEntry(b, now) - scoreEntry(a, now));
};

export const CommandPalette: Component<{
  data: DashboardData | null | undefined;
  viewStats: ViewEntry[];
  shadowRoot: ShadowRoot;
}> = (props) => {
  const [query, setQuery] = createSignal("");
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(0);
  let inputRef!: HTMLInputElement;

  const allItems = createMemo(() => buildSearchItems(props.data, sortViewStats(props.viewStats)));
  const items = createMemo(() => rankSearchItems(allItems(), query()));

  createEffect(() => {
    items();
    setActive(0);
  });

  const navigate = (url: string) => {
    if (url) location.href = url;
  };

  const handleArrow = createArrowNavHandler(items, active, setActive, (r) => navigate(r.item.url));

  const isTypingTarget = (t: EventTarget | null): boolean => {
    if (!(t instanceof HTMLElement)) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  };

  /**
   * GitHub の hotkey ライブラリ (`@github/hotkey`) は document の keydown bubble で
   * `g i` などのナビゲーションを発火する。我々が消費したキーが GitHub に
   * 漏れると意図しないページ遷移が起きるので、capture phase で先取りし、
   * 我々が「消費」する場合のみ stopImmediatePropagation で抑止する。
   *
   * Cmd+K の処理は GlobalSearchOverlay が window-capture で握っているのでここでは扱わない。
   */
  const onKeyDown = (e: KeyboardEvent) => {
    if (!open()) {
      // 何もフォーカスしていない状態で印字可能文字を打ったら、検索バーへ自動 focus
      // 既存の input/textarea/contenteditable には介入しない
      const printable = e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (printable && !isTypingTarget(e.target)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        inputRef.focus();
        setQuery((q) => q + e.key);
        setOpen(true);
      }
      return;
    }

    // open() === true: 我々の input が focus 中。
    // GitHub の hotkey が裏で発火するのを避けるため、ここでは常に伝播を止める。
    // preventDefault は個別キーのみに付け、通常入力は input の default action に任せる。
    e.stopImmediatePropagation();

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      inputRef.blur();
      return;
    }
    handleArrow(e);
  };

  onMount(() => {
    document.addEventListener("keydown", onKeyDown, { capture: true });
    props.shadowRoot.addEventListener("keydown", onKeyDown as EventListener, { capture: true });
    onCleanup(() => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      props.shadowRoot.removeEventListener("keydown", onKeyDown as EventListener, {
        capture: true,
      });
    });
  });

  return (
    <div class="bgd-search" data-open={open()}>
      <SearchIcon class="bgd-search-icon" />
      <input
        ref={inputRef!}
        type="text"
        placeholder="Search repositories, issues, PRs…"
        value={query()}
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autocomplete="off"
        spellcheck={false}
      />
      <kbd>⌘K</kbd>
      <Show when={open() && allItems().length > 0}>
        <div class="bgd-search-dropdown">
          <Show
            when={items().length > 0}
            fallback={<div class="bgd-search-empty">該当なし</div>}
          >
            <For each={items()}>
              {(r, i) => (
                <SearchResultRow
                  result={r}
                  active={i() === active()}
                  itemClass="bgd-search-item"
                  onMouseEnter={() => setActive(i())}
                  onSelect={() => navigate(r.item.url)}
                />
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
};
