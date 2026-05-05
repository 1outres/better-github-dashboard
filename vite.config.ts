import { defineConfig, loadEnv } from "vite";
import solid from "vite-plugin-solid";
import { crx } from "@crxjs/vite-plugin";
import path from "node:path";
import manifest from "./manifest.json" with { type: "json" };
import { aerPlugin } from "./scripts/vite-plugin-aer";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "BGD_");
  const extensionId = env["BGD_EXTENSION_ID"];

  return {
    plugins: [
      solid(),
      crx({ manifest }),
      ...(extensionId ? [aerPlugin({ extensionId })] : []),
    ],
    resolve: {
      alias: { "@": path.resolve(__dirname, "src") },
    },
    build: {
      target: "esnext",
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
