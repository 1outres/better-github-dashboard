import { Show, type Component, type JSX } from "solid-js";
import type { RankedItem, SearchItem } from "@/shared/search-items";
import { IssueIcon, PRIcon, RepoIcon } from "./icons";
import { Highlight } from "./highlight";

export const kindClass = (k: SearchItem["kind"]): string =>
  k === "repo" ? "repo" : k === "PullRequest" ? "pr" : "issue";

export const KindIcon: Component<{ kind: SearchItem["kind"]; size?: number }> = (props) => (
  <Show
    when={props.kind === "PullRequest"}
    fallback={
      <Show when={props.kind === "Issue"} fallback={<RepoIcon size={props.size ?? 14} />}>
        <IssueIcon size={props.size ?? 14} />
      </Show>
    }
  >
    <PRIcon size={props.size ?? 14} />
  </Show>
);

/**
 * 検索候補 1 行分のレンダリング。dropdown / modal の両方で markup を共有するため、
 * 外側コンテナ (ul/div) と CSS のクラス名はホスト側で与える。
 * inner の `.kind` / `.label` / `.sub` は固定で、両方の stylesheet が同名で書ける。
 */
export const SearchResultRow: Component<{
  result: RankedItem;
  active: boolean;
  itemClass: string;
  activeClass?: string;
  onMouseEnter: () => void;
  onSelect: () => void;
  onClick?: JSX.EventHandler<HTMLAnchorElement, MouseEvent>;
}> = (props) => {
  const className = () => {
    const active = props.active ? ` ${props.activeClass ?? "active"}` : "";
    return `${props.itemClass}${active}`;
  };
  return (
    <a
      class={className()}
      href={props.result.item.url}
      onMouseEnter={props.onMouseEnter}
      onMouseDown={(e) => {
        // blur 前に navigate を確定させる
        e.preventDefault();
        props.onSelect();
      }}
      onClick={props.onClick}
    >
      <span class={`kind ${kindClass(props.result.item.kind)}`}>
        <KindIcon kind={props.result.item.kind} />
      </span>
      <span class="label">
        <Highlight text={props.result.item.label} positions={props.result.matches.label} />
      </span>
      <span class="sub">
        <Highlight text={props.result.item.sub} positions={props.result.matches.sub} />
      </span>
    </a>
  );
};
