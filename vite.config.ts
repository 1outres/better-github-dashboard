import { defineConfig, loadEnv } from "vite";
import solid from "vite-plugin-solid";
import { crx } from "@crxjs/vite-plugin";
import path from "node:path";
import manifest from "./manifest.json" with { type: "json" };
import { aerPlugin } from "./scripts/vite-plugin-aer";
import { firefoxManifestPlugin } from "./scripts/vite-plugin-firefox";
import { isTarget, type Target } from "./scripts/manifest";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "BGD_");
  const extensionId = env["BGD_EXTENSION_ID"];

  const rawTarget = process.env.BGD_BROWSER ?? env["BGD_BROWSER"];
  const target: Target = isTarget(rawTarget) ? rawTarget : "chrome";

  return {
    plugins: [
      solid(),
      crx({ manifest }),
      ...(target === "firefox" ? [firefoxManifestPlugin()] : []),
      // AER は Chrome 専用なので firefox build のときは無効化
      ...(target === "chrome" && extensionId ? [aerPlugin({ extensionId })] : []),
    ],
    resolve: {
      alias: { "@": path.resolve(__dirname, "src") },
    },
    build: {
      target: "esnext",
      // chrome / firefox の成果物を分離する
      outDir: `dist/${target}`,
      emptyOutDir: true,
      // content script のチャンク分割で生成される動的 import に対し、Vite が
      // <link rel="modulepreload" href="/assets/foo.js"> を document.head に挿入する。
      // これが github.com の context で /assets/foo.js → https://github.com/assets/foo.js に
      // 解決され GitHub の CSP に弾かれる（実際のロードは chrome-extension:// 経由で成功するため
      // 機能には影響しないが、コンソールエラーが出続ける）。preload 自体を無効化する。
      modulePreload: false,
      rollupOptions: {
        input: { options: "src/options/index.html" },
        // ハッシュ無しの固定ファイル名にする。
        // タブだけ reload する dev モードでは Chrome が古い manifest を参照し続けるため、
        // ファイル名を固定しないと「古いハッシュのファイルが見つからない」で content script が injection されなくなる。
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: "assets/[name].[ext]",
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      hmr: { port: 5173 },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./tests/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    },
  };
});
