/**
 * Background service worker.
 *
 * 役割:
 * - 拡張全体で唯一のキャッシュ writer。PAT 変更時の即時 fetch と、
 *   content からのリクエスト (refresh / refreshIfStale) を集約する。
 *   定期 polling は持たず、ユーザーが GitHub をブラウズした際に content から
 *   stale check メッセージが飛んでくる event-driven な設計。
 * - content から options ページを直接開けないため、メッセージで仲介する。
 */

import { createChromeStorage } from "@/shared/storage";
import { createSettingsStore } from "@/shared/settings";
import { createDashboardCache } from "@/shared/dashboard-cache";
import { createGitHubClient } from "@/shared/github";
import type { RuntimeRequest, OpenOptionsResponse, RefreshResult } from "@/shared/messages";
import { createDashboardRefresher } from "./refresher";

const OPTIONS_PATH = "src/options/index.html";

const storage = createChromeStorage();
const settings = createSettingsStore(storage);
const cache = createDashboardCache(storage);
const refresher = createDashboardRefresher({ settings, cache, github: createGitHubClient });

const focusOrCreateOptionsTab = async (): Promise<void> => {
  const url = chrome.runtime.getURL(OPTIONS_PATH);
  // 自身の extension URL に対する query は tabs 権限不要。
  const existing = await chrome.tabs.query({ url });
  const target = existing.find((t) => t.id !== undefined);
  if (target?.id !== undefined) {
    await chrome.tabs.update(target.id, { active: true });
    if (target.windowId !== undefined) {
      await chrome.windows.update(target.windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url });
};

chrome.runtime.onInstalled.addListener(() => {
  // 初回インストールやアップデート直後は古いキャッシュを最新化する
  void refresher.refresh();
});

/**
 * PAT が変更されたら即座にキャッシュを最新化する。
 * options 画面で保存した直後にダッシュボード側へ反映するための主経路。
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  const ch = changes["settings"];
  if (!ch) return;
  const next = (ch.newValue as { pat?: string | null } | undefined)?.pat ?? null;
  const prev = (ch.oldValue as { pat?: string | null } | undefined)?.pat ?? null;
  if (next && next !== prev) void refresher.refresh();
});

chrome.runtime.onMessage.addListener((message: RuntimeRequest, _sender, sendResponse) => {
  if (message?.type === "open-options") {
    void focusOrCreateOptionsTab().then(
      () => sendResponse({ ok: true } satisfies OpenOptionsResponse),
      (err: unknown) => {
        console.warn("[bgd] open-options failed:", err);
        sendResponse({ ok: false, error: String(err) } satisfies OpenOptionsResponse);
      },
    );
    return true;
  }
  if (message?.type === "refresh-dashboard") {
    const job: Promise<RefreshResult> =
      message.maxAgeMs !== undefined
        ? refresher.refreshIfStale(message.maxAgeMs)
        : refresher.refresh();
    void job.then((res) => sendResponse(res));
    return true;
  }
  return false;
});

chrome.action?.onClicked?.addListener(() => {
  void focusOrCreateOptionsTab().catch((err: unknown) => {
    console.warn("[bgd] open-options (action) failed:", err);
  });
});
