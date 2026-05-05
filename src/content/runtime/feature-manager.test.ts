import { describe, expect, it, vi } from "vitest";
import { FeatureManager } from "./feature-manager";
import type { Feature } from "./feature";

const makeFeature = (id: string, matches: (url: URL) => boolean): Feature & { mount: ReturnType<typeof vi.fn>; unmount: ReturnType<typeof vi.fn> } => {
  return {
    id,
    match: matches,
    mount: vi.fn(),
    unmount: vi.fn(),
  };
};

describe("FeatureManager", () => {
  it("mounts features whose match returns true", async () => {
    const m = new FeatureManager();
    const f = makeFeature("a", () => true);
    m.register(f);
    await m.sync(new URL("https://github.com/"));
    expect(f.mount).toHaveBeenCalledOnce();
  });

  it("does not mount features whose match returns false", async () => {
    const m = new FeatureManager();
    const f = makeFeature("a", () => false);
    m.register(f);
    await m.sync(new URL("https://github.com/foo"));
    expect(f.mount).not.toHaveBeenCalled();
  });

  it("does not double-mount on repeated sync", async () => {
    const m = new FeatureManager();
    const f = makeFeature("a", () => true);
    m.register(f);
    await m.sync(new URL("https://github.com/"));
    await m.sync(new URL("https://github.com/"));
    expect(f.mount).toHaveBeenCalledOnce();
  });

  it("unmounts when match flips to false", async () => {
    const m = new FeatureManager();
    let on = true;
    const f = makeFeature("a", () => on);
    m.register(f);
    await m.sync(new URL("https://github.com/"));
    on = false;
    await m.sync(new URL("https://github.com/x"));
    expect(f.unmount).toHaveBeenCalledOnce();
  });

  it("aborts the feature signal on unmount", async () => {
    const m = new FeatureManager();
    let signal: AbortSignal | undefined;
    let on = true;
    const f: Feature = {
      id: "a",
      match: () => on,
      mount: (ctx) => {
        signal = ctx.signal;
      },
    };
    m.register(f);
    await m.sync(new URL("https://github.com/"));
    expect(signal?.aborted).toBe(false);
    on = false;
    await m.sync(new URL("https://github.com/x"));
    expect(signal?.aborted).toBe(true);
  });

  it("rejects duplicate ids", () => {
    const m = new FeatureManager();
    m.register(makeFeature("a", () => true));
    expect(() => m.register(makeFeature("a", () => true))).toThrow();
  });

  it("destroy unmounts all", async () => {
    const m = new FeatureManager();
    const f1 = makeFeature("a", () => true);
    const f2 = makeFeature("b", () => true);
    m.register(f1);
    m.register(f2);
    await m.sync(new URL("https://github.com/"));
    await m.destroy();
    expect(f1.unmount).toHaveBeenCalledOnce();
    expect(f2.unmount).toHaveBeenCalledOnce();
  });
});
