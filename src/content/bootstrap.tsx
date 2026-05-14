import { FeatureManager } from "./runtime/feature-manager";
import { startRouter } from "./runtime/router";
import { rootLogger } from "./runtime/logger";
import { createAppContext } from "./runtime/app-context";
import { dashboardFeature } from "./features/dashboard";
import { globalSearchFeature } from "./features/global-search";
import { createViewTracker } from "./view-tracker";

const app = createAppContext({ log: rootLogger });

const manager = new FeatureManager(app, rootLogger);
manager.register(globalSearchFeature);
manager.register(dashboardFeature);

const tracker = createViewTracker(app);

startRouter((url) => {
  void manager.sync(url);
  tracker.record(url);
});

window.addEventListener("beforeunload", () => {
  void manager.destroy();
});

/** bfcache から復元された場合は再 mount を促す。
 *  GitHub の turbo cache や戻る/進むで bgd-host が消えていた場合への保険。
 *  boot overlay の show/hide は dashboard feature 自身が pageshow を購読して扱う。 */
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  void manager.sync(new URL(location.href));
});
