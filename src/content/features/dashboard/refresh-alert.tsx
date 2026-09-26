import type { Component } from "solid-js";
import { formatRelative } from "@/shared/relative-time";

export const RefreshAlert: Component<{
  message: string;
  fetchedAt: number;
  onRetry: () => void;
}> = (props) => (
  <div class="bgd-alert" role="alert">
    <div class="body">
      <strong>更新に失敗しました</strong>
      <span class="message">{props.message}</span>
      <span class="meta">最終更新: {formatRelative(new Date(props.fetchedAt).toISOString())}</span>
    </div>
    <button class="bgd-alert-retry" onClick={() => props.onRetry()}>
      再試行
    </button>
  </div>
);
