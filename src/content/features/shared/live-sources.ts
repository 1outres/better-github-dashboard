import { createMemo, createSignal, onCleanup, type Accessor } from "solid-js";
import type { DashboardData, Repo } from "@/shared/github";
import type { CandidateSources } from "@/shared/repo-candidates";
import type { Snapshot } from "@/shared/snapshot-cache";
import type { ViewEntry } from "@/shared/view-stats";
import type { AppContext } from "../../runtime/app-context";

export type LiveSources = {
  dashboard: Accessor<Snapshot<DashboardData> | null>;
  sources: Accessor<CandidateSources>;
};

/**
 * Loads the cached dashboard, the writable repo list, and the view history,
 * and keeps them in sync with storage until the owning reactive scope is disposed.
 */
export const createLiveSources = (
  app: Pick<AppContext, "dashboardCache" | "writableReposCache" | "viewStats">,
): LiveSources => {
  const [dashboard, setDashboard] = createSignal<Snapshot<DashboardData> | null>(null);
  const [writableRepos, setWritableRepos] = createSignal<Repo[]>([]);
  const [viewStats, setViewStats] = createSignal<ViewEntry[]>([]);

  const loadDashboard = async () => setDashboard(await app.dashboardCache.load());
  const loadWritableRepos = async () =>
    setWritableRepos((await app.writableReposCache.load())?.data ?? []);
  const loadViewStats = async () => setViewStats(await app.viewStats.load());

  const unsubscribers = [
    app.dashboardCache.subscribe(() => void loadDashboard()),
    app.writableReposCache.subscribe(() => void loadWritableRepos()),
    app.viewStats.subscribe(() => void loadViewStats()),
  ];
  onCleanup(() => unsubscribers.forEach((unsubscribe) => unsubscribe()));

  void loadDashboard();
  void loadWritableRepos();
  void loadViewStats();

  const sources = createMemo<CandidateSources>(() => ({
    dashboard: dashboard()?.data ?? null,
    writableRepos: writableRepos(),
    viewStats: viewStats(),
  }));

  return { dashboard, sources };
};
