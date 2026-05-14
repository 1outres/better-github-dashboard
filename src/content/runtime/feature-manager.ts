import type { Feature, FeatureContext, FeatureInitContext } from "./feature";
import { type Logger, rootLogger } from "./logger";
import type { AppContext } from "./app-context";

type Mounted = {
  feature: Feature;
  controller: AbortController;
};

export class FeatureManager {
  private readonly features: Feature[] = [];
  private readonly mounted = new Map<string, Mounted>();
  private readonly inited = new Map<string, AbortController>();
  private readonly log: Logger;
  private readonly app: AppContext;

  constructor(app: AppContext, log: Logger = rootLogger) {
    this.app = app;
    this.log = log.child("features");
  }

  register(feature: Feature): void {
    if (this.features.some((f) => f.id === feature.id)) {
      throw new Error(`Feature already registered: ${feature.id}`);
    }
    this.features.push(feature);
    if (feature.init) {
      const ac = new AbortController();
      this.inited.set(feature.id, ac);
      const ctx: FeatureInitContext = {
        signal: ac.signal,
        log: this.log.child(`${feature.id}:init`),
        app: this.app,
      };
      // init は例外を吐いても他 feature を巻き込まないように catch する
      void Promise.resolve()
        .then(() => feature.init!(ctx))
        .catch((err) => this.log.error(`init failed: ${feature.id}`, err));
    }
  }

  async sync(url: URL): Promise<void> {
    for (const feature of this.features) {
      const matches = feature.match(url);
      const isMounted = this.mounted.has(feature.id);
      if (matches && !isMounted) {
        await this.mountOne(feature, url);
      } else if (!matches && isMounted) {
        await this.unmountOne(feature.id);
      }
    }
  }

  async destroy(): Promise<void> {
    for (const ac of this.inited.values()) ac.abort();
    this.inited.clear();
    const ids = [...this.mounted.keys()];
    await Promise.all(ids.map((id) => this.unmountOne(id)));
  }

  private async mountOne(feature: Feature, url: URL): Promise<void> {
    const controller = new AbortController();
    const ctx: FeatureContext = {
      url,
      signal: controller.signal,
      log: this.log.child(feature.id),
      app: this.app,
    };
    this.mounted.set(feature.id, { feature, controller });
    try {
      await feature.mount(ctx);
    } catch (err) {
      this.log.error(`mount failed: ${feature.id}`, err);
      controller.abort();
      this.mounted.delete(feature.id);
    }
  }

  private async unmountOne(id: string): Promise<void> {
    const m = this.mounted.get(id);
    if (!m) return;
    this.mounted.delete(id);
    m.controller.abort();
    try {
      await m.feature.unmount?.();
    } catch (err) {
      this.log.error(`unmount failed: ${id}`, err);
    }
  }
}
