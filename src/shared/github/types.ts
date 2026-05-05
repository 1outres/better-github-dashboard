export type Repo = {
  nameWithOwner: string;
  description: string | null;
  primaryLanguage: { name: string; color: string | null } | null;
  stargazerCount: number;
  updatedAt: string;
  isPrivate: boolean;
  url: string;
  /** "ADMIN" | "MAINTAIN" | "WRITE" | "TRIAGE" | "READ"。取得していない場合は undefined */
  viewerPermission?: string | null;
};

export type IssueLike = {
  type: "Issue" | "PullRequest";
  number: number;
  title: string;
  url: string;
  repository: { nameWithOwner: string };
  updatedAt: string;
  /** PR のみ */
  isDraft?: boolean;
  /** PR の マージ可能性 ("MERGEABLE" | "CONFLICTING" | "UNKNOWN") */
  mergeable?: string;
  /** PR の レビュー判定 ("APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null) */
  reviewDecision?: string | null;
  /** ステータスチェックの集約結果 ("SUCCESS" | "FAILURE" | "PENDING" | null) */
  statusCheckRollup?: string | null;
  author: { login: string } | null;
};

export type Viewer = {
  login: string;
  name: string | null;
  avatarUrl: string;
};

export type DashboardData = {
  viewer: Viewer;
  pinnedRepos: Repo[];
  recentRepos: Repo[];
  /** 自分が write 以上の権限を持つ全レポ。検索候補用に非同期で埋められる */
  writableRepos: Repo[];
  reviewRequests: IssueLike[];
  myPullRequests: IssueLike[];
  assignedIssues: IssueLike[];
  mentions: IssueLike[];
};
