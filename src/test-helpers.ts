// Test helpers for abacus
// Following beads patterns: test isolation, temp directories, cleanup

import type { Issue } from './lib/beads'

/**
 * Creates a mock issue with default values for testing
 */
export function createMockIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: `test-${Math.random().toString(36).substring(2, 5)}`,
    title: 'Test Issue',
    status: 'open',
    priority: 2,
    issue_type: 'task',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Creates multiple mock issues
 */
export function createMockIssues(count: number, overrides: Partial<Issue> = {}): Issue[] {
  return Array.from({ length: count }, (_, i) =>
    createMockIssue({
      id: `test-${i + 1}`,
      title: `Test Issue ${i + 1}`,
      ...overrides,
    })
  )
}

/**
 * Creates JSONL content from issues
 */
export function issuesToJsonl(issues: Issue[]): string {
  return issues.map(issue => JSON.stringify(issue)).join('\n') + '\n'
}

/**
 * Mock user for testing
 */
export interface MockUser {
  id: number
  github_id: number
  github_login: string
  github_name: string
  github_avatar_url: string
  role: 'user' | 'admin' | 'premium' | 'guest'
  encrypted_token?: string
  email?: string
  email_notifications?: boolean
  created_at: string
  updated_at: string
}

export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  const id = Math.floor(Math.random() * 10000)
  return {
    id,
    github_id: id + 1000,
    github_login: `testuser${id}`,
    github_name: `Test User ${id}`,
    github_avatar_url: `https://avatars.githubusercontent.com/u/${id}`,
    role: 'user',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Mock repo for testing
 */
export interface MockRepo {
  id: number
  owner: string
  name: string
  webhook_secret?: string
  created_at: string
}

export function createMockRepo(overrides: Partial<MockRepo> = {}): MockRepo {
  const id = Math.floor(Math.random() * 10000)
  return {
    id,
    owner: `owner${id}`,
    name: `repo${id}`,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Wait for a condition to be true (for async tests)
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const start = Date.now()
  while (!(await condition())) {
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor timed out after ${timeout}ms`)
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }
}

/**
 * Verify that an async function throws an error
 */
export async function expectAsyncError(
  fn: () => Promise<unknown>,
  messageMatch?: string | RegExp
): Promise<void> {
  let threw = false
  let errorMessage = ''

  try {
    await fn()
  } catch (e) {
    threw = true
    errorMessage = e instanceof Error ? e.message : String(e)
  }

  if (!threw) {
    throw new Error('Expected function to throw an error')
  }

  if (messageMatch) {
    if (typeof messageMatch === 'string') {
      if (!errorMessage.includes(messageMatch)) {
        throw new Error(`Expected error message to include "${messageMatch}", got: "${errorMessage}"`)
      }
    } else {
      if (!messageMatch.test(errorMessage)) {
        throw new Error(`Expected error message to match ${messageMatch}, got: "${errorMessage}"`)
      }
    }
  }
}
