// Session store abstraction interface
// Implement this for different session backends (KV, Redis, Memory, Database)

export interface SessionData {
  userId: number
  githubId: number
  role: 'admin' | 'premium' | 'user'
}

export interface SessionStore {
  // Session operations
  getSession(token: string): Promise<SessionData | null>
  createSession(token: string, data: SessionData, ttlSeconds: number): Promise<void>
  deleteSession(token: string): Promise<void>

  // User session tracking (for bulk invalidation)
  getUserSessions(userId: number): Promise<string[]>
  addUserSession(userId: number, token: string, ttlSeconds: number): Promise<void>
  deleteAllUserSessions(userId: number): Promise<void>

  // Rate limiting
  checkRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<{
    allowed: boolean
    remaining: number
    resetAt: number
  }>
}

// Default TTL values
export const SESSION_TTL = 7 * 24 * 60 * 60 // 7 days in seconds
export const RATE_LIMIT_WINDOW = 60 // 60 seconds
export const RATE_LIMIT_MAX = 10 // 10 requests per window
