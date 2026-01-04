// Generic SQLite database adapter (for better-sqlite3, sql.js, Turso, etc.)
// This is a reference implementation - adjust for your specific SQLite library

import type { Database, User, Repo, UserRepo, WebhookState } from '../interfaces/database'

// Generic SQLite interface - implement this for your specific library
export interface SQLiteDriver {
  run(sql: string, params?: unknown[]): void
  get<T>(sql: string, params?: unknown[]): T | undefined
  all<T>(sql: string, params?: unknown[]): T[]
}

export class SQLiteDatabase implements Database {
  constructor(private driver: SQLiteDriver) {}

  async initialize(): Promise<void> {
    this.driver.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        github_id INTEGER NOT NULL UNIQUE,
        github_login TEXT NOT NULL,
        github_name TEXT,
        github_avatar_url TEXT,
        github_token_encrypted TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'premium', 'user')),
        email TEXT,
        email_notifications INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_login_at TEXT
      )
    `)

    this.driver.run(`
      CREATE TABLE IF NOT EXISTS repos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        webhook_secret TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(owner, name)
      )
    `)

    this.driver.run(`
      CREATE TABLE IF NOT EXISTS user_repos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, repo_id)
      )
    `)

    this.driver.run(`
      CREATE TABLE IF NOT EXISTS stars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        repo_owner TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        issue_id TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, repo_owner, repo_name, issue_id)
      )
    `)

    this.driver.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    this.driver.run(`
      CREATE TABLE IF NOT EXISTS webhook_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_owner TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        issues_hash TEXT NOT NULL,
        issues_snapshot TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(repo_owner, repo_name)
      )
    `)
  }

  // User operations
  async getUserById(id: number): Promise<User | null> {
    return this.driver.get<User>('SELECT * FROM users WHERE id = ?', [id]) ?? null
  }

  async getUserByGithubId(githubId: number): Promise<User | null> {
    return this.driver.get<User>('SELECT * FROM users WHERE github_id = ?', [githubId]) ?? null
  }

  async getUserCount(): Promise<number> {
    const result = this.driver.get<{ count: number }>('SELECT COUNT(*) as count FROM users')
    return result?.count ?? 0
  }

  async createUser(user: Omit<User, 'id' | 'created_at' | 'last_login_at'>): Promise<User> {
    this.driver.run(`
      INSERT INTO users (github_id, github_login, github_name, github_avatar_url, github_token_encrypted, role, email, email_notifications)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      user.github_id,
      user.github_login,
      user.github_name,
      user.github_avatar_url,
      user.github_token_encrypted,
      user.role,
      user.email,
      user.email_notifications
    ])
    return this.driver.get<User>('SELECT * FROM users WHERE github_id = ?', [user.github_id])!
  }

  async updateUser(githubId: number, updates: Partial<User>): Promise<void> {
    const fields: string[] = []
    const values: unknown[] = []

    if (updates.github_login !== undefined) {
      fields.push('github_login = ?')
      values.push(updates.github_login)
    }
    if (updates.github_name !== undefined) {
      fields.push('github_name = ?')
      values.push(updates.github_name)
    }
    if (updates.github_avatar_url !== undefined) {
      fields.push('github_avatar_url = ?')
      values.push(updates.github_avatar_url)
    }
    if (updates.github_token_encrypted !== undefined) {
      fields.push('github_token_encrypted = ?')
      values.push(updates.github_token_encrypted)
    }
    if (updates.email !== undefined) {
      fields.push('email = COALESCE(email, ?)')
      values.push(updates.email)
    }

    fields.push('last_login_at = CURRENT_TIMESTAMP')
    values.push(githubId)

    this.driver.run(`UPDATE users SET ${fields.join(', ')} WHERE github_id = ?`, values)
  }

  async updateUserProfile(userId: number, email: string | null, emailNotifications: boolean): Promise<void> {
    this.driver.run(
      'UPDATE users SET email = ?, email_notifications = ? WHERE id = ?',
      [email, emailNotifications ? 1 : 0, userId]
    )
  }

  async updateUserRole(userId: number, role: 'admin' | 'premium' | 'user'): Promise<void> {
    this.driver.run('UPDATE users SET role = ? WHERE id = ?', [role, userId])
  }

  async deleteUser(userId: number): Promise<void> {
    this.driver.run('DELETE FROM users WHERE id = ?', [userId])
  }

  async listUsers(): Promise<User[]> {
    return this.driver.all<User>('SELECT * FROM users ORDER BY created_at DESC')
  }

  // Repo operations
  async getRepoByOwnerName(owner: string, name: string): Promise<Repo | null> {
    return this.driver.get<Repo>('SELECT * FROM repos WHERE owner = ? AND name = ?', [owner, name]) ?? null
  }

  async createRepo(owner: string, name: string, webhookSecret: string): Promise<Repo> {
    this.driver.run(
      'INSERT INTO repos (owner, name, webhook_secret) VALUES (?, ?, ?)',
      [owner, name, webhookSecret]
    )
    return this.driver.get<Repo>('SELECT * FROM repos WHERE owner = ? AND name = ?', [owner, name])!
  }

  async getUserRepos(userId: number): Promise<(Repo & { user_repo_id: number })[]> {
    return this.driver.all<Repo & { user_repo_id: number }>(`
      SELECT r.*, ur.id as user_repo_id
      FROM repos r
      JOIN user_repos ur ON ur.repo_id = r.id
      WHERE ur.user_id = ?
      ORDER BY ur.created_at DESC
    `, [userId])
  }

  async getUserRepoLink(userId: number, repoId: number): Promise<UserRepo | null> {
    return this.driver.get<UserRepo>(
      'SELECT * FROM user_repos WHERE user_id = ? AND repo_id = ?',
      [userId, repoId]
    ) ?? null
  }

  async createUserRepoLink(userId: number, repoId: number): Promise<UserRepo> {
    this.driver.run('INSERT INTO user_repos (user_id, repo_id) VALUES (?, ?)', [userId, repoId])
    return this.driver.get<UserRepo>(
      'SELECT * FROM user_repos WHERE user_id = ? AND repo_id = ?',
      [userId, repoId]
    )!
  }

  async deleteUserRepoLink(userId: number, repoId: number): Promise<void> {
    this.driver.run('DELETE FROM user_repos WHERE user_id = ? AND repo_id = ?', [userId, repoId])
  }

  // Star operations
  async getStarredIssueIds(userId: number, repoOwner: string, repoName: string): Promise<string[]> {
    const results = this.driver.all<{ issue_id: string }>(
      'SELECT issue_id FROM stars WHERE user_id = ? AND repo_owner = ? AND repo_name = ?',
      [userId, repoOwner, repoName]
    )
    return results.map(r => r.issue_id)
  }

  async createStar(userId: number, repoOwner: string, repoName: string, issueId: string): Promise<void> {
    this.driver.run(
      'INSERT OR IGNORE INTO stars (user_id, repo_owner, repo_name, issue_id) VALUES (?, ?, ?, ?)',
      [userId, repoOwner, repoName, issueId]
    )
  }

  async deleteStar(userId: number, repoOwner: string, repoName: string, issueId: string): Promise<void> {
    this.driver.run(
      'DELETE FROM stars WHERE user_id = ? AND repo_owner = ? AND repo_name = ? AND issue_id = ?',
      [userId, repoOwner, repoName, issueId]
    )
  }

  // Settings operations
  async getSetting(key: string): Promise<string | null> {
    const result = this.driver.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
    return result?.value ?? null
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const results = this.driver.all<{ key: string; value: string }>('SELECT key, value FROM settings')
    const settings: Record<string, string> = {}
    for (const row of results) {
      settings[row.key] = row.value
    }
    return settings
  }

  async upsertSetting(key: string, value: string): Promise<void> {
    this.driver.run(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `, [key, value, value])
  }

  // Webhook state operations
  async getWebhookState(repoOwner: string, repoName: string): Promise<WebhookState | null> {
    return this.driver.get<WebhookState>(
      'SELECT * FROM webhook_state WHERE repo_owner = ? AND repo_name = ?',
      [repoOwner, repoName]
    ) ?? null
  }

  async upsertWebhookState(repoOwner: string, repoName: string, hash: string, snapshot: string): Promise<void> {
    this.driver.run(`
      INSERT INTO webhook_state (repo_owner, repo_name, issues_hash, issues_snapshot, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(repo_owner, repo_name) DO UPDATE SET
        issues_hash = ?, issues_snapshot = ?, updated_at = CURRENT_TIMESTAMP
    `, [repoOwner, repoName, hash, snapshot, hash, snapshot])
  }

  // Get users to notify for a repo
  async getUsersToNotify(repoOwner: string, repoName: string): Promise<Pick<User, 'id' | 'github_login' | 'email' | 'email_notifications'>[]> {
    return this.driver.all<Pick<User, 'id' | 'github_login' | 'email' | 'email_notifications'>>(`
      SELECT DISTINCT u.id, u.github_login, u.email, u.email_notifications
      FROM users u
      JOIN user_repos ur ON ur.user_id = u.id
      JOIN repos r ON r.id = ur.repo_id
      WHERE r.owner = ? AND r.name = ?
        AND u.email IS NOT NULL
        AND u.email_notifications = 1
    `, [repoOwner, repoName])
  }
}
