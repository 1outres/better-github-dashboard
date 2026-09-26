import type { RefreshResult } from "@/shared/messages";

export type RefreshFailure = {
  message: string;
  failedAt: number;
};

export const toRefreshFailure = (result: RefreshResult, now: number): RefreshFailure | null =>
  !result.ok && result.reason === "error" ? { message: result.message, failedAt: now } : null;

/** A failure stops mattering once data fetched after it is in the cache. */
export const isUnresolved = (
  failure: RefreshFailure | null,
  fetchedAt: number | null,
): failure is RefreshFailure =>
  failure !== null && (fetchedAt === null || fetchedAt < failure.failedAt);
