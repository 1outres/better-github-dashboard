import { describe, expect, it } from "vitest";
import { isUnresolved, toRefreshFailure } from "./refresh-failure";

describe("toRefreshFailure", () => {
  it("keeps the message and time of a failed refresh", () => {
    const result = { ok: false, reason: "error", message: "Bad credentials" } as const;
    expect(toRefreshFailure(result, 100)).toEqual({ message: "Bad credentials", failedAt: 100 });
  });

  it("is null for a successful refresh", () => {
    expect(toRefreshFailure({ ok: true, fetchedAt: 1 }, 100)).toBeNull();
  });

  it("is null when no token is set, because the setup screen already covers it", () => {
    expect(toRefreshFailure({ ok: false, reason: "no-pat" }, 100)).toBeNull();
  });
});

describe("isUnresolved", () => {
  const failure = { message: "x", failedAt: 100 };

  it("is true while the cached data is older than the failure", () => {
    expect(isUnresolved(failure, 50)).toBe(true);
  });

  it("is true when nothing is cached", () => {
    expect(isUnresolved(failure, null)).toBe(true);
  });

  it("is false once newer data is cached, for example by a refresh from another tab", () => {
    expect(isUnresolved(failure, 150)).toBe(false);
  });

  it("is false without a failure", () => {
    expect(isUnresolved(null, 50)).toBe(false);
  });
});
