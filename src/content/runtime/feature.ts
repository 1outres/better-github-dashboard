import type { Logger } from "./logger";
import type { AppContext } from "./app-context";

export type FeatureContext = {
  readonly url: URL;
  readonly signal: AbortSignal;
  readonly log: Logger;
  readonly app: AppContext;
};

/**
 * register 時に一度だけ呼ばれる init 用のコンテキスト。
 * mount/unmount のたびに作り直されるリスナではなく、ナビゲーション横断で常駐させたい
 * リスナを仕込む場所として使う（例: dashboard の boot overlay 制御）。
 * 渡された signal は FeatureManager.destroy() 時に abort される。
 */
export type FeatureInitContext = {
  readonly signal: AbortSignal;
  readonly log: Logger;
  readonly app: AppContext;
};

export type Feature = {
  readonly id: string;
  readonly match: (url: URL) => boolean;
  readonly mount: (ctx: FeatureContext) => void | Promise<void>;
  readonly unmount?: () => void | Promise<void>;
  readonly init?: (ctx: FeatureInitContext) => void | Promise<void>;
};
