export type Target = "chrome" | "firefox";

export const isTarget = (v: string | undefined): v is Target =>
  v === "chrome" || v === "firefox";

/**
 * @crxjs が出力した dist/manifest.json を Firefox 用に書き換える。
 *
 * - Firefox MV3 には service worker が存在しないため、
 *   `background.service_worker` を `background.scripts` に差し替える。
 *   `service-worker-loader.js` は単なる ESM (`type: "module"`) なので
 *   Firefox 121+ の MV3 event page としてそのまま読み込める。
 * - `browser_specific_settings.gecko.id` が無いと about:debugging で
 *   読み込めないので付与する。
 *
 * `chrome.*` API は Firefox 109+ の MV3 でもそのまま使えるため、
 *   コード側の差し替えは不要。
 */
export const patchManifestForFirefox = (
  manifest: Record<string, unknown>,
): Record<string, unknown> => {
  const bg = manifest.background as
    | { service_worker?: string; type?: string; scripts?: string[] }
    | undefined;
  const next: Record<string, unknown> = { ...manifest };
  if (bg?.service_worker) {
    const { service_worker, ...rest } = bg;
    next.background = { ...rest, scripts: [service_worker] };
  }
  next.browser_specific_settings = {
    gecko: {
      id: "better-github-dashboard@loutres.me",
      // MV3 の `background.scripts` (event page) を type: "module" で扱える最低バージョン。
      strict_min_version: "121.0",
    },
  };
  return next;
};
