/**
 * background service worker と他コンテキスト間でやり取りするメッセージの契約。
 * sender 側は requestXxx() を、receiver 側 (background) は RuntimeRequest の
 * discriminated union で switch する。型はこのファイルが唯一の出どころ。
 */

export type OpenOptionsRequest = { type: "open-options" };
export type OpenOptionsResponse = { ok: boolean; error?: string };

/**
 * maxAgeMs を渡すと background は「キャッシュがそれより新しければ fetch しない」
 * 判断をする (refreshIfStale)。省略すると常に fetch を発行する (refresh)。
 */
export type RefreshDashboardRequest = {
  type: "refresh-dashboard";
  maxAgeMs?: number;
};

/** background の refresher が返す結果。手動 refresh のレスポンスにそのまま流す。 */
export type RefreshResult =
  | { ok: true; fetchedAt: number }
  | { ok: false; reason: "no-pat" }
  | { ok: false; reason: "error"; message: string };

export type RuntimeRequest = OpenOptionsRequest | RefreshDashboardRequest;

/**
 * UI 側 (dashboard / overlay / bootstrap) で「最近 fetch していなければ更新」と
 * 判断したいときの共通閾値。content の各所で個別の値を持たないよう、
 * 唯一の参照点としてここに置く。
 */
export const DASHBOARD_STALE_MS = 5 * 60 * 1000;

const isAliveRuntime = (): boolean => {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
};

export const requestOpenOptions = async (): Promise<OpenOptionsResponse> => {
  if (!isAliveRuntime()) return { ok: false, error: "extension context invalidated" };
  try {
    const res = (await chrome.runtime.sendMessage({
      type: "open-options",
    } satisfies OpenOptionsRequest)) as OpenOptionsResponse | undefined;
    return res ?? { ok: false, error: "no response" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

export const requestRefreshDashboard = async (
  opts: { maxAgeMs?: number } = {},
): Promise<RefreshResult> => {
  if (!isAliveRuntime()) return { ok: false, reason: "error", message: "extension context invalidated" };
  const payload: RefreshDashboardRequest =
    opts.maxAgeMs !== undefined
      ? { type: "refresh-dashboard", maxAgeMs: opts.maxAgeMs }
      : { type: "refresh-dashboard" };
  try {
    const res = (await chrome.runtime.sendMessage(payload)) as RefreshResult | undefined;
    return res ?? { ok: false, reason: "error", message: "no response" };
  } catch (err) {
    return { ok: false, reason: "error", message: err instanceof Error ? err.message : String(err) };
  }
};
