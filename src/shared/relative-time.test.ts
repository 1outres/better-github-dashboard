import { describe, expect, it } from "vitest";
import { formatRelative } from "./relative-time";

describe("formatRelative", () => {
  const now = Date.UTC(2026, 4, 5, 12, 0, 0); // 2026-05-05 12:00 UTC

  it("formats hours", () => {
    expect(formatRelative("2026-05-05T09:00:00Z", now)).toMatch(/3 hours ago/);
  });

  it("formats days", () => {
    expect(formatRelative("2026-05-02T12:00:00Z", now)).toMatch(/3 days ago/);
  });

  it("formats yesterday/tomorrow with numeric:auto", () => {
    expect(formatRelative("2026-05-04T12:00:00Z", now)).toMatch(/yesterday/i);
  });

  it("returns empty string for invalid date", () => {
    expect(formatRelative("not-a-date", now)).toBe("");
  });
});
