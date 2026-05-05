import { Show, createResource, createSignal, type Component } from "solid-js";
import { createChromeStorage } from "@/shared/storage";
import { createSettingsStore } from "@/shared/settings";
import { createGitHubClient } from "@/shared/github";
import "./options.css";

const settings = createSettingsStore(createChromeStorage());

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "ok"; login: string }
  | { kind: "err"; message: string };

export const OptionsApp: Component = () => {
  const [stored] = createResource(() => settings.get());
  const [pat, setPat] = createSignal("");
  const [status, setStatus] = createSignal<SaveStatus>({ kind: "idle" });

  const onSave = async (e: SubmitEvent) => {
    e.preventDefault();
    const token = pat().trim();
    if (!token) {
      setStatus({ kind: "err", message: "Token を入力してください" });
      return;
    }
    setStatus({ kind: "saving" });
    try {
      const client = createGitHubClient(token);
      const viewer = await client.fetchViewer();
      await settings.set({ pat: token });
      setStatus({ kind: "ok", login: viewer.login });
    } catch (err) {
      setStatus({
        kind: "err",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const onClear = async () => {
    await settings.set({ pat: null });
    setPat("");
    setStatus({ kind: "idle" });
  };

  return (
    <main class="bgd-options">
      <h1>Better GitHub Dashboard</h1>
      <p class="lead">GitHub にアクセスする Personal Access Token を設定します。</p>

      <section class="bgd-section">
        <h2>GitHub Personal Access Token</h2>
        <p class="desc">
          ダッシュボードのデータ取得に使います。トークンは{" "}
          <strong>このブラウザの拡張機能ストレージにのみ保存</strong>{" "}
          され、外部に送信されません。
        </p>

        <form onSubmit={onSave}>
          <div class="bgd-row">
            <input
              type="password"
              placeholder={
                stored()?.pat ? "(設定済み — 変更する場合のみ入力)" : "ghp_xxxxxxxxxxxxxxxxxxxx"
              }
              value={pat()}
              onInput={(e) => setPat(e.currentTarget.value)}
              autocomplete="off"
              spellcheck={false}
            />
            <button
              type="submit"
              class="primary"
              disabled={status().kind === "saving" || pat().trim().length === 0}
            >
              {status().kind === "saving" ? "検証中…" : "保存"}
            </button>
            <Show when={stored()?.pat}>
              <button type="button" class="danger" onClick={onClear}>
                削除
              </button>
            </Show>
          </div>

          <Show when={status().kind === "ok"}>
            {(_) => {
              const s = status() as Extract<SaveStatus, { kind: "ok" }>;
              return <div class="bgd-status ok">✓ 保存しました ({s.login})</div>;
            }}
          </Show>
          <Show when={status().kind === "err"}>
            {(_) => {
              const s = status() as Extract<SaveStatus, { kind: "err" }>;
              return <div class="bgd-status err">✕ {s.message}</div>;
            }}
          </Show>
        </form>

        <div class="bgd-help">
          <p>
            推奨スコープ（{" "}
            <a
              href="https://github.com/settings/tokens/new?description=Better%20GitHub%20Dashboard&scopes=repo,read:user,read:org"
              target="_blank"
              rel="noreferrer"
            >
              この設定でトークン作成
            </a>{" "}
            ）:
          </p>
          <ul class="bgd-pat-scopes">
            <li>
              <code>repo</code> — Issue/PR の検索とプライベートリポジトリ参照
            </li>
            <li>
              <code>read:user</code> — ログインユーザー情報
            </li>
            <li>
              <code>read:org</code> — 所属組織のリポジトリ
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
};
