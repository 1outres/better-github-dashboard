import { FeatureManager } from "./runtime/feature-manager";
import { startRouter } from "./runtime/router";
import { rootLogger } from "./runtime/logger";
import { dashboardFeature } from "./features/dashboard";
import { hideBootOverlay, showBootOverlay } from "./initial-style";

const manager = new FeatureManager(rootLogger);
manager.register(dashboardFeature);

startRouter((url) => {
  void manager.sync(url);
});

window.addEventListener("beforeunload", () => {
  void manager.destroy();
});

/** bfcache から復元された場合は再 mount を促す。
 *  GitHub の turbo cache や戻る/進むで bgd-host が消えていた場合への保険。 */
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  showBootOverlay();
  void manager.sync(new URL(location.href));
});

/** GitHub の turbo ナビゲーション中、出発元または到着先が dashboard なら
 *  「中間で本物のダッシュボードが一瞬チラつく」を覆い隠す。 */
type TurboFetchEvent = Event & { detail?: { url?: string | URL } };

document.addEventListener("turbo:before-fetch-request", (e: Event) => {
  const target = (e as TurboFetchEvent).detail?.url;
  showBootOverlay(target);
});

document.addEventListener("turbo:load", () => {
  // dashboardFeature が mount したら自分で overlay を消すので、
  // dashboard 以外（リポジトリページ等）に到着した時のみここで消す
  if (location.pathname !== "/" && location.pathname !== "") {
    hideBootOverlay();
  }
});

document.addEventListener("turbo:fetch-request-error", () => hideBootOverlay());
