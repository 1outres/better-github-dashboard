export type Repo = {
  nameWithOwner: string;
  description: string | null;
  primaryLanguage: { name: string; color: string | null } | null;
  stargazerCount: number;
  updatedAt: string;
  isPrivate: boolean;
  url: string;
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
  reviewRequests: IssueLike[];
  myPullRequests: IssueLike[];
  assignedIssues: IssueLike[];
  mentions: IssueLike[];
};
