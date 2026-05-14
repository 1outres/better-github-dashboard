import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@solidjs/testing-library";
import { SearchResultRow } from "./search-result";
import type { RankedItem } from "@/shared/search-items";

const makeResult = (overrides: Partial<RankedItem["item"]> = {}): RankedItem => ({
  item: {
    kind: "repo",
    label: "octocat/hello",
    sub: "demo",
    url: "https://github.com/octocat/hello",
    ...overrides,
  },
  score: 0,
  matches: { label: [], sub: [] },
});

describe("SearchResultRow", () => {
  it("renders the item's label, sub and link", () => {
    const { container } = render(() => (
      <SearchResultRow
        result={makeResult()}
        active={false}
        itemClass="row"
        onMouseEnter={() => {}}
        onSelect={() => {}}
      />
    ));
    const anchor = container.querySelector("a")!;
    expect(anchor.getAttribute("href")).toBe("https://github.com/octocat/hello");
    expect(anchor.textContent).toContain("octocat/hello");
    expect(anchor.textContent).toContain("demo");
  });

  it("applies the active class when active", () => {
    const { container } = render(() => (
      <SearchResultRow
        result={makeResult()}
        active={true}
        itemClass="row"
        activeClass="is-active"
        onMouseEnter={() => {}}
        onSelect={() => {}}
      />
    ));
    expect(container.querySelector("a")?.className).toContain("is-active");
  });

  it("invokes onSelect on mousedown, preventing default to fire before blur", () => {
    const onSelect = vi.fn();
    const { container } = render(() => (
      <SearchResultRow
        result={makeResult()}
        active={false}
        itemClass="row"
        onMouseEnter={() => {}}
        onSelect={onSelect}
      />
    ));
    const a = container.querySelector("a")!;
    const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(ev.defaultPrevented).toBe(true);
  });

  it("invokes onMouseEnter when hovering", () => {
    const onMouseEnter = vi.fn();
    const { container } = render(() => (
      <SearchResultRow
        result={makeResult()}
        active={false}
        itemClass="row"
        onMouseEnter={onMouseEnter}
        onSelect={() => {}}
      />
    ));
    fireEvent.mouseEnter(container.querySelector("a")!);
    expect(onMouseEnter).toHaveBeenCalledOnce();
  });

  it("renders the correct kind class for PR / Issue / repo", () => {
    const pr = makeResult({ kind: "PullRequest" });
    const issue = makeResult({ kind: "Issue" });
    const repo = makeResult({ kind: "repo" });
    const out = (r: RankedItem) =>
      render(() => (
        <SearchResultRow
          result={r}
          active={false}
          itemClass="row"
          onMouseEnter={() => {}}
          onSelect={() => {}}
        />
      )).container.querySelector(".kind")!.className;
    expect(out(pr)).toContain("pr");
    expect(out(issue)).toContain("issue");
    expect(out(repo)).toContain("repo");
  });
});
