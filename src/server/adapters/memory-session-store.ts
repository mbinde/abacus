// In-memory session store adapter (for development/testing or single-instance deployments)

import type { SessionStore, SessionData } from '../interfaces/session-store'

interface StoredSession {
  data: SessionData
  expiresAt: number
}

export class MemorySessionStore implements SessionStore {
  private sessions = new Map<string, StoredSession>()
  private userSessions = new Map<number, { tokens: string[]; expiresAt: number }>()
  private rateLimits = new Map<string, { count: number; expiresAt: number }>()

  constructor() {
    // Clean up expired entries periodically
    setInterval(() => this.cleanup(), 60000) // Every minute
  }

  private cleanup(): void {
    const now = Date.now()

    for (const [key, session] of this.sessions) {
      if (session.expiresAt < now) {
        this.sessions.delete(key)
      }
    }

    for (const [userId, data] of this.userSessions) {
      if (data.expiresAt < now) {
        this.userSessions.delete(userId)
      }
    }

    for (const [key, data] of this.rateLimits) {
      if (data.expiresAt < now) {
        this.rateLimits.delete(key)
      }
    }
  }

  async getSession(token: string): Promise<SessionData | null> {
    const session = this.sessions.get(`session:${token}`)
    if (!session) return null
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(`session:${token}`)
      return null
    }
    return session.data
  }

  async createSession(token: string, data: SessionData, ttlSeconds: number): Promise<void> {
    this.sessions.set(`session:${token}`, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
  }

  async deleteSession(token: string): Promise<void> {
    this.sessions.delete(`session:${token}`)
  }

  async getUserSessions(userId: number): Promise<string[]> {
    const data = this.userSessions.get(userId)
    if (!data) return []
    if (data.expiresAt < Date.now()) {
      this.userSessions.delete(userId)
      return []
    }
    return data.tokens
  }

  async addUserSession(userId: number, token: string, ttlSeconds: number): Promise<void> {
    const existing = await this.getUserSessions(userId)
    this.userSessions.set(userId, {
      tokens: [...existing, token],
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
  }

  async deleteAllUserSessions(userId: number): Promise<void> {
    const tokens = await this.getUserSessions(userId)
    for (const token of tokens) {
      this.sessions.delete(`session:${token}`)
    }
    this.userSessions.delete(userId)
  }

  async checkRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<{
    allowed: boolean
    remaining: number
    resetAt: number
  }> {
    const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds
    const rateLimitKey = `ratelimit:${key}:${windowStart}`

    const existing = this.rateLimits.get(rateLimitKey)
    const count = existing && existing.expiresAt > Date.now() ? existing.count : 0

    const allowed = count < maxRequests
    const remaining = Math.max(0, maxRequests - count - (allowed ? 1 : 0))
    const resetAt = windowStart + windowSeconds

    if (allowed) {
      this.rateLimits.set(rateLimitKey, {
        count: count + 1,
        expiresAt: Date.now() + windowSeconds * 2 * 1000,
      })
    }

    return { allowed, remaining, resetAt }
  }
}
