import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KVSessionStore } from './kv-session-store'

// Mock KVNamespace
function createMockKV() {
  const store = new Map<string, { value: string; expiration?: number }>()

  return {
    get: vi.fn(async (key: string) => {
      const item = store.get(key)
      if (!item) return null
      // Check expiration
      if (item.expiration && Date.now() / 1000 > item.expiration) {
        store.delete(key)
        return null
      }
      return item.value
    }),
    put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
      const expiration = options?.expirationTtl
        ? Math.floor(Date.now() / 1000) + options.expirationTtl
        : undefined
      store.set(key, { value, expiration })
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
    // Expose store for testing
    _store: store,
  } as unknown as KVNamespace & { _store: Map<string, { value: string; expiration?: number }> }
}

describe('KVSessionStore', () => {
  let mockKV: ReturnType<typeof createMockKV>
  let sessionStore: KVSessionStore

  beforeEach(() => {
    mockKV = createMockKV()
    sessionStore = new KVSessionStore(mockKV)
    vi.clearAllMocks()
  })

  describe('getSession', () => {
    it('returns null for non-existent session', async () => {
      const result = await sessionStore.getSession('nonexistent-token')

      expect(result).toBeNull()
      expect(mockKV.get).toHaveBeenCalledWith('session:nonexistent-token')
    })

    it('returns session data for existing session', async () => {
      const sessionData = { userId: 1, githubId: 123, role: 'user' as const }
      await mockKV.put('session:valid-token', JSON.stringify(sessionData))

      const result = await sessionStore.getSession('valid-token')

      expect(result).toEqual(sessionData)
    })

    it('parses JSON session data correctly', async () => {
      const sessionData = {
        userId: 42,
        githubId: 12345,
        role: 'admin' as const,
      }
      await mockKV.put('session:admin-token', JSON.stringify(sessionData))

      const result = await sessionStore.getSession('admin-token')

      expect(result?.userId).toBe(42)
      expect(result?.githubId).toBe(12345)
      expect(result?.role).toBe('admin')
    })
  })

  describe('createSession', () => {
    it('stores session with correct key', async () => {
      const sessionData = { userId: 1, githubId: 123, role: 'user' as const }

      await sessionStore.createSession('new-token', sessionData, 3600)

      expect(mockKV.put).toHaveBeenCalledWith(
        'session:new-token',
        JSON.stringify(sessionData),
        { expirationTtl: 3600 }
      )
    })

    it('stores session with TTL', async () => {
      const sessionData = { userId: 1, githubId: 123, role: 'user' as const }

      await sessionStore.createSession('token', sessionData, 7200)

      expect(mockKV.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { expirationTtl: 7200 }
      )
    })

    it('session can be retrieved after creation', async () => {
      const sessionData = { userId: 5, githubId: 500, role: 'premium' as const }

      await sessionStore.createSession('retrieve-test', sessionData, 3600)
      const result = await sessionStore.getSession('retrieve-test')

      expect(result).toEqual(sessionData)
    })
  })

  describe('deleteSession', () => {
    it('deletes session by token', async () => {
      await mockKV.put('session:to-delete', JSON.stringify({ userId: 1 }))

      await sessionStore.deleteSession('to-delete')

      expect(mockKV.delete).toHaveBeenCalledWith('session:to-delete')
    })

    it('session cannot be retrieved after deletion', async () => {
      const sessionData = { userId: 1, githubId: 123, role: 'user' as const }
      await sessionStore.createSession('delete-test', sessionData, 3600)

      await sessionStore.deleteSession('delete-test')
      const result = await sessionStore.getSession('delete-test')

      expect(result).toBeNull()
    })
  })

  describe('getUserSessions', () => {
    it('returns empty array for user with no sessions', async () => {
      const result = await sessionStore.getUserSessions(999)

      expect(result).toEqual([])
    })

    it('returns session tokens for user', async () => {
      await mockKV.put('user_sessions:1', JSON.stringify(['token1', 'token2']))

      const result = await sessionStore.getUserSessions(1)

      expect(result).toEqual(['token1', 'token2'])
    })

    it('queries correct key format', async () => {
      await sessionStore.getUserSessions(42)

      expect(mockKV.get).toHaveBeenCalledWith('user_sessions:42')
    })
  })

  describe('addUserSession', () => {
    it('adds token to empty user sessions list', async () => {
      await sessionStore.addUserSession(1, 'new-token', 3600)

      expect(mockKV.put).toHaveBeenCalledWith(
        'user_sessions:1',
        JSON.stringify(['new-token']),
        { expirationTtl: 3600 }
      )
    })

    it('appends token to existing user sessions list', async () => {
      await mockKV.put('user_sessions:1', JSON.stringify(['existing-token']))

      await sessionStore.addUserSession(1, 'new-token', 3600)

      expect(mockKV.put).toHaveBeenCalledWith(
        'user_sessions:1',
        JSON.stringify(['existing-token', 'new-token']),
        { expirationTtl: 3600 }
      )
    })

    it('stores with TTL', async () => {
      await sessionStore.addUserSession(1, 'token', 7200)

      expect(mockKV.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { expirationTtl: 7200 }
      )
    })
  })

  describe('deleteAllUserSessions', () => {
    it('deletes all individual sessions', async () => {
      await mockKV.put('user_sessions:1', JSON.stringify(['token1', 'token2', 'token3']))
      await mockKV.put('session:token1', JSON.stringify({ userId: 1 }))
      await mockKV.put('session:token2', JSON.stringify({ userId: 1 }))
      await mockKV.put('session:token3', JSON.stringify({ userId: 1 }))

      await sessionStore.deleteAllUserSessions(1)

      expect(mockKV.delete).toHaveBeenCalledWith('session:token1')
      expect(mockKV.delete).toHaveBeenCalledWith('session:token2')
      expect(mockKV.delete).toHaveBeenCalledWith('session:token3')
    })

    it('deletes the user sessions list', async () => {
      await mockKV.put('user_sessions:1', JSON.stringify(['token1']))

      await sessionStore.deleteAllUserSessions(1)

      expect(mockKV.delete).toHaveBeenCalledWith('user_sessions:1')
    })

    it('handles empty sessions list gracefully', async () => {
      // No sessions for user 999
      await sessionStore.deleteAllUserSessions(999)

      // Should still try to delete the list
      expect(mockKV.delete).toHaveBeenCalledWith('user_sessions:999')
    })
  })

  describe('checkRateLimit', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-10T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('allows request under limit', async () => {
      const result = await sessionStore.checkRateLimit('test-key', 10, 60)

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9)
    })

    it('increments counter on allowed request', async () => {
      await sessionStore.checkRateLimit('test-key', 10, 60)

      // Second request should have 8 remaining
      const result = await sessionStore.checkRateLimit('test-key', 10, 60)

      expect(result.remaining).toBe(8)
    })

    it('denies request at limit', async () => {
      // Make 10 requests
      for (let i = 0; i < 10; i++) {
        await sessionStore.checkRateLimit('limit-key', 10, 60)
      }

      // 11th request should be denied
      const result = await sessionStore.checkRateLimit('limit-key', 10, 60)

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('uses window-based rate limiting', async () => {
      const windowSeconds = 60
      const now = Math.floor(Date.now() / 1000)
      const windowStart = Math.floor(now / windowSeconds) * windowSeconds

      await sessionStore.checkRateLimit('window-key', 10, windowSeconds)

      // Should use windowed key
      const expectedKey = `ratelimit:window-key:${windowStart}`
      expect(mockKV.put).toHaveBeenCalledWith(
        expectedKey,
        '1',
        expect.any(Object)
      )
    })

    it('returns correct resetAt timestamp', async () => {
      const windowSeconds = 60
      const now = Math.floor(Date.now() / 1000)
      const windowStart = Math.floor(now / windowSeconds) * windowSeconds
      const expectedResetAt = windowStart + windowSeconds

      const result = await sessionStore.checkRateLimit('reset-key', 10, windowSeconds)

      expect(result.resetAt).toBe(expectedResetAt)
    })

    it('does not increment counter on denied request', async () => {
      // Fill up the rate limit
      for (let i = 0; i < 10; i++) {
        await sessionStore.checkRateLimit('no-inc-key', 10, 60)
      }

      const putCallCount = (mockKV.put as ReturnType<typeof vi.fn>).mock.calls.length

      // Try another request
      await sessionStore.checkRateLimit('no-inc-key', 10, 60)

      // Should not have called put again
      expect((mockKV.put as ReturnType<typeof vi.fn>).mock.calls.length).toBe(putCallCount)
    })

    it('stores with double TTL for cleanup', async () => {
      await sessionStore.checkRateLimit('ttl-key', 10, 60)

      expect(mockKV.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { expirationTtl: 120 } // 60 * 2
      )
    })

    it('separates different rate limit keys', async () => {
      await sessionStore.checkRateLimit('key-a', 10, 60)
      await sessionStore.checkRateLimit('key-b', 10, 60)

      const result = await sessionStore.checkRateLimit('key-a', 10, 60)

      // key-a should have 8 remaining (not affected by key-b)
      expect(result.remaining).toBe(8)
    })
  })
})
