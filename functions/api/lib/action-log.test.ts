import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logAction, startTimer, generateRequestId, type ActionLogEntry } from './action-log'

describe('action-log', () => {
  describe('logAction', () => {
    let mockDb: {
      prepare: ReturnType<typeof vi.fn>
    }
    let mockStatement: {
      bind: ReturnType<typeof vi.fn>
      run: ReturnType<typeof vi.fn>
    }

    beforeEach(() => {
      mockStatement = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({}),
      }
      mockDb = {
        prepare: vi.fn().mockReturnValue(mockStatement),
      }
    })

    it('does nothing when db is null', async () => {
      await logAction(null, {
        action: 'create_issue',
        repoOwner: 'owner',
        repoName: 'repo',
        success: true,
      })

      // Should not throw
    })

    it('inserts log entry into database', async () => {
      const entry: ActionLogEntry = {
        userId: 1,
        userLogin: 'alice',
        action: 'create_issue',
        repoOwner: 'owner',
        repoName: 'repo',
        issueId: 'issue-123',
        success: true,
      }

      await logAction(mockDb as unknown as D1Database, entry)

      expect(mockDb.prepare).toHaveBeenCalled()
      expect(mockStatement.bind).toHaveBeenCalled()
      expect(mockStatement.run).toHaveBeenCalled()
    })

    it('binds all required fields', async () => {
      const entry: ActionLogEntry = {
        userId: 42,
        userLogin: 'bob',
        action: 'update_issue',
        repoOwner: 'my-org',
        repoName: 'my-repo',
        issueId: 'bug-456',
        requestPayload: { status: 'closed' },
        success: true,
        errorMessage: undefined,
        retryCount: 0,
        conflictDetected: false,
        durationMs: 150,
        requestId: 'req-abc',
      }

      await logAction(mockDb as unknown as D1Database, entry)

      expect(mockStatement.bind).toHaveBeenCalledWith(
        42,                               // userId
        'bob',                            // userLogin
        'update_issue',                   // action
        'my-org',                         // repoOwner
        'my-repo',                        // repoName
        'bug-456',                        // issueId
        '{"status":"closed"}',            // requestPayload (JSON)
        1,                                // success (boolean as 1/0)
        null,                             // errorMessage
        0,                                // retryCount
        0,                                // conflictDetected (boolean as 1/0)
        150,                              // durationMs
        'req-abc'                         // requestId
      )
    })

    it('handles missing optional fields', async () => {
      const entry: ActionLogEntry = {
        action: 'delete_issue',
        repoOwner: 'owner',
        repoName: 'repo',
        success: false,
        errorMessage: 'Not found',
      }

      await logAction(mockDb as unknown as D1Database, entry)

      expect(mockStatement.bind).toHaveBeenCalledWith(
        null,                             // userId
        null,                             // userLogin
        'delete_issue',                   // action
        'owner',                          // repoOwner
        'repo',                           // repoName
        null,                             // issueId
        null,                             // requestPayload
        0,                                // success (false = 0)
        'Not found',                      // errorMessage
        0,                                // retryCount (default)
        0,                                // conflictDetected (default)
        null,                             // durationMs
        null                              // requestId
      )
    })

    it('serializes requestPayload to JSON', async () => {
      const entry: ActionLogEntry = {
        action: 'bulk_update',
        repoOwner: 'owner',
        repoName: 'repo',
        requestPayload: { ids: ['a', 'b', 'c'], status: 'closed' },
        success: true,
      }

      await logAction(mockDb as unknown as D1Database, entry)

      const bindCall = mockStatement.bind.mock.calls[0]
      const payloadArg = bindCall[6] // 7th argument is requestPayload
      expect(payloadArg).toBe('{"ids":["a","b","c"],"status":"closed"}')
    })

    it('converts boolean success to integer', async () => {
      const successEntry: ActionLogEntry = {
        action: 'add_comment',
        repoOwner: 'owner',
        repoName: 'repo',
        success: true,
      }

      const failEntry: ActionLogEntry = {
        action: 'add_comment',
        repoOwner: 'owner',
        repoName: 'repo',
        success: false,
      }

      await logAction(mockDb as unknown as D1Database, successEntry)
      expect(mockStatement.bind.mock.calls[0][7]).toBe(1) // success = true = 1

      await logAction(mockDb as unknown as D1Database, failEntry)
      expect(mockStatement.bind.mock.calls[1][7]).toBe(0) // success = false = 0
    })

    it('converts boolean conflictDetected to integer', async () => {
      const conflictEntry: ActionLogEntry = {
        action: 'update_issue',
        repoOwner: 'owner',
        repoName: 'repo',
        success: true,
        conflictDetected: true,
      }

      await logAction(mockDb as unknown as D1Database, conflictEntry)

      const bindCall = mockStatement.bind.mock.calls[0]
      expect(bindCall[10]).toBe(1) // conflictDetected = true = 1
    })

    it('catches and logs database errors without throwing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockStatement.run.mockRejectedValue(new Error('Database error'))

      const entry: ActionLogEntry = {
        action: 'create_issue',
        repoOwner: 'owner',
        repoName: 'repo',
        success: true,
      }

      // Should not throw
      await logAction(mockDb as unknown as D1Database, entry)

      expect(consoleSpy).toHaveBeenCalledWith(
        '[action-log] Failed to log action:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })

    it('supports all action types', async () => {
      const actions: ActionLogEntry['action'][] = [
        'update_issue',
        'add_comment',
        'delete_issue',
        'bulk_update',
        'create_issue',
      ]

      for (const action of actions) {
        await logAction(mockDb as unknown as D1Database, {
          action,
          repoOwner: 'owner',
          repoName: 'repo',
          success: true,
        })
      }

      expect(mockStatement.run).toHaveBeenCalledTimes(5)
    })
  })

  describe('startTimer', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns a function', () => {
      const timer = startTimer()

      expect(typeof timer).toBe('function')
    })

    it('returns elapsed milliseconds', () => {
      const timer = startTimer()

      vi.advanceTimersByTime(100)
      const elapsed = timer()

      expect(elapsed).toBe(100)
    })

    it('can be called multiple times', () => {
      const timer = startTimer()

      vi.advanceTimersByTime(50)
      const first = timer()

      vi.advanceTimersByTime(50)
      const second = timer()

      expect(first).toBe(50)
      expect(second).toBe(100)
    })

    it('starts from call time', () => {
      vi.advanceTimersByTime(1000) // Some time passes before timer starts

      const timer = startTimer()
      vi.advanceTimersByTime(50)

      expect(timer()).toBe(50)
    })

    it('handles zero elapsed time', () => {
      const timer = startTimer()
      const elapsed = timer()

      expect(elapsed).toBe(0)
    })

    it('handles longer durations', () => {
      const timer = startTimer()

      vi.advanceTimersByTime(5000) // 5 seconds
      const elapsed = timer()

      expect(elapsed).toBe(5000)
    })
  })

  describe('generateRequestId', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-10T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns a string', () => {
      const id = generateRequestId()

      expect(typeof id).toBe('string')
    })

    it('includes timestamp component', () => {
      const id = generateRequestId()
      const timestamp = Date.now().toString(36)

      expect(id.startsWith(timestamp)).toBe(true)
    })

    it('has format timestamp-random', () => {
      const id = generateRequestId()

      expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/)
    })

    it('generates unique IDs', () => {
      const ids = new Set<string>()

      for (let i = 0; i < 100; i++) {
        ids.add(generateRequestId())
      }

      // All should be unique (random component ensures this)
      expect(ids.size).toBe(100)
    })

    it('random component is 6 characters', () => {
      const id = generateRequestId()
      const parts = id.split('-')

      expect(parts[1].length).toBe(6)
    })

    it('changes with time', () => {
      const id1 = generateRequestId()

      vi.advanceTimersByTime(1000)

      const id2 = generateRequestId()

      // Timestamp part should be different
      const timestamp1 = id1.split('-')[0]
      const timestamp2 = id2.split('-')[0]

      expect(timestamp1).not.toBe(timestamp2)
    })
  })
})
