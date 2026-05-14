import { describe, expect, it, vi } from "vitest";
import { createAppContext } from "./app-context";
import { createMemoryStorage } from "@/shared/storage";
import { DEFAULT_SETTINGS } from "@/shared/settings";

describe("createAppContext", () => {
  it("wires settings/viewStats/dashboardCache against the provided storage", async () => {
    const storage = createMemoryStorage();
    const app = createAppContext({ storage });

    // 既定 settings が読み出せる
    expect(await app.settings.get()).toEqual(DEFAULT_SETTINGS);

    // 同じ storage に書いたものが各ストアから観測できる
    await storage.set("settings", { pat: "ghp_abc" });
    expect((await app.settings.get()).pat).toBe("ghp_abc");

    expect(await app.viewStats.load()).toEqual([]);
    expect(await app.dashboardCache.load()).toBeNull();
  });

  it("uses the injected github factory", () => {
    const storage = createMemoryStorage();
    const fakeClient = {
      fetchDashboard: vi.fn(),
      fetchViewer: vi.fn(),
      fetchWritableRepos: vi.fn(),
    };
    const githubFactory = vi.fn(() => fakeClient);
    const app = createAppContext({ storage, github: githubFactory });
    const c = app.github("ghp_x");
    expect(githubFactory).toHaveBeenCalledWith("ghp_x");
    expect(c).toBe(fakeClient);
  });
});
