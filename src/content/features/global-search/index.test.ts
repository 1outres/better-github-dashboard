import { afterEach, describe, expect, it } from "vitest";
import { globalSearchFeature } from "./index";
import type { FeatureContext } from "../../runtime/feature";
import { createAppContext } from "../../runtime/app-context";
import { createLogger } from "../../runtime/logger";
import { createMemoryStorage } from "@/shared/storage";

const HOST_ID = "bgd-global-search-host";

const makeContext = (): FeatureContext => ({
  url: new URL("https://github.com/"),
  signal: new AbortController().signal,
  log: createLogger("test"),
  app: createAppContext({ storage: createMemoryStorage() }),
});

afterEach(async () => {
  await globalSearchFeature.unmount?.();
  document.documentElement.innerHTML = "<head></head><body></body>";
});

describe("globalSearchFeature", () => {
  it("keeps the host outside <body>", async () => {
    await globalSearchFeature.mount(makeContext());
    expect(document.getElementById(HOST_ID)?.parentNode).toBe(document.documentElement);
  });

  it("keeps the host in the page when GitHub replaces <body>", async () => {
    await globalSearchFeature.mount(makeContext());
    document.body.replaceWith(document.createElement("body"));
    expect(document.getElementById(HOST_ID)?.isConnected).toBe(true);
  });

  it("removes the host on unmount", async () => {
    await globalSearchFeature.mount(makeContext());
    await globalSearchFeature.unmount?.();
    expect(document.getElementById(HOST_ID)).toBeNull();
  });
});
