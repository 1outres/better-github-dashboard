import { afterEach, describe, expect, it, vi } from "vitest";
import { startRouter, type RouterDisposer } from "./router";

let stop: RouterDisposer | null = null;

afterEach(() => {
  stop?.();
  stop = null;
  history.replaceState(null, "", "/");
});

const start = () => {
  const callback = vi.fn();
  stop = startRouter(callback);
  callback.mockClear();
  return callback;
};

const paths = (callback: ReturnType<typeof vi.fn>) =>
  callback.mock.calls.map(([url]) => (url as URL).pathname);

describe("startRouter", () => {
  it("fires once for the current URL on start", () => {
    const callback = vi.fn();
    stop = startRouter(callback);
    expect(callback).toHaveBeenCalledOnce();
  });

  it("fires on turbo:load", () => {
    const callback = start();
    history.pushState(null, "", "/o/r");
    document.dispatchEvent(new Event("turbo:load"));
    expect(paths(callback)).toEqual(["/o/r"]);
  });

  it("fires on soft-nav:end, which GitHub React pages use instead of turbo:load", () => {
    const callback = start();
    history.pushState(null, "", "/o/r/issues/1");
    document.dispatchEvent(new Event("soft-nav:end"));
    expect(paths(callback)).toEqual(["/o/r/issues/1"]);
  });

  it("fires on popstate", () => {
    const callback = start();
    history.pushState(null, "", "/o/r/pulls");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(paths(callback)).toEqual(["/o/r/pulls"]);
  });

  it("does not fire twice for the same URL", () => {
    const callback = start();
    history.pushState(null, "", "/o/r");
    window.dispatchEvent(new PopStateEvent("popstate"));
    document.dispatchEvent(new Event("soft-nav:end"));
    expect(callback).toHaveBeenCalledOnce();
  });

  it("stops listening after dispose", () => {
    const callback = start();
    stop?.();
    stop = null;
    history.pushState(null, "", "/o/r");
    document.dispatchEvent(new Event("soft-nav:end"));
    expect(callback).not.toHaveBeenCalled();
  });
});
