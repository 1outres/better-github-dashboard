import { describe, expect, it, vi } from "vitest";
import { createMemoryStorage } from "./storage";
import { createSnapshotCache } from "./snapshot-cache";

const setup = () => {
  const storage = createMemoryStorage();
  const cache = createSnapshotCache<string[]>({ storage, key: "k", version: 3 });
  return { storage, cache };
};

describe("createSnapshotCache", () => {
  it("returns null when nothing is cached", async () => {
    const { cache } = setup();
    expect(await cache.load()).toBeNull();
  });

  it("round-trips data and resolves save with the stored fetchedAt", async () => {
    const { cache } = setup();
    const fetchedAt = await cache.save(["a"]);
    expect(fetchedAt).toBeGreaterThan(0);
    expect(await cache.load()).toEqual({ data: ["a"], fetchedAt });
  });

  it("ignores entries with a mismatched version", async () => {
    const storage = createMemoryStorage({ k: { v: 2, fetchedAt: 1, data: ["old"] } });
    const cache = createSnapshotCache<string[]>({ storage, key: "k", version: 3 });
    expect(await cache.load()).toBeNull();
  });

  it("clear removes the entry", async () => {
    const { cache } = setup();
    await cache.save(["a"]);
    await cache.clear();
    expect(await cache.load()).toBeNull();
  });

  it("notifies subscribers when the entry changes until unsubscribed", async () => {
    const { cache } = setup();
    const listener = vi.fn();
    const unsubscribe = cache.subscribe(listener);
    await cache.save(["a"]);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    await cache.save(["b"]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("does not notify for other keys", async () => {
    const { storage, cache } = setup();
    const listener = vi.fn();
    cache.subscribe(listener);
    await storage.set("other", 1);
    expect(listener).not.toHaveBeenCalled();
  });
});
