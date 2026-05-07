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
import { IssueIcon, PRIcon, SearchIcon } from "./icons";
import { Highlight } from "./highlight";

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

  const isTypingTarget = (t: EventTarget | null): boolean => {
    if (!(t instanceof HTMLElement)) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const isMeta = e.metaKey || e.ctrlKey;
    if (isMeta && e.key.toLowerCase() === "k") {
      e.preventDefault();
      inputRef.focus();
      inputRef.select();
      setOpen(true);
      return;
    }
    if (!open()) {
      // 何もフォーカスしていない状態で印字可能文字を打ったら、検索バーへ自動 focus
      // 既存の input/textarea/contenteditable には介入しない
      const printable = e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (printable && !isTypingTarget(e.target)) {
        e.preventDefault();
        inputRef.focus();
        setQuery((q) => q + e.key);
        setOpen(true);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      inputRef.blur();
    } else if (e.key === "ArrowDown") {
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
    document.addEventListener("keydown", onKeyDown);
    props.shadowRoot.addEventListener("keydown", onKeyDown as EventListener);
    onCleanup(() => {
      document.removeEventListener("keydown", onKeyDown);
      props.shadowRoot.removeEventListener("keydown", onKeyDown as EventListener);
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
                <a
                  class={`bgd-search-item${i() === active() ? " active" : ""}`}
                  href={r.item.url}
                  onMouseEnter={() => setActive(i())}
                  onMouseDown={(e) => {
                    // blur 前に navigate を確定させる
                    e.preventDefault();
                    navigate(r.item.url);
                  }}
                >
                  <span class={`kind ${r.item.kind === "repo" ? "repo" : r.item.kind === "PullRequest" ? "pr" : "issue"}`}>
                    <Show when={r.item.kind === "repo"} fallback={
                      <Show when={r.item.kind === "PullRequest"} fallback={<IssueIcon size={14} />}>
                        <PRIcon size={14} />
                      </Show>
                    }>
                      <RepoIcon />
                    </Show>
                  </span>
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
      </Show>
    </div>
  );
};

const RepoIcon: Component = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width={14} height={14} fill="currentColor">
    <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
  </svg>
);
