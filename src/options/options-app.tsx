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

      <section class="bgd-section">
        <form onSubmit={onSave}>
          <label class="bgd-label" for="bgd-pat-input">
            Personal Access Token
          </label>
          <div class="bgd-row">
            <input
              id="bgd-pat-input"
              type="password"
              placeholder={stored()?.pat ? "(設定済み)" : "ghp_xxxxxxxxxxxxxxxxxxxx"}
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

        <a
          class="bgd-create-link"
          href="https://github.com/settings/tokens/new?description=Better%20GitHub%20Dashboard&scopes=repo,read:user,read:org&default_expires_at=none"
          target="_blank"
          rel="noreferrer"
        >
          トークンを作成する
        </a>
      </section>
    </main>
  );
};
