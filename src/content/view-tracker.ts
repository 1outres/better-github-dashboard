import type { AppContext } from "./runtime/app-context";
import { extractViewTitle, parseGithubViewUrl, type ViewSeed } from "@/shared/view-stats";

const enrichSeed = (seed: ViewSeed): ViewSeed => {
  if (seed.kind === "repo") return seed;
  return { ...seed, title: extractViewTitle(document.title, seed) };
};

/**
 * URL ごとに 1 回だけ閲覧記録する。turbo 連打や bfcache 復元で同 URL が再度
 * 通知されても二重カウントしないよう、最後に記録した URL を保持する。
 */
export const createViewTracker = (app: AppContext) => {
  let lastRecordedUrl: string | null = null;

  return {
    record: (url: URL) => {
      const seed = parseGithubViewUrl(url);
      if (!seed) return;
      if (seed.url === lastRecordedUrl) return;
      lastRecordedUrl = seed.url;
      // 初回ロード（document_start に起動した瞬間）は <title> が未パースなので、
      // タイトル参照が必要な issue/PR だけ DOMContentLoaded まで待つ。
      const persist = () => void app.viewStats.record(enrichSeed(seed));
      if (seed.kind !== "repo" && document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", persist, { once: true });
      } else {
        persist();
      }
    },
  };
};
