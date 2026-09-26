import { afterEach, describe, expect, it } from "vitest";
import { createAppContext } from "./runtime/app-context";
import { createViewTracker } from "./view-tracker";
import { createMemoryStorage } from "@/shared/storage";

const setup = () => {
  const app = createAppContext({ storage: createMemoryStorage() });
  return { app, tracker: createViewTracker(app) };
};

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.title = "";
});

describe("createViewTracker", () => {
  it("records the issue title taken from document.title", async () => {
    const { app, tracker } = setup();
    document.title = "Crash on start · Issue #42 · o/r · GitHub";

    tracker.record(new URL("https://github.com/o/r/issues/42"));
    await flush();

    const [entry] = await app.viewStats.load();
    expect(entry).toMatchObject({ key: "Issue:o/r#42", title: "Crash on start" });
  });

  it("does not record the title of the previous page", async () => {
    const { app, tracker } = setup();
    document.title = "Fix it by alice · Pull Request #7 · o/r";

    tracker.record(new URL("https://github.com/o/r/issues/42"));
    await flush();

    const [entry] = await app.viewStats.load();
    expect(entry).toMatchObject({ key: "Issue:o/r#42", title: null });
  });

  it("counts a URL once even when it is reported twice in a row", async () => {
    const { app, tracker } = setup();

    tracker.record(new URL("https://github.com/o/r"));
    tracker.record(new URL("https://github.com/o/r/tree/main"));
    await flush();

    const [entry] = await app.viewStats.load();
    expect(entry).toMatchObject({ key: "repo:o/r", count: 1 });
  });
});
