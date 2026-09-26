import type { DashboardData } from "./github";
import type { StorageBackend } from "./storage";
import { createSnapshotCache, type SnapshotCache } from "./snapshot-cache";

export type DashboardCache = SnapshotCache<DashboardData>;

export const createDashboardCache = (storage: StorageBackend): DashboardCache =>
  createSnapshotCache<DashboardData>({ storage, key: "dashboard-cache", version: 2 });
