import { render } from "solid-js/web";
import type { Feature } from "../../runtime/feature";
import { waitFor } from "../../runtime/dom";
import { bootOverlay } from "./boot-overlay";
import { DashboardApp } from "./dashboard-app";
import dashboardCss from "./dashboard.css?inline";

const HOST_ID = "bgd-dashboard-host";
const STYLE_ID = "bgd-page-overrides";
const TARGET_SELECTOR = "#dashboard";
const MOUNT_TIMEOUT_MS = 15_000;

/**
 * 既存ダッシュボード周辺のレイアウト要素を打ち消す。
 * #dashboard だけを置換しても、左右サイドバーが残ると中央寄せの狭いカラムになるため、
 * 「ガラッと置換」を成立させるために body スコープで非表示にする。
 */
const PAGE_OVERRIDE_CSS = `
  aside.feed-left-sidebar,
  aside.feed-right-sidebar,
  .dashboard-sidebar { display: none !important; }
  /* メインカラムを画面いっぱいに広げる（dashboard 親の Bootstrap 風グリッドを打ち消す） */
  #${HOST_ID} { width: 100% !important; max-width: none !important; }
  body:has(#${HOST_ID}) main > div,
  body:has(#${HOST_ID}) main > div > div {
    max-width: none !important;
    width: 100% !important;
  }
`;

let dispose: (() => void) | null = null;
let originalTarget: { node: Element; parent: Node | null; nextSibling: Node | null } | null = null;
let injectedStyle: HTMLStyleElement | null = null;

const isDashboardUrl = (url?: string | URL): boolean => {
  if (!url) return location.pathname === "/" || location.pathname === "";
  try {
    const u = url instanceof URL ? url : new URL(url, location.href);
    return u.origin === location.origin && (u.pathname === "/" || u.pathname === "");
  } catch {
    return false;
  }
};

type TurboFetchEvent = Event & { detail?: { url?: string | URL } };

export const dashboardFeature: Feature = {
  id: "dashboard",
  match: (url) => url.pathname === "/" || url.pathname === "",

  /**
   * boot overlay の制御をすべてこの feature が持つ。
   * - turbo:before-fetch-request: ダッシュボードに向かう遷移なら出す
   * - turbo:load: ダッシュボード以外に到着していたら消す
   * - turbo:fetch-request-error: 遷移失敗したら消す
   * - pageshow.persisted: bfcache 復元時に dashboard なら出し直す
   *
   * mount/unmount での show/hide と合わせ、5 箇所に分散していた制御を 1 ファイルに集約する。
   */
  init: ({ signal }) => {
    document.addEventListener(
      "turbo:before-fetch-request",
      (e: Event) => {
        const target = (e as TurboFetchEvent).detail?.url;
        if (isDashboardUrl(target)) bootOverlay.show(target);
      },
      { signal },
    );

    document.addEventListener(
      "turbo:load",
      () => {
        if (!isDashboardUrl()) bootOverlay.hide();
      },
      { signal },
    );

    document.addEventListener(
      "turbo:fetch-request-error",
      () => bootOverlay.hide(),
      { signal },
    );

    window.addEventListener(
      "pageshow",
      (e) => {
        if ((e as PageTransitionEvent).persisted && isDashboardUrl()) bootOverlay.show();
      },
      { signal },
    );
  },

  mount: async (ctx) => {
    ctx.log.log("mounting");
    bootOverlay.show();

    try {
      const target = await waitFor<HTMLElement>(TARGET_SELECTOR, {
        signal: ctx.signal,
        timeout: MOUNT_TIMEOUT_MS,
      });
      if (document.getElementById(HOST_ID)) return;

      // ページ側へ override CSS を1回だけ注入（既存サイドバー非表示・幅制限解除）
      if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = PAGE_OVERRIDE_CSS;
        document.head.appendChild(style);
        injectedStyle = style;
      }

      const host = document.createElement("div");
      host.id = HOST_ID;
      const shadow = host.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = dashboardCss;
      shadow.appendChild(style);

      const root = document.createElement("div");
      shadow.appendChild(root);

      originalTarget = {
        node: target,
        parent: target.parentNode,
        nextSibling: target.nextSibling,
      };
      target.replaceWith(host);

      dispose = render(() => <DashboardApp shadowRoot={shadow} app={ctx.app} />, root);

      // bgd-host のレンダリングが落ち着いた次フレームで overlay を消す
      requestAnimationFrame(() => bootOverlay.hide());
    } catch (err) {
      // タイムアウトや abort で抜けてきても、永久に overlay が残らないように必ず消す
      bootOverlay.hide();
      throw err;
    }
  },

  unmount: () => {
    dispose?.();
    dispose = null;
    injectedStyle?.remove();
    injectedStyle = null;
    const host = document.getElementById(HOST_ID);
    if (host && originalTarget?.parent) {
      if (originalTarget.nextSibling) {
        originalTarget.parent.insertBefore(originalTarget.node, originalTarget.nextSibling);
      } else {
        originalTarget.parent.appendChild(originalTarget.node);
      }
      host.remove();
    }
    originalTarget = null;
    // dashboard を離れる時点でまだ overlay が残っていた場合の保険
    bootOverlay.hide();
  },
};
