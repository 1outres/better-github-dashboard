/**
 * Background service worker.
 *
 * 役割:
 * - 拡張全体で唯一のキャッシュ writer。alarms による定期 fetch、PAT 変更時の即時 fetch、
 *   content からのリクエストによる手動 fetch を集約する。
 * - content から options ページを開けないため、メッセージで仲介する。
 */

import { createChromeStorage } from "@/shared/storage";
import { createSettingsStore } from "@/shared/settings";
import { createDashboardCache } from "@/shared/dashboard-cache";
import { createGitHubClient } from "@/shared/github";
import type { RuntimeRequest, OpenOptionsResponse, RefreshResult } from "@/shared/messages";
import { createDashboardRefresher } from "./refresher";

const OPTIONS_PATH = "src/options/index.html";
const REFRESH_ALARM = "bgd:refresh-dashboard";
const REFRESH_PERIOD_MIN = 30;

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

const ensureRefreshAlarm = async (): Promise<void> => {
  const existing = await chrome.alarms.get(REFRESH_ALARM);
  if (!existing) {
    await chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_PERIOD_MIN });
  }
};

chrome.runtime.onInstalled.addListener(() => {
  void ensureRefreshAlarm();
  // 初回インストールやアップデート直後は古いキャッシュを最新化する
  void refresher.refresh();
});

chrome.runtime.onStartup?.addListener?.(() => {
  void ensureRefreshAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) void refresher.refresh();
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
    void refresher.refresh().then((res: RefreshResult) => sendResponse(res));
    return true;
  }
  return false;
});

chrome.action?.onClicked?.addListener(() => {
  void focusOrCreateOptionsTab().catch((err: unknown) => {
    console.warn("[bgd] open-options (action) failed:", err);
  });
});
