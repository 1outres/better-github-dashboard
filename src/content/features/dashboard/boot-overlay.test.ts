import { afterEach, describe, expect, it } from "vitest";
import { bootOverlay, shouldOverlayFor } from "./boot-overlay";

afterEach(() => {
  document.documentElement.innerHTML = "<head></head><body></body>";
});

const setLocation = (path: string) => {
  // jsdom: history.pushState で location.pathname を変更
  window.history.pushState({}, "", path);
};

describe("shouldOverlayFor", () => {
  it("現在地が dashboard ルートなら true", () => {
    setLocation("/");
    expect(shouldOverlayFor()).toBe(true);
  });

  it("現在地が dashboard 以外でも、target が dashboard なら true", () => {
    setLocation("/some/repo");
    expect(shouldOverlayFor("/")).toBe(true);
  });

  it("現在地も target も dashboard でなければ false", () => {
    setLocation("/some/repo");
    expect(shouldOverlayFor("/other/repo")).toBe(false);
  });

  it("クロスオリジン URL は false", () => {
    setLocation("/some/repo");
    expect(shouldOverlayFor("https://example.com/")).toBe(false);
  });
});

describe("bootOverlay", () => {
  it("dashboard 上で show すると要素が生える", () => {
    setLocation("/");
    bootOverlay.show();
    expect(bootOverlay.current()).not.toBeNull();
  });

  it("dashboard 外で show しても要素は生えない", () => {
    setLocation("/foo/bar");
    bootOverlay.show();
    expect(bootOverlay.current()).toBeNull();
  });

  it("dashboard 外でも、target が dashboard なら show する", () => {
    setLocation("/foo/bar");
    bootOverlay.show("/");
    expect(bootOverlay.current()).not.toBeNull();
  });

  it("二重 show は同じ要素を保ち fading を解除する", () => {
    setLocation("/");
    bootOverlay.show();
    const first = bootOverlay.current()!;
    first.dataset["fading"] = "true";
    bootOverlay.show();
    expect(bootOverlay.current()).toBe(first);
    expect(first.dataset["fading"]).toBeUndefined();
  });

  it("hide で要素は fading 状態に入り、setTimeout 後に消える", async () => {
    setLocation("/");
    bootOverlay.show();
    expect(bootOverlay.current()).not.toBeNull();
    bootOverlay.hide();
    expect(bootOverlay.current()?.dataset["fading"]).toBe("true");
    await new Promise((r) => setTimeout(r, 250));
    expect(bootOverlay.current()).toBeNull();
  });

  it("hide は overlay 不在でもエラーにならない", () => {
    setLocation("/");
    expect(() => bootOverlay.hide()).not.toThrow();
  });
});
