import type { Logger } from "./logger";

export type FeatureContext = {
  readonly url: URL;
  readonly signal: AbortSignal;
  readonly log: Logger;
};

export type Feature = {
  readonly id: string;
  readonly match: (url: URL) => boolean;
  readonly mount: (ctx: FeatureContext) => void | Promise<void>;
  readonly unmount?: () => void | Promise<void>;
};
