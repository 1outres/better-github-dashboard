export type Logger = {
  readonly namespace: string;
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  child: (suffix: string) => Logger;
};

export const createLogger = (namespace: string): Logger => {
  const prefix = `[${namespace}]`;
  return {
    namespace,
    log: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
    child: (suffix) => createLogger(`${namespace}:${suffix}`),
  };
};

export const rootLogger = createLogger("bgd");
