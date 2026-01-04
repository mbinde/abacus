// Cloudflare KV session store adapter

import type { SessionStore, SessionData } from '../interfaces/session-store'

export class KVSessionStore implements SessionStore {
  constructor(private kv: KVNamespace) {}

  async getSession(token: string): Promise<SessionData | null> {
    const data = await this.kv.get(`session:${token}`)
    if (!data) return null
    return JSON.parse(data) as SessionData
  }

  async createSession(token: string, data: SessionData, ttlSeconds: number): Promise<void> {
    await this.kv.put(`session:${token}`, JSON.stringify(data), {
      expirationTtl: ttlSeconds,
    })
  }

  async deleteSession(token: string): Promise<void> {
    await this.kv.delete(`session:${token}`)
  }

  async getUserSessions(userId: number): Promise<string[]> {
    const data = await this.kv.get(`user_sessions:${userId}`)
    if (!data) return []
    return JSON.parse(data) as string[]
  }

  async addUserSession(userId: number, token: string, ttlSeconds: number): Promise<void> {
    const sessions = await this.getUserSessions(userId)
    sessions.push(token)
    await this.kv.put(`user_sessions:${userId}`, JSON.stringify(sessions), {
      expirationTtl: ttlSeconds,
    })
  }

  async deleteAllUserSessions(userId: number): Promise<void> {
    const sessions = await this.getUserSessions(userId)
    // Delete all individual sessions
    for (const token of sessions) {
      await this.kv.delete(`session:${token}`)
    }
    // Delete the user sessions list
    await this.kv.delete(`user_sessions:${userId}`)
  }

  async checkRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<{
    allowed: boolean
    remaining: number
    resetAt: number
  }> {
    const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds
    const rateLimitKey = `ratelimit:${key}:${windowStart}`

    const current = await this.kv.get(rateLimitKey)
    const count = current ? parseInt(current, 10) : 0

    const allowed = count < maxRequests
    const remaining = Math.max(0, maxRequests - count - (allowed ? 1 : 0))
    const resetAt = windowStart + windowSeconds

    if (allowed) {
      await this.kv.put(rateLimitKey, String(count + 1), {
        expirationTtl: windowSeconds * 2,
      })
    }

    return { allowed, remaining, resetAt }
  }
}
