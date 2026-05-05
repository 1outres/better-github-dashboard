export type RouterCallback = (url: URL) => void;

export type RouterDisposer = () => void;

/**
 * GitHub のページ内遷移は `turbo:load` を発火する。SPA的な内部遷移を一律に
 * 1 つのコールバックに集約する薄いルータ。
 */
export const startRouter = (callback: RouterCallback): RouterDisposer => {
  let lastHref = "";

  const fire = () => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    callback(new URL(location.href));
  };

  const onTurboLoad = () => fire();
  const onPopState = () => fire();

  document.addEventListener("turbo:load", onTurboLoad);
  window.addEventListener("popstate", onPopState);

  fire();

  return () => {
    document.removeEventListener("turbo:load", onTurboLoad);
    window.removeEventListener("popstate", onPopState);
  };
};
