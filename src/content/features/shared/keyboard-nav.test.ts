import { describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { createArrowNavHandler } from "./keyboard-nav";

const press = (key: string): KeyboardEvent => {
  // jsdom KeyboardEvent: preventDefault は記録される
  return new KeyboardEvent("keydown", { key, cancelable: true });
};

describe("createArrowNavHandler", () => {
  it("ArrowDown で active が末尾を超えないように 1 ずつ進む", () => {
    const items = () => ["a", "b", "c"] as const;
    const [active, setActive] = createSignal(0);
    const onSelect = vi.fn();
    const handle = createArrowNavHandler(items, active, setActive, onSelect);

    expect(handle(press("ArrowDown"))).toBe(true);
    expect(active()).toBe(1);
    handle(press("ArrowDown"));
    expect(active()).toBe(2);
    handle(press("ArrowDown"));
    expect(active()).toBe(2);
  });

  it("ArrowUp で active が 0 を下回らない", () => {
    const items = () => ["a", "b"] as const;
    const [active, setActive] = createSignal(1);
    const handle = createArrowNavHandler(items, active, setActive, vi.fn());

    handle(press("ArrowUp"));
    expect(active()).toBe(0);
    handle(press("ArrowUp"));
    expect(active()).toBe(0);
  });

  it("Enter で active の要素を onSelect に渡す", () => {
    const items = () => ["a", "b", "c"] as const;
    const [active, setActive] = createSignal(2);
    const onSelect = vi.fn();
    const handle = createArrowNavHandler(items, active, setActive, onSelect);

    expect(handle(press("Enter"))).toBe(true);
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("Enter で items が空のときは onSelect を呼ばず false を返す", () => {
    const items = () => [] as const;
    const [active, setActive] = createSignal(0);
    const onSelect = vi.fn();
    const handle = createArrowNavHandler(items, active, setActive, onSelect);

    expect(handle(press("Enter"))).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("関係ないキーは false を返す", () => {
    const items = () => ["a"] as const;
    const [active, setActive] = createSignal(0);
    const handle = createArrowNavHandler(items, active, setActive, vi.fn());

    expect(handle(press("Escape"))).toBe(false);
    expect(handle(press("k"))).toBe(false);
  });

  it("ハンドル成功時に preventDefault が呼ばれる", () => {
    const items = () => ["a", "b"] as const;
    const [active, setActive] = createSignal(0);
    const handle = createArrowNavHandler(items, active, setActive, vi.fn());

    const ev = press("ArrowDown");
    const spy = vi.spyOn(ev, "preventDefault");
    handle(ev);
    expect(spy).toHaveBeenCalled();
  });
});
