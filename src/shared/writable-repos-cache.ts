import type { Repo } from "./github";
import type { StorageBackend } from "./storage";
import { createSnapshotCache, type SnapshotCache } from "./snapshot-cache";

export type WritableReposCache = SnapshotCache<Repo[]>;

export const createWritableReposCache = (storage: StorageBackend): WritableReposCache =>
  createSnapshotCache<Repo[]>({ storage, key: "writable-repos", version: 1 });
