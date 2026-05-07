/**
 * Background service worker.
 * content script からは options ページを直接開けないため、メッセージで仲介する。
 *
 * 注意: chrome.runtime.openOptionsPage は SW context だと
 *   "Could not create an options page."
 * で失敗するケースがある（Chromium が Browser* を解決できない＝
 * 現在のウィンドウが見つからない、複数プロファイル等）。
 * そのため tabs.query + tabs.create で同等の挙動を組み立てる。
 */

type Message = { type: "open-options" };

const OPTIONS_PATH = "src/options/index.html";

const focusOrCreateOptionsTab = async (): Promise<void> => {
  const url = chrome.runtime.getURL(OPTIONS_PATH);
  // 自身の extension URL に対する query は tabs 権限不要。
  const existing = await chrome.tabs.query({ url });
  const target = existing.find((t) => t.id !== undefined);
  if (target?.id !== undefined) {
    await chrome.tabs.update(target.id, { active: true });
    if (target.windowId !== undefined) {
      await chrome.windows.update(target.windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url });
};

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message?.type === "open-options") {
    void focusOrCreateOptionsTab().then(
      () => sendResponse({ ok: true }),
      (err: unknown) => {
        console.warn("[bgd] open-options failed:", err);
        sendResponse({ ok: false, error: String(err) });
      },
    );
    return true; // 非同期 sendResponse
  }
  return false;
});

chrome.action?.onClicked?.addListener(() => {
  void focusOrCreateOptionsTab().catch((err: unknown) => {
    console.warn("[bgd] open-options (action) failed:", err);
  });
});
