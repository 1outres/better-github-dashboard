/**
 * background service worker と他コンテキスト間でやり取りするメッセージの契約。
 * sender 側は requestXxx() を、receiver 側 (background) は RuntimeRequest の
 * discriminated union で switch する。型はこのファイルが唯一の出どころ。
 */

export type OpenOptionsRequest = { type: "open-options" };
export type OpenOptionsResponse = { ok: boolean; error?: string };

export type RefreshDashboardRequest = { type: "refresh-dashboard" };

/** background の refresher が返す結果。手動 refresh のレスポンスにそのまま流す。 */
export type RefreshResult =
  | { ok: true; fetchedAt: number }
  | { ok: false; reason: "no-pat" }
  | { ok: false; reason: "error"; message: string };

export type RuntimeRequest = OpenOptionsRequest | RefreshDashboardRequest;

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

export const requestRefreshDashboard = async (): Promise<RefreshResult> => {
  if (!isAliveRuntime()) return { ok: false, reason: "error", message: "extension context invalidated" };
  try {
    const res = (await chrome.runtime.sendMessage({
      type: "refresh-dashboard",
    } satisfies RefreshDashboardRequest)) as RefreshResult | undefined;
    return res ?? { ok: false, reason: "error", message: "no response" };
  } catch (err) {
    return { ok: false, reason: "error", message: err instanceof Error ? err.message : String(err) };
  }
};
