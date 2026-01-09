// Database abstraction interface
// Implement this for different database backends (D1, SQLite, PostgreSQL, etc.)

export interface User {
  id: number
  github_id: number
  github_login: string
  github_name: string | null
  github_avatar_url: string | null
  github_token_encrypted: string
  role: 'admin' | 'premium' | 'user' | 'guest'
  email: string | null
  email_notifications: number
  created_at: string
  last_login_at: string | null
}

export interface Repo {
  id: number
  owner: string
  name: string
  webhook_secret: string
  created_at: string
}

export interface UserRepo {
  id: number
  user_id: number
  repo_id: number
  created_at: string
}

export interface Star {
  id: number
  user_id: number
  repo_owner: string
  repo_name: string
  issue_id: string
  created_at: string
}

export interface Setting {
  key: string
  value: string
  updated_at: string
}

export interface WebhookState {
  id: number
  repo_owner: string
  repo_name: string
  issues_hash: string
  issues_snapshot: string
  updated_at: string
}

export interface Database {
  // User operations
  getUserById(id: number): Promise<User | null>
  getUserByGithubId(githubId: number): Promise<User | null>
  getUserCount(): Promise<number>
  createUser(user: Omit<User, 'id' | 'created_at' | 'last_login_at'>): Promise<User>
  updateUser(githubId: number, updates: Partial<User>): Promise<void>
  updateUserProfile(userId: number, email: string | null, emailNotifications: boolean): Promise<void>
  updateUserRole(userId: number, role: 'admin' | 'premium' | 'user' | 'guest'): Promise<void>
  deleteUser(userId: number): Promise<void>
  listUsers(): Promise<User[]>

  // Repo operations
  getRepoByOwnerName(owner: string, name: string): Promise<Repo | null>
  createRepo(owner: string, name: string, webhookSecret: string): Promise<Repo>
  getUserRepos(userId: number): Promise<(Repo & { user_repo_id: number })[]>
  getUserRepoLink(userId: number, repoId: number): Promise<UserRepo | null>
  createUserRepoLink(userId: number, repoId: number): Promise<UserRepo>
  deleteUserRepoLink(userId: number, repoId: number): Promise<void>

  // Star operations
  getStarredIssueIds(userId: number, repoOwner: string, repoName: string): Promise<string[]>
  createStar(userId: number, repoOwner: string, repoName: string, issueId: string): Promise<void>
  deleteStar(userId: number, repoOwner: string, repoName: string, issueId: string): Promise<void>

  // Settings operations
  getSetting(key: string): Promise<string | null>
  getAllSettings(): Promise<Record<string, string>>
  upsertSetting(key: string, value: string): Promise<void>

  // Webhook state operations
  getWebhookState(repoOwner: string, repoName: string): Promise<WebhookState | null>
  upsertWebhookState(repoOwner: string, repoName: string, hash: string, snapshot: string): Promise<void>

  // Get users to notify for a repo (for webhooks)
  getUsersToNotify(repoOwner: string, repoName: string): Promise<Pick<User, 'id' | 'github_login' | 'email' | 'email_notifications'>[]>

  // Initialize schema (for new deployments)
  initialize(): Promise<void>
}
