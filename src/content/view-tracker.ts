import { createChromeStorage } from "@/shared/storage";
import { createViewStatsStore, parseGithubViewUrl, type ViewSeed } from "@/shared/view-stats";

const store = createViewStatsStore(createChromeStorage());

/**
 * GitHub のページタイトルから issue/PR のタイトル部分だけを切り出す。
 * 例: "Title · Issue #42 · owner/repo" → "Title"
 */
const extractTitle = (rawTitle: string): string | null => {
  const trimmed = rawTitle.trim();
  if (!trimmed) return null;
  const idx = trimmed.indexOf(" · ");
  return idx > 0 ? trimmed.slice(0, idx) : trimmed;
};

const enrichSeed = (seed: ViewSeed): ViewSeed => {
  if (seed.kind === "repo") return seed;
  const title = extractTitle(document.title);
  return { ...seed, title };
};

/**
 * URL ごとに 1 回だけ閲覧記録する。turbo 連打や bfcache 復元で同 URL が再度
 * 通知されても二重カウントしないよう、最後に記録した URL を保持する。
 */
export const createViewTracker = () => {
  let lastRecordedUrl: string | null = null;

  return {
    record: (url: URL) => {
      const seed = parseGithubViewUrl(url);
      if (!seed) return;
      if (seed.url === lastRecordedUrl) return;
      lastRecordedUrl = seed.url;
      // 初回ロード（document_start に起動した瞬間）は <title> が未パースなので、
      // タイトル参照が必要な issue/PR だけ DOMContentLoaded まで待つ。
      const persist = () => void store.record(enrichSeed(seed));
      if (seed.kind !== "repo" && document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", persist, { once: true });
      } else {
        persist();
      }
    },
  };
};
