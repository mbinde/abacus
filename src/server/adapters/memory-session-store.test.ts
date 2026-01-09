import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { MemorySessionStore } from './memory-session-store'

describe('MemorySessionStore', () => {
  let store: MemorySessionStore

  beforeEach(() => {
    vi.useFakeTimers()
    store = new MemorySessionStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('session operations', () => {
    it('creates and retrieves a session', async () => {
      const token = 'test-token-123'
      const data = { userId: 1, githubToken: 'gh-token' }

      await store.createSession(token, data, 3600)
      const retrieved = await store.getSession(token)

      expect(retrieved).toEqual(data)
    })

    it('returns null for non-existent session', async () => {
      const result = await store.getSession('nonexistent')
      expect(result).toBeNull()
    })

    it('deletes a session', async () => {
      const token = 'test-token-123'
      await store.createSession(token, { userId: 1, githubToken: 'gh' }, 3600)

      await store.deleteSession(token)
      const result = await store.getSession(token)

      expect(result).toBeNull()
    })

    it('expires sessions after TTL', async () => {
      const token = 'test-token-123'
      await store.createSession(token, { userId: 1, githubToken: 'gh' }, 60)

      // Session exists before expiry
      let result = await store.getSession(token)
      expect(result).not.toBeNull()

      // Advance time past TTL
      vi.advanceTimersByTime(61 * 1000)

      result = await store.getSession(token)
      expect(result).toBeNull()
    })
  })

  describe('user session tracking', () => {
    it('tracks user sessions', async () => {
      const userId = 123
      await store.addUserSession(userId, 'token-1', 3600)
      await store.addUserSession(userId, 'token-2', 3600)

      const sessions = await store.getUserSessions(userId)

      expect(sessions).toHaveLength(2)
      expect(sessions).toContain('token-1')
      expect(sessions).toContain('token-2')
    })

    it('returns empty array for user with no sessions', async () => {
      const sessions = await store.getUserSessions(999)
      expect(sessions).toEqual([])
    })

    it('deletes all user sessions', async () => {
      const userId = 123
      await store.createSession('token-1', { userId, githubToken: 'gh' }, 3600)
      await store.createSession('token-2', { userId, githubToken: 'gh' }, 3600)
      await store.addUserSession(userId, 'token-1', 3600)
      await store.addUserSession(userId, 'token-2', 3600)

      await store.deleteAllUserSessions(userId)

      const sessions = await store.getUserSessions(userId)
      expect(sessions).toEqual([])

      // Individual sessions should also be deleted
      expect(await store.getSession('token-1')).toBeNull()
      expect(await store.getSession('token-2')).toBeNull()
    })

    it('expires user session tracking after TTL', async () => {
      const userId = 123
      await store.addUserSession(userId, 'token-1', 60)

      vi.advanceTimersByTime(61 * 1000)

      const sessions = await store.getUserSessions(userId)
      expect(sessions).toEqual([])
    })
  })

  describe('rate limiting', () => {
    it('allows requests within limit', async () => {
      const key = 'test-key'
      const maxRequests = 5
      const windowSeconds = 60

      for (let i = 0; i < maxRequests; i++) {
        const result = await store.checkRateLimit(key, maxRequests, windowSeconds)
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(maxRequests - i - 1)
      }
    })

    it('blocks requests over limit', async () => {
      const key = 'test-key'
      const maxRequests = 3
      const windowSeconds = 60

      // Use up all requests
      for (let i = 0; i < maxRequests; i++) {
        await store.checkRateLimit(key, maxRequests, windowSeconds)
      }

      // Next request should be blocked
      const result = await store.checkRateLimit(key, maxRequests, windowSeconds)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('resets rate limit after window expires', async () => {
      const key = 'test-key'
      const maxRequests = 2
      const windowSeconds = 60

      // Use up all requests
      await store.checkRateLimit(key, maxRequests, windowSeconds)
      await store.checkRateLimit(key, maxRequests, windowSeconds)

      // Should be blocked
      let result = await store.checkRateLimit(key, maxRequests, windowSeconds)
      expect(result.allowed).toBe(false)

      // Advance past window
      vi.advanceTimersByTime(61 * 1000)

      // Should be allowed again
      result = await store.checkRateLimit(key, maxRequests, windowSeconds)
      expect(result.allowed).toBe(true)
    })

    it('tracks rate limits per key', async () => {
      const maxRequests = 1
      const windowSeconds = 60

      // Use up limit for key1
      await store.checkRateLimit('key1', maxRequests, windowSeconds)

      // key2 should still be allowed
      const result = await store.checkRateLimit('key2', maxRequests, windowSeconds)
      expect(result.allowed).toBe(true)
    })

    it('provides reset time', async () => {
      const windowSeconds = 60
      const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds

      const result = await store.checkRateLimit('key', 5, windowSeconds)

      expect(result.resetAt).toBe(windowStart + windowSeconds)
    })
  })

  describe('cleanup', () => {
    it('cleans up expired entries periodically', async () => {
      await store.createSession('token-1', { userId: 1, githubToken: 'gh' }, 30)
      await store.addUserSession(1, 'token-1', 30)

      // Verify session exists
      expect(await store.getSession('token-1')).not.toBeNull()

      // Advance time past TTL
      vi.advanceTimersByTime(31 * 1000)

      // Trigger cleanup interval (runs every 60 seconds)
      vi.advanceTimersByTime(60 * 1000)

      // Session should be cleaned up
      expect(await store.getSession('token-1')).toBeNull()
    })
  })
})
