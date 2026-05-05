import { afterEach, describe, expect, it } from "vitest";
import { waitFor } from "./dom";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("waitFor", () => {
  it("resolves immediately if the selector already exists", async () => {
    document.body.innerHTML = `<div id="x">hi</div>`;
    const el = await waitFor<HTMLElement>("#x");
    expect(el.id).toBe("x");
  });

  it("resolves once the selector appears later", async () => {
    const promise = waitFor<HTMLDivElement>(".later");
    queueMicrotask(() => {
      const d = document.createElement("div");
      d.className = "later";
      document.body.appendChild(d);
    });
    const el = await promise;
    expect(el).toBeInstanceOf(HTMLDivElement);
  });

  it("rejects with AbortError when aborted before the element appears", async () => {
    const ac = new AbortController();
    const promise = waitFor(".never", { signal: ac.signal });
    ac.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects with AbortError when already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(waitFor(".never", { signal: ac.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("rejects on timeout", async () => {
    await expect(waitFor(".never", { timeout: 10 })).rejects.toThrow(/timed out/);
  });

  it("scopes search to the provided root", async () => {
    const a = document.createElement("section");
    a.innerHTML = `<span class="x">A</span>`;
    const b = document.createElement("section");
    b.innerHTML = `<span class="x">B</span>`;
    document.body.append(a, b);
    const el = await waitFor<HTMLSpanElement>(".x", { root: b });
    expect(el.textContent).toBe("B");
  });
});
