import { render } from "solid-js/web";
import type { Feature } from "../../runtime/feature";
import { waitFor } from "../../runtime/dom";
import { hideBootOverlay } from "../../initial-style";
import { DashboardApp } from "./dashboard-app";
import dashboardCss from "./dashboard.css?inline";

const HOST_ID = "bgd-dashboard-host";
const STYLE_ID = "bgd-page-overrides";
const TARGET_SELECTOR = "#dashboard";

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

export const dashboardFeature: Feature = {
  id: "dashboard",
  match: (url) => url.pathname === "/" || url.pathname === "",
  mount: async (ctx) => {
    ctx.log.log("mounting");

    const target = await waitFor<HTMLElement>(TARGET_SELECTOR, { signal: ctx.signal });
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
    requestAnimationFrame(() => hideBootOverlay());
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
  },
};
