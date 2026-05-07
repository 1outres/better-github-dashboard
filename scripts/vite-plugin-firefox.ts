import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import { patchManifestForFirefox } from "./manifest";

/**
 * @crxjs が `outDir` に生成した `manifest.json` を Firefox MV3 用に書き換える。
 *
 * @crxjs は `background.service_worker` を前提にしてビルドを組み立てるため、
 * 入力 manifest は Chrome 形のままにしておき、書き出された後で
 * `service_worker` → `scripts` への差し替えと `browser_specific_settings.gecko` の
 * 付与を行う。生成された `service-worker-loader.js` 自体は単なる ESM なので、
 * Firefox 121+ の event page (`type: "module"`) としてそのまま使える。
 */
export const firefoxManifestPlugin = (): Plugin => {
  let outDir = "dist";
  return {
    name: "bgd:firefox-manifest",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    async closeBundle() {
      const manifestPath = path.resolve(outDir, "manifest.json");
      const raw = await readFile(manifestPath, "utf8");
      const patched = patchManifestForFirefox(JSON.parse(raw));
      await writeFile(manifestPath, JSON.stringify(patched, null, 2) + "\n");
    },
  };
};
