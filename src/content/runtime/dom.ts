export type WaitForOptions = {
  signal?: AbortSignal;
  root?: ParentNode;
  timeout?: number;
};

export const waitFor = <T extends Element = Element>(
  selector: string,
  { signal, root = document, timeout = 30_000 }: WaitForOptions = {},
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }

    const found = root.querySelector<T>(selector);
    if (found) {
      resolve(found);
      return;
    }

    const observerRoot = root instanceof Document ? root.documentElement : (root as Element);

    const observer = new MutationObserver(() => {
      const el = root.querySelector<T>(selector);
      if (el) {
        cleanup();
        resolve(el);
      }
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`waitFor: timed out waiting for ${selector}`));
    }, timeout);

    const onAbort = () => {
      cleanup();
      reject(new DOMException("aborted", "AbortError"));
    };

    const cleanup = () => {
      observer.disconnect();
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort);
    observer.observe(observerRoot, { childList: true, subtree: true });
  });
};

export type ObserveDisposer = () => void;

export const observeChildList = (
  target: Node,
  callback: (mutations: MutationRecord[]) => void,
  { subtree = true }: { subtree?: boolean } = {},
): ObserveDisposer => {
  const observer = new MutationObserver(callback);
  observer.observe(target, { childList: true, subtree });
  return () => observer.disconnect();
};
