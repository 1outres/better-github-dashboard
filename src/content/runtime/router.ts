export type RouterCallback = (url: URL) => void;

export type RouterDisposer = () => void;

/** Document events that GitHub fires after a navigation that does not reload the page. */
const NAVIGATION_EVENTS = [
  "turbo:load",
  // GitHub React pages (code view, issues, pull requests, ...) fire this instead of turbo:load.
  "soft-nav:end",
] as const;

/**
 * Calls the callback once for each new URL, for full page loads and for
 * GitHub's in-page navigations alike.
 */
export const startRouter = (callback: RouterCallback): RouterDisposer => {
  let lastHref = "";

  const fire = () => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    callback(new URL(location.href));
  };

  for (const type of NAVIGATION_EVENTS) document.addEventListener(type, fire);
  window.addEventListener("popstate", fire);

  fire();

  return () => {
    for (const type of NAVIGATION_EVENTS) document.removeEventListener(type, fire);
    window.removeEventListener("popstate", fire);
  };
};
