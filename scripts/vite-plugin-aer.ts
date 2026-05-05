import type { Plugin } from "vite";

/**
 * Advanced Extension Reloader Watch 2 を Vite に統合するプラグイン。
 *
 * `pnpm build --watch` 中、再ビルドが完了するたびに reloader へ通知し、
 * Chrome の拡張機能を自動でリロードする（github.com の開いているタブも一緒に）。
 *
 * 利用条件: chrome に loftyshaky/advanced-extension-reloader 拡張がインストール済み、
 * かつ extension_id が分かっていること。
 */
export const aerPlugin = ({
  extensionId,
  port = 7220,
}: {
  extensionId: string;
  port?: number;
}): Plugin => {
  // dynamic import: テスト/型チェック時に副作用ロードしないようにする
  type ReloaderInstance = {
    watch: () => void;
    reload: (opts: {
      extension_id: string;
      hard?: boolean;
      all_tabs?: boolean;
      play_notifications?: boolean;
      min_interval_between_extension_reloads?: number;
      delay_after_extension_reload?: number;
      delay_after_tab_reload?: number;
      listen_message_response_timeout?: number;
      hard_paths?: string[];
      soft_paths?: string[];
    }) => boolean;
    play_error_notification: (opts: { extension_id: string }) => void;
  };
  let reloader: ReloaderInstance | null = null;
  let initialized = false;
  let isWatch = false;

  return {
    name: "bgd:aer",
    apply: "build",
    configResolved(config) {
      // 単発 `vite build` では server を立てると process が exit しないため、
      // `vite build --watch` のときだけ有効化する
      isWatch = !!config.build.watch;
    },
    async buildStart() {
      if (!isWatch || initialized) return;
      initialized = true;
      const mod = (await import("advanced-extension-reloader-watch-2/es/reloader.js")) as {
        default: new (opts: { port?: number }) => ReloaderInstance;
      };
      const Reloader = mod.default;
      reloader = new Reloader({ port });
      reloader.watch();
      console.log(`[aer] reloader started on port ${port} for extension ${extensionId}`);
    },
    closeBundle() {
      if (!isWatch || !reloader) return;
      try {
        // hard:true は content_scripts の registration を一時的に剥がし、再 inject に失敗するケースを観測。
        // 既定は hard:false（拡張は再起動せずタブだけ reload）。manifest/background を変えた時は
        // hard_paths でカバー（パス変更時のみ拡張全体 reload）。
        const ok = reloader.reload({
          extension_id: extensionId,
          hard: false,
          all_tabs: true,
          play_notifications: false,
          min_interval_between_extension_reloads: 500,
          delay_after_tab_reload: 200,
          listen_message_response_timeout: 5000,
        });
        console.log(`[aer] reload sent → ${ok}`);
      } catch (err) {
        console.warn("[aer] reload failed:", err);
      }
    },
    buildEnd(err) {
      if (!isWatch || !err || !reloader) return;
      try {
        reloader.play_error_notification({ extension_id: extensionId });
      } catch {
        /* noop */
      }
    },
  };
};
