/**
 * Background service worker.
 * content script からは chrome.runtime.openOptionsPage が呼べないため、
 * メッセージで仲介する。
 */

type Message = { type: "open-options" };

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message?.type === "open-options") {
    void chrome.runtime.openOptionsPage().then(
      () => sendResponse({ ok: true }),
      (err: unknown) => sendResponse({ ok: false, error: String(err) }),
    );
    return true; // 非同期 sendResponse
  }
  return false;
});

chrome.action?.onClicked?.addListener(() => {
  void chrome.runtime.openOptionsPage();
});
