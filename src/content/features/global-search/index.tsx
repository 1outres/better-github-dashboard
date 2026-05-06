import { render } from "solid-js/web";
import type { Feature } from "../../runtime/feature";
import { GlobalSearchOverlay } from "./overlay";
import overlayCss from "./overlay.css?inline";

const HOST_ID = "bgd-global-search-host";

let dispose: (() => void) | null = null;
let host: HTMLDivElement | null = null;

const attachToBody = (el: HTMLElement): void => {
  if (document.body) {
    document.body.appendChild(el);
    return;
  }
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      if (!el.isConnected) document.body?.appendChild(el);
    },
    { once: true },
  );
};

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

    attachToBody(host);

    dispose = render(() => <GlobalSearchOverlay />, root);

    // GitHub の Turbo はナビゲーション時に <body> の中身を丸ごと差し替えるため、
    // body 直下に append した host も巻き添えで外れる。Solid のレンダ・signal・
    // window keydown は JS コンテキストに残り Cmd+K 自体は反応するが、host が DOM に
    // 居ないので何も見えなくなる（特に PR ページ等から戻ったときに発生）。
    // ナビゲーションのたびに繋ぎ直す。
    const reattachIfDetached = () => {
      if (host && !host.isConnected) attachToBody(host);
    };
    document.addEventListener("turbo:load", reattachIfDetached, { signal: ctx.signal });
    // bfcache 復元時の保険（pageshow.persisted は body 復元後に発火する）。
    window.addEventListener(
      "pageshow",
      (e) => {
        if ((e as PageTransitionEvent).persisted) reattachIfDetached();
      },
      { signal: ctx.signal },
    );
  },
  unmount: () => {
    dispose?.();
    dispose = null;
    host?.remove();
    host = null;
  },
};
