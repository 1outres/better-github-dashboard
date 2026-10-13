import { render } from "solid-js/web";
import type { Feature } from "../../runtime/feature";
import { GlobalSearchOverlay } from "./overlay";
import overlayCss from "./overlay.css?inline";

const HOST_ID = "bgd-global-search-host";

let dispose: (() => void) | null = null;
let host: HTMLDivElement | null = null;

/**
 * Cmd+K でどのページからも開ける検索オーバーレイ。
 * dashboard feature とは独立して mount され、ナビゲーション中も常駐する。
 */
export const globalSearchFeature: Feature = {
  id: "global-search",
  match: (url) => url.hostname === "github.com",
  mount: (ctx) => {
    if (document.getElementById(HOST_ID)) return;
    ctx.log.log("mounting");

    host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = overlayCss;
    shadow.appendChild(style);

    const root = document.createElement("div");
    shadow.appendChild(root);

    // GitHub rebuilds <body> on Turbo navigations, and sometimes right after page load
    // without firing turbo:load. A host inside <body> is lost then, and Cmd+K shows nothing.
    // <html> itself is never replaced, so the host stays in the page.
    document.documentElement.appendChild(host);

    dispose = render(() => <GlobalSearchOverlay app={ctx.app} />, root);
  },
  unmount: () => {
    dispose?.();
    dispose = null;
    host?.remove();
    host = null;
  },
};
