import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@solidjs/testing-library";
import { RefreshAlert } from "./refresh-alert";

describe("RefreshAlert", () => {
  it("shows the error and how old the shown data is", () => {
    const now = Date.now();
    const threeHoursAgo = now - 3 * 60 * 60 * 1000;
    const { getByRole } = render(() => (
      <RefreshAlert message="Bad credentials" fetchedAt={threeHoursAgo} onRetry={() => {}} />
    ));
    const alert = getByRole("alert");
    expect(alert.textContent).toContain("Bad credentials");
    expect(alert.textContent).toContain("3 hours ago");
  });

  it("calls onRetry when the retry button is clicked", () => {
    const onRetry = vi.fn();
    const { getByRole } = render(() => (
      <RefreshAlert message="x" fetchedAt={Date.now()} onRetry={onRetry} />
    ));
    fireEvent.click(getByRole("button"));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
