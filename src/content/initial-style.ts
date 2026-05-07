/**
 * content_scripts は run_at: document_start で実行されるため、
 * GitHub の DOM が描画される *前* に上書き CSS を注入できる。
 * これで「起動直後に一瞬本来の GitHub ダッシュボードが見える」FOUC を抑える。
 *
 * dashboard 以外のページでも無害（マッチする要素がないだけ）。
 */
const STYLE_ID = "bgd-initial-style";
const OVERLAY_ID = "bgd-boot-overlay";

const INITIAL_CSS = `
  #dashboard,
  aside.feed-left-sidebar,
  aside.feed-right-sidebar,
  .dashboard-sidebar,
  .copilotPreview__container {
    visibility: hidden !important;
  }

  #${OVERLAY_ID} {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background: #0d1117;
    color: #e6edf3;
    font:
      14px/1.5 -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      system-ui,
      sans-serif;
    pointer-events: none;
    transition: opacity 0.18s;
  }
  #${OVERLAY_ID}[data-fading="true"] { opacity: 0; }
  #${OVERLAY_ID} .bgd-boot-title {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  #${OVERLAY_ID} .bgd-boot-spinner {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid #30363d;
    border-top-color: #2f81f7;
    animation: bgd-boot-spin 0.8s linear infinite;
  }
  @media (prefers-color-scheme: light) {
    #${OVERLAY_ID} { background: #ffffff; color: #1f2328; }
    #${OVERLAY_ID} .bgd-boot-spinner { border-color: #d1d9e0; border-top-color: #0969da; }
  }
  @keyframes bgd-boot-spin { to { transform: rotate(360deg); } }
`;

const isDashboardPath = (): boolean => {
  return location.pathname === "/" || location.pathname === "";
};

/** 出発元か到着先が dashboard の時のみ true。
 *  起動時は location が出発元、ナビゲーション中も同じ。
 *  GitHub 内の他ページ間（例: リポジトリ→issues）は overlay 不要。 */
const shouldOverlayForUrl = (url?: string | URL): boolean => {
  if (isDashboardPath()) return true;
  if (url) {
    try {
      const u = url instanceof URL ? url : new URL(url, location.href);
      if (u.origin !== location.origin) return false;
      return u.pathname === "/" || u.pathname === "";
    } catch {
      return false;
    }
  }
  return false;
};

export const injectInitialStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const root = document.documentElement;
  if (!root) {
    queueMicrotask(injectInitialStyle);
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = INITIAL_CSS;
  root.appendChild(style);
};

export const showBootOverlay = (target?: string | URL): void => {
  if (!shouldOverlayForUrl(target)) return;
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    delete existing.dataset["fading"];
    return;
  }
  const root = document.documentElement;
  if (!root) {
    queueMicrotask(() => showBootOverlay(target));
    return;
  }
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  const spinner = document.createElement("div");
  spinner.className = "bgd-boot-spinner";
  const title = document.createElement("div");
  title.className = "bgd-boot-title";
  title.textContent = "Better GitHub Dashboard";
  overlay.append(spinner, title);
  root.appendChild(overlay);
};

export const hideBootOverlay = (): void => {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;
  overlay.dataset["fading"] = "true";
  setTimeout(() => overlay.remove(), 200);
};
