import type { StorageBackend } from "./storage";

const KEY = "view-stats";
const VERSION = 1;
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
/** メモリ肥大対策: スコア下位を切り捨てる目安。書き込み時に超えたら GC する */
const MAX_ENTRIES = 500;

export type ViewKind = "repo" | "Issue" | "PullRequest";

export type ViewEntry = {
  kind: ViewKind;
  /** ストア内のキー。`{kind}:{nameWithOwner}` か `{kind}:{nameWithOwner}#{number}` */
  key: string;
  /** ナビゲーション先 URL（repo は `/owner/repo` のルートに正規化済み） */
  url: string;
  nameWithOwner: string;
  /** issue/PR のみ */
  number: number | null;
  /** issue/PR のタイトル（取得できなかった場合 null） */
  title: string | null;
  count: number;
  lastViewedAt: number;
};

/** record() に渡す入力。count/lastViewedAt はストア側で管理する */
export type ViewSeed = Omit<ViewEntry, "count" | "lastViewedAt">;

type StoredEntry = ViewEntry;

type StoredShape = {
  v: number;
  entries: Record<string, StoredEntry>;
};

export type ViewStatsStore = {
  load: () => Promise<ViewEntry[]>;
  record: (seed: ViewSeed) => Promise<void>;
  clear: () => Promise<void>;
};

/** GitHub のサイト機能や予約パスなど、リポジトリ owner ではないトップレベル */
const RESERVED_OWNERS: ReadonlySet<string> = new Set([
  "settings",
  "marketplace",
  "explore",
  "notifications",
  "search",
  "topics",
  "trending",
  "collections",
  "events",
  "stars",
  "issues",
  "pulls",
  "discussions",
  "watching",
  "new",
  "organizations",
  "logout",
  "login",
  "join",
  "sponsors",
  "codespaces",
  "features",
  "premium",
  "pricing",
  "enterprise",
  "team",
  "customer-stories",
  "site",
  "about",
  "contact",
  "security",
  "readme",
  "dashboard",
  "home",
  "account",
  "billing",
  "apps",
  "integrations",
]);

const REPO_NAME_RE = /^[A-Za-z0-9._-]+$/;

export const parseGithubViewUrl = (url: URL): ViewSeed | null => {
  if (url.hostname !== "github.com") return null;
  const segs = url.pathname.split("/").filter(Boolean);
  if (segs.length < 2) return null;
  const [owner, repo, type, num] = segs;
  if (!owner || !repo) return null;
  if (RESERVED_OWNERS.has(owner.toLowerCase())) return null;
  if (!REPO_NAME_RE.test(owner) || !REPO_NAME_RE.test(repo)) return null;

  const nameWithOwner = `${owner}/${repo}`;
  const repoUrl = `https://github.com/${nameWithOwner}`;

  if ((type === "issues" || type === "pull") && num) {
    const n = Number.parseInt(num, 10);
    if (!Number.isFinite(n)) return null;
    const kind: ViewKind = type === "issues" ? "Issue" : "PullRequest";
    return {
      kind,
      key: `${kind}:${nameWithOwner}#${n}`,
      url: `${repoUrl}/${type}/${n}`,
      nameWithOwner,
      number: n,
      title: null,
    };
  }

  return {
    kind: "repo",
    key: `repo:${nameWithOwner}`,
    url: repoUrl,
    nameWithOwner,
    number: null,
    title: null,
  };
};

export const scoreEntry = (entry: ViewEntry, now: number): number => {
  const age = Math.max(0, now - entry.lastViewedAt);
  return entry.count * Math.pow(0.5, age / HALF_LIFE_MS);
};

export const createViewStatsStore = (storage: StorageBackend): ViewStatsStore => {
  const read = async (): Promise<StoredShape> => {
    const raw = await storage.get<StoredShape>(KEY);
    if (!raw || raw.v !== VERSION || !raw.entries) {
      return { v: VERSION, entries: {} };
    }
    return raw;
  };

  return {
    load: async () => {
      const shape = await read();
      return Object.values(shape.entries);
    },
    record: async (seed) => {
      const shape = await read();
      const now = Date.now();
      const prev = shape.entries[seed.key];
      const merged: StoredEntry = {
        ...seed,
        // タイトルは新しい方を優先（issue/PR がリネームされても追従）。
        title: seed.title ?? prev?.title ?? null,
        count: (prev?.count ?? 0) + 1,
        lastViewedAt: now,
      };
      shape.entries[seed.key] = merged;

      const keys = Object.keys(shape.entries);
      if (keys.length > MAX_ENTRIES) {
        const sorted = keys
          .map((k) => ({ k, s: scoreEntry(shape.entries[k]!, now) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, MAX_ENTRIES);
        const next: Record<string, StoredEntry> = {};
        for (const { k } of sorted) next[k] = shape.entries[k]!;
        shape.entries = next;
      }

      await storage.set(KEY, shape);
    },
    clear: () => storage.remove(KEY),
  };
};
