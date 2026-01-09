// Cloudflare D1 database adapter

import type { Database, User, Repo, UserRepo, Star, WebhookState } from '../interfaces/database'

export class D1Database implements Database {
  constructor(private db: D1Database) {}

  async initialize(): Promise<void> {
    // Create tables if they don't exist
    await this.db.prepare(`
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
    `).run()

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS repos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        webhook_secret TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(owner, name)
      )
    `).run()

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS user_repos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, repo_id)
      )
    `).run()

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS stars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        repo_owner TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        issue_id TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, repo_owner, repo_name, issue_id)
      )
    `).run()

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run()

    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS webhook_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_owner TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        issues_hash TEXT NOT NULL,
        issues_snapshot TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(repo_owner, repo_name)
      )
    `).run()
  }

  // User operations
  async getUserById(id: number): Promise<User | null> {
    return await this.db.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(id).first() as User | null
  }

  async getUserByGithubId(githubId: number): Promise<User | null> {
    return await this.db.prepare(
      'SELECT * FROM users WHERE github_id = ?'
    ).bind(githubId).first() as User | null
  }

  async getUserCount(): Promise<number> {
    const result = await this.db.prepare(
      'SELECT COUNT(*) as count FROM users'
    ).first() as { count: number }
    return result?.count ?? 0
  }

  async createUser(user: Omit<User, 'id' | 'created_at' | 'last_login_at'>): Promise<User> {
    const result = await this.db.prepare(`
      INSERT INTO users (github_id, github_login, github_name, github_avatar_url, github_token_encrypted, role, email, email_notifications)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).bind(
      user.github_id,
      user.github_login,
      user.github_name,
      user.github_avatar_url,
      user.github_token_encrypted,
      user.role,
      user.email,
      user.email_notifications
    ).first() as User
    return result
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

    await this.db.prepare(
      `UPDATE users SET ${fields.join(', ')} WHERE github_id = ?`
    ).bind(...values).run()
  }

  async updateUserProfile(userId: number, email: string | null, emailNotifications: boolean): Promise<void> {
    await this.db.prepare(
      'UPDATE users SET email = ?, email_notifications = ? WHERE id = ?'
    ).bind(email, emailNotifications ? 1 : 0, userId).run()
  }

  async updateUserRole(userId: number, role: 'admin' | 'premium' | 'user' | 'guest'): Promise<void> {
    await this.db.prepare(
      'UPDATE users SET role = ? WHERE id = ?'
    ).bind(role, userId).run()
  }

  async deleteUser(userId: number): Promise<void> {
    await this.db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run()
  }

  async listUsers(): Promise<User[]> {
    const result = await this.db.prepare(
      'SELECT * FROM users ORDER BY created_at DESC'
    ).all()
    return result.results as User[]
  }

  // Repo operations
  async getRepoByOwnerName(owner: string, name: string): Promise<Repo | null> {
    return await this.db.prepare(
      'SELECT * FROM repos WHERE owner = ? AND name = ?'
    ).bind(owner, name).first() as Repo | null
  }

  async createRepo(owner: string, name: string, webhookSecret: string): Promise<Repo> {
    const result = await this.db.prepare(`
      INSERT INTO repos (owner, name, webhook_secret)
      VALUES (?, ?, ?)
      RETURNING *
    `).bind(owner, name, webhookSecret).first() as Repo
    return result
  }

  async getUserRepos(userId: number): Promise<(Repo & { user_repo_id: number })[]> {
    const result = await this.db.prepare(`
      SELECT r.*, ur.id as user_repo_id
      FROM repos r
      JOIN user_repos ur ON ur.repo_id = r.id
      WHERE ur.user_id = ?
      ORDER BY ur.created_at DESC
    `).bind(userId).all()
    return result.results as (Repo & { user_repo_id: number })[]
  }

  async getUserRepoLink(userId: number, repoId: number): Promise<UserRepo | null> {
    return await this.db.prepare(
      'SELECT * FROM user_repos WHERE user_id = ? AND repo_id = ?'
    ).bind(userId, repoId).first() as UserRepo | null
  }

  async createUserRepoLink(userId: number, repoId: number): Promise<UserRepo> {
    const result = await this.db.prepare(`
      INSERT INTO user_repos (user_id, repo_id)
      VALUES (?, ?)
      RETURNING *
    `).bind(userId, repoId).first() as UserRepo
    return result
  }

  async deleteUserRepoLink(userId: number, repoId: number): Promise<void> {
    await this.db.prepare(
      'DELETE FROM user_repos WHERE user_id = ? AND repo_id = ?'
    ).bind(userId, repoId).run()
  }

  // Star operations
  async getStarredIssueIds(userId: number, repoOwner: string, repoName: string): Promise<string[]> {
    const result = await this.db.prepare(
      'SELECT issue_id FROM stars WHERE user_id = ? AND repo_owner = ? AND repo_name = ?'
    ).bind(userId, repoOwner, repoName).all()
    return result.results.map((r: { issue_id: string }) => r.issue_id)
  }

  async createStar(userId: number, repoOwner: string, repoName: string, issueId: string): Promise<void> {
    await this.db.prepare(
      'INSERT OR IGNORE INTO stars (user_id, repo_owner, repo_name, issue_id) VALUES (?, ?, ?, ?)'
    ).bind(userId, repoOwner, repoName, issueId).run()
  }

  async deleteStar(userId: number, repoOwner: string, repoName: string, issueId: string): Promise<void> {
    await this.db.prepare(
      'DELETE FROM stars WHERE user_id = ? AND repo_owner = ? AND repo_name = ? AND issue_id = ?'
    ).bind(userId, repoOwner, repoName, issueId).run()
  }

  // Settings operations
  async getSetting(key: string): Promise<string | null> {
    const result = await this.db.prepare(
      'SELECT value FROM settings WHERE key = ?'
    ).bind(key).first() as { value: string } | null
    return result?.value ?? null
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const result = await this.db.prepare('SELECT key, value FROM settings').all()
    const settings: Record<string, string> = {}
    for (const row of result.results as { key: string; value: string }[]) {
      settings[row.key] = row.value
    }
    return settings
  }

  async upsertSetting(key: string, value: string): Promise<void> {
    await this.db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `).bind(key, value, value).run()
  }

  // Webhook state operations
  async getWebhookState(repoOwner: string, repoName: string): Promise<WebhookState | null> {
    return await this.db.prepare(
      'SELECT * FROM webhook_state WHERE repo_owner = ? AND repo_name = ?'
    ).bind(repoOwner, repoName).first() as WebhookState | null
  }

  async upsertWebhookState(repoOwner: string, repoName: string, hash: string, snapshot: string): Promise<void> {
    await this.db.prepare(`
      INSERT INTO webhook_state (repo_owner, repo_name, issues_hash, issues_snapshot, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(repo_owner, repo_name) DO UPDATE SET
        issues_hash = ?, issues_snapshot = ?, updated_at = CURRENT_TIMESTAMP
    `).bind(repoOwner, repoName, hash, snapshot, hash, snapshot).run()
  }

  // Get users to notify for a repo
  async getUsersToNotify(repoOwner: string, repoName: string): Promise<Pick<User, 'id' | 'github_login' | 'email' | 'email_notifications'>[]> {
    const result = await this.db.prepare(`
      SELECT DISTINCT u.id, u.github_login, u.email, u.email_notifications
      FROM users u
      JOIN user_repos ur ON ur.user_id = u.id
      JOIN repos r ON r.id = ur.repo_id
      WHERE r.owner = ? AND r.name = ?
        AND u.email IS NOT NULL
        AND u.email_notifications = 1
    `).bind(repoOwner, repoName).all()
    return result.results as Pick<User, 'id' | 'github_login' | 'email' | 'email_notifications'>[]
  }
}
