/**
 * 1リクエストでダッシュボードに必要な全データを取得する GraphQL クエリ。
 * search 結果は ISSUE タイプとして返ってくるが、PullRequest と Issue の両方を含む。
 */
export const DASHBOARD_QUERY = /* GraphQL */ `
  query Dashboard(
    $reviewRequested: String!
    $authoredPRs: String!
    $assigned: String!
    $mentions: String!
  ) {
    viewer {
      login
      name
      avatarUrl
      repositories(
        first: 30
        orderBy: { field: PUSHED_AT, direction: DESC }
        ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
        affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
        isFork: false
      ) {
        nodes {
          ...RepoFields
        }
      }
      pinnedItems(first: 6, types: [REPOSITORY]) {
        nodes {
          ... on Repository {
            ...RepoFields
          }
        }
      }
    }
    reviewRequests: search(query: $reviewRequested, type: ISSUE, first: 20) {
      nodes {
        ...IssueFields
      }
    }
    authoredPRs: search(query: $authoredPRs, type: ISSUE, first: 20) {
      nodes {
        ...IssueFields
      }
    }
    assigned: search(query: $assigned, type: ISSUE, first: 20) {
      nodes {
        ...IssueFields
      }
    }
    mentions: search(query: $mentions, type: ISSUE, first: 20) {
      nodes {
        ...IssueFields
      }
    }
  }

  fragment RepoFields on Repository {
    nameWithOwner
    description
    url
    isPrivate
    stargazerCount
    updatedAt
    primaryLanguage {
      name
      color
    }
  }

  fragment IssueFields on Node {
    __typename
    ... on Issue {
      number
      title
      url
      updatedAt
      author {
        login
      }
      repository {
        nameWithOwner
      }
    }
    ... on PullRequest {
      number
      title
      url
      updatedAt
      isDraft
      mergeable
      reviewDecision
      author {
        login
      }
      repository {
        nameWithOwner
      }
      statusCheckRollup {
        state
      }
    }
  }
`;

export const DASHBOARD_VARIABLES = {
  reviewRequested: "is:open is:pr review-requested:@me archived:false",
  authoredPRs: "is:open is:pr author:@me archived:false",
  assigned: "is:open assignee:@me archived:false",
  mentions: "is:open mentions:@me archived:false",
} as const;

/**
 * 検索候補の追加用に、自分が関与する全レポを viewerPermission 付きで取得する。
 * GraphQL 側に permission フィルタが無いため client 側で WRITE 以上を抽出する。
 * 検索バーは「持っているもの全部」見えてほしいので fork も含める
 * （ダッシュボード側 recentRepos は意図的に非 fork に絞っている）。
 */
export const WRITABLE_REPOS_QUERY = /* GraphQL */ `
  query WritableRepos($cursor: String) {
    viewer {
      repositories(
        first: 100
        after: $cursor
        ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
        affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
        orderBy: { field: PUSHED_AT, direction: DESC }
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          nameWithOwner
          description
          url
          isPrivate
          stargazerCount
          updatedAt
          viewerPermission
          primaryLanguage {
            name
            color
          }
        }
      }
    }
  }
`;
