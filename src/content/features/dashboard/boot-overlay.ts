/**
 * ダッシュボード差し替え準備中に表示する全面オーバーレイの DOM 操作。
 * CSS は src/content/initial-style.ts が document_start で先に注入する前提。
 *
 * `dashboard` feature が責任を持って show/hide する単一のチャンネル。
 * 旧実装ではグローバル helper として 5 箇所から呼ばれていたため hide 漏れが起きやすかった。
 */
const OVERLAY_ID = "bgd-boot-overlay";

const isDashboardPath = (pathname: string): boolean =>
  pathname === "/" || pathname === "";

/** target URL が dashboard 行きか、または現在地点が dashboard か。 */
export const shouldOverlayFor = (target?: string | URL): boolean => {
  if (isDashboardPath(location.pathname)) return true;
  if (!target) return false;
  try {
    const u = target instanceof URL ? target : new URL(target, location.href);
    if (u.origin !== location.origin) return false;
    return isDashboardPath(u.pathname);
  } catch {
    return false;
  }
};

export const bootOverlay = {
  show(target?: string | URL): void {
    if (!shouldOverlayFor(target)) return;
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      delete existing.dataset["fading"];
      return;
    }
    const root = document.documentElement;
    if (!root) {
      queueMicrotask(() => bootOverlay.show(target));
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
  },

  hide(): void {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    overlay.dataset["fading"] = "true";
    setTimeout(() => overlay.remove(), 200);
  },

  /** テスト・デバッグ用に現在の overlay 要素を返す。なければ null。 */
  current(): HTMLElement | null {
    return document.getElementById(OVERLAY_ID);
  },
};
