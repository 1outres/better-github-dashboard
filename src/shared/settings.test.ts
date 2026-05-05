import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "./storage";
import { DEFAULT_SETTINGS, createSettingsStore } from "./settings";

describe("SettingsStore", () => {
  it("returns defaults when nothing is stored", async () => {
    const store = createSettingsStore(createMemoryStorage());
    expect(await store.get()).toEqual(DEFAULT_SETTINGS);
  });

  it("merges defaults with stored partial state", async () => {
    const storage = createMemoryStorage({ settings: { pat: "ghp_xxx" } });
    const store = createSettingsStore(storage);
    const s = await store.get();
    expect(s.pat).toBe("ghp_xxx");
    expect(s.repoCardCount).toBe(DEFAULT_SETTINGS.repoCardCount);
  });

  it("set merges patch into existing state", async () => {
    const store = createSettingsStore(createMemoryStorage());
    await store.set({ pat: "ghp_a" });
    const next = await store.set({ pinnedRepos: ["a/b"] });
    expect(next.pat).toBe("ghp_a");
    expect(next.pinnedRepos).toEqual(["a/b"]);
  });

  it("notifies subscribers with merged settings", async () => {
    const store = createSettingsStore(createMemoryStorage());
    const calls: string[] = [];
    const off = store.subscribe((s) => calls.push(s.pat ?? ""));
    await store.set({ pat: "ghp_a" });
    expect(calls).toContain("ghp_a");
    off();
    await store.set({ pat: "ghp_b" });
    expect(calls).not.toContain("ghp_b");
  });
});
