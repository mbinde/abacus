// /api/repos/:owner/:repo/issues/:id - Update and delete issues

import type { UserContext, AnonymousContext } from '../../../../_middleware'
import { logAction, startTimer, generateRequestId } from '../../../../../lib/action-log'
import { validateRepoAccess, isAnonymous } from '../../../../../lib/repo-access'
import { validateIssueId, validateRepoOwner, validateRepoName } from '../../../../../lib/validation'

// UTF-8 safe base64 encoding (handles emojis and non-Latin1 characters)
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

interface Issue {
  id: string
  title: string
  description?: string
  status: 'open' | 'closed' | 'in_progress'
  priority: number
  issue_type: 'bug' | 'feature' | 'task' | 'epic'
  assignee?: string
  created_at: string
  updated_at?: string
  closed_at?: string
  parent?: string
  sha?: string
}

// Retry configuration
const MAX_RETRIES = 3
const BASE_DELAY_MS = 100

// PUT /api/repos/:owner/:repo/issues/:id - Update an issue
export const onRequestPut: PagesFunction<{ DB: D1Database }> = async (context) => {
  const { request, params, data, env } = context
  const user = (data as { user: UserContext | AnonymousContext }).user
  const owner = params.owner as string
  const repo = params.repo as string
  const issueId = params.id as string

  // Block anonymous users and guests from updating issues
  if (isAnonymous(user)) {
    return new Response(JSON.stringify({ error: 'Login required to update issues' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (user.role === 'guest') {
    return new Response(JSON.stringify({ error: 'Guest users cannot update issues. Contact an admin to upgrade your account.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Validate path parameters
  const ownerValidation = validateRepoOwner(owner)
  if (!ownerValidation.valid) {
    return new Response(JSON.stringify({ error: ownerValidation.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const repoValidation = validateRepoName(repo)
  if (!repoValidation.valid) {
    return new Response(JSON.stringify({ error: repoValidation.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const issueIdValidation = validateIssueId(issueId)
  if (!issueIdValidation.valid) {
    return new Response(JSON.stringify({ error: issueIdValidation.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Validate repo access
  const accessDenied = await validateRepoAccess(env, user, owner, repo, true)
  if (accessDenied) return accessDenied

  const timer = startTimer()
  const requestId = generateRequestId()
  let reqData: Partial<Issue> = {}
  let baseState: BaseState | undefined

  try {
    const rawBody = await request.json() as Record<string, unknown>

    // Support both old format (direct updates) and new format (updates + baseState)
    if (rawBody.updates && typeof rawBody.updates === 'object') {
      // New format: { updates: {...}, baseState?: {...} }
      reqData = rawBody.updates as Partial<Issue>
      if (rawBody.baseState && typeof rawBody.baseState === 'object') {
        const bs = rawBody.baseState as { issue?: unknown; fetchedAt?: string }
        if (bs.issue && bs.fetchedAt) {
          baseState = {
            issue: normalizeIssue(bs.issue as Record<string, unknown>),
            fetchedAt: bs.fetchedAt
          }
        }
      }
    } else {
      // Old format: direct updates (backward compatible)
      reqData = rawBody as Partial<Issue>
    }

    // Check if using JSONL or markdown format
    const formatCheck = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/.beads/issues.jsonl`,
      {
        headers: {
          'Authorization': `token ${user.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'abacus',
        },
      }
    )

    if (formatCheck.ok) {
      // JSONL format - use three-way merge
      const result = await updateIssueWithMerge(user.githubToken, owner, repo, issueId, reqData, baseState)

      // Handle merge conflict - return 409 with conflict details
      if (!result.success && result.mergeResult?.status === 'conflict') {
        await logAction(env.DB ?? null, {
          userId: user.id,
          userLogin: user.github_login,
          action: 'update_issue',
          repoOwner: owner,
          repoName: repo,
          issueId,
          requestPayload: reqData,
          success: false,
          errorMessage: result.error,
          retryCount: result.retryCount,
          conflictDetected: true,
          durationMs: timer(),
          requestId,
        })
        return new Response(JSON.stringify({
          success: false,
          error: result.error,
          conflict: true,
          mergeResult: result.mergeResult
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (!result.success) {
        const status = result.notFound ? 404 : 500
        await logAction(env.DB ?? null, {
          userId: user.id,
          userLogin: user.github_login,
          action: 'update_issue',
          repoOwner: owner,
          repoName: repo,
          issueId,
          requestPayload: reqData,
          success: false,
          errorMessage: result.error,
          retryCount: result.retryCount,
          conflictDetected: result.conflictDetected,
          durationMs: timer(),
          requestId,
        })
        return new Response(JSON.stringify({ error: result.error }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // Log success
      await logAction(env.DB ?? null, {
        userId: user.id,
        userLogin: user.github_login,
        action: 'update_issue',
        repoOwner: owner,
        repoName: repo,
        issueId,
        requestPayload: reqData,
        success: true,
        retryCount: result.retryCount,
        conflictDetected: result.conflictDetected,
        durationMs: timer(),
        requestId,
      })

      // Return success with merge result info
      return new Response(JSON.stringify({
        success: true,
        mergeResult: result.mergeResult
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } else {
      // Markdown format - no three-way merge support (simpler format)
      const result = await updateMarkdownIssueWithMerge(user.githubToken, owner, repo, issueId, reqData)
      if (!result.success) {
        const status = result.notFound ? 404 : 500
        await logAction(env.DB ?? null, {
          userId: user.id,
          userLogin: user.github_login,
          action: 'update_issue',
          repoOwner: owner,
          repoName: repo,
          issueId,
          requestPayload: reqData,
          success: false,
          errorMessage: result.error,
          retryCount: result.retryCount,
          conflictDetected: result.conflictDetected,
          durationMs: timer(),
          requestId,
        })
        return new Response(JSON.stringify({ error: result.error }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // Log success
      await logAction(env.DB ?? null, {
        userId: user.id,
        userLogin: user.github_login,
        action: 'update_issue',
        repoOwner: owner,
        repoName: repo,
        issueId,
        requestPayload: reqData,
        success: true,
        retryCount: result.retryCount,
        conflictDetected: result.conflictDetected,
        durationMs: timer(),
        requestId,
      })

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch (err) {
    console.error('Error updating issue:', err)
    await logAction(env.DB ?? null, {
      userId: user.id,
      userLogin: user.github_login,
      action: 'update_issue',
      repoOwner: owner,
      repoName: repo,
      issueId,
      requestPayload: reqData,
      success: false,
      errorMessage: err instanceof Error ? err.message : 'Unknown error',
      durationMs: timer(),
      requestId,
    })
    return new Response(JSON.stringify({ error: 'Failed to update issue' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

interface UpdateResult {
  success: boolean
  error?: string
  notFound?: boolean
  retryCount?: number
  conflictDetected?: boolean
  mergeResult?: MergeResult
}

// Three-way merge types
type EditableField = 'title' | 'description' | 'status' | 'priority' | 'issue_type' | 'assignee'

const EDITABLE_FIELDS: EditableField[] = [
  'title', 'description', 'status', 'priority', 'issue_type', 'assignee'
]

interface FieldConflict {
  field: EditableField
  baseValue: unknown
  localValue: unknown
  remoteValue: unknown
  remoteUpdatedAt: string
}

interface MergeResult {
  status: 'success' | 'auto_merged' | 'conflict'
  mergedIssue?: Issue
  autoMergedFields?: EditableField[]
  conflicts?: FieldConflict[]
  remoteIssue?: Issue
}

interface BaseState {
  issue: Issue
  fetchedAt: string
}

// Deep equality check for field values
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  // Treat undefined and empty string as equivalent
  if ((a === undefined || a === '') && (b === undefined || b === '')) return true
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Performs three-way merge following beads' updated_at tiebreaker strategy.
 *
 * Algorithm:
 * 1. For each editable field, compare base vs local and base vs remote
 * 2. If only local changed: use local value
 * 3. If only remote changed: use remote value (auto-merge)
 * 4. If both changed to same value: no conflict, use that value
 * 5. If both changed to different values: TRUE CONFLICT
 */
// Helper to set a field on Issue (type-safe approach)
function setIssueField(issue: Issue, field: EditableField, value: unknown): void {
  switch (field) {
    case 'title': issue.title = value as string; break
    case 'description': issue.description = value as string | undefined; break
    case 'status': issue.status = value as Issue['status']; break
    case 'priority': issue.priority = value as number; break
    case 'issue_type': issue.issue_type = value as Issue['issue_type']; break
    case 'assignee': issue.assignee = value as string | undefined; break
  }
}

function performThreeWayMerge(
  baseIssue: Issue | undefined,
  localUpdates: Partial<Issue>,
  remoteIssue: Issue
): MergeResult {
  // No base state: fall back to last-write-wins (apply all local updates)
  if (!baseIssue) {
    const mergedIssue: Issue = { ...remoteIssue }
    for (const field of EDITABLE_FIELDS) {
      if (localUpdates[field] !== undefined) {
        setIssueField(mergedIssue, field, localUpdates[field])
      }
    }
    return {
      status: 'success',
      mergedIssue
    }
  }

  const conflicts: FieldConflict[] = []
  const autoMergedFields: EditableField[] = []
  const mergedIssue: Issue = { ...remoteIssue }

  for (const field of EDITABLE_FIELDS) {
    const baseValue = baseIssue[field]
    const localValue = localUpdates[field]
    const remoteValue = remoteIssue[field]

    // User didn't change this field (undefined means not included in update)
    if (localValue === undefined) {
      // Keep remote value (already in mergedIssue)
      continue
    }

    const remoteChanged = !isEqual(baseValue, remoteValue)
    const localChanged = !isEqual(baseValue, localValue)

    if (!remoteChanged) {
      // Remote unchanged from base, apply local change
      setIssueField(mergedIssue, field, localValue)
    } else if (!localChanged) {
      // Local unchanged from base, keep remote (auto-merge)
      // mergedIssue already has remote value
      autoMergedFields.push(field)
    } else if (isEqual(localValue, remoteValue)) {
      // Both changed to same value - no conflict
      setIssueField(mergedIssue, field, localValue)
    } else {
      // TRUE CONFLICT: both changed to different values
      conflicts.push({
        field,
        baseValue,
        localValue,
        remoteValue,
        remoteUpdatedAt: remoteIssue.updated_at || ''
      })
    }
  }

  if (conflicts.length > 0) {
    return {
      status: 'conflict',
      conflicts,
      remoteIssue,
      mergedIssue, // Partial merge (non-conflicting fields merged)
      autoMergedFields
    }
  }

  if (autoMergedFields.length > 0) {
    return {
      status: 'auto_merged',
      mergedIssue,
      autoMergedFields,
      remoteIssue
    }
  }

  return {
    status: 'success',
    mergedIssue
  }
}

// Update issue in JSONL with three-way merge and retry
async function updateIssueWithMerge(
  token: string,
  owner: string,
  repo: string,
  issueId: string,
  updates: Partial<Issue>,
  baseState?: BaseState
): Promise<UpdateResult> {
  let conflictDetected = false
  let lastMergeResult: MergeResult | undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Fetch current state
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/.beads/issues.jsonl`,
      {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'abacus',
        },
      }
    )

    if (!res.ok) {
      return { success: false, error: 'Failed to fetch issues file', retryCount: attempt }
    }

    const data = await res.json() as { content: string; sha: string }
    const content = atob(data.content.replace(/\n/g, ''))

    // Parse existing issues into map
    const issueMap = new Map<string, Issue>()
    for (const line of content.trim().split('\n')) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line)
        issueMap.set(obj.id, normalizeIssue(obj))
      } catch {}
    }

    // Find the remote issue
    const remoteIssue = issueMap.get(issueId)
    if (!remoteIssue) {
      return { success: false, error: 'Issue not found', notFound: true, retryCount: attempt }
    }

    // Perform three-way merge
    const mergeResult = performThreeWayMerge(
      baseState?.issue,
      updates,
      remoteIssue
    )
    lastMergeResult = mergeResult

    // If true conflicts detected, return immediately for user resolution
    if (mergeResult.status === 'conflict') {
      return {
        success: false,
        error: 'Merge conflict detected - manual resolution required',
        conflictDetected: true,
        retryCount: attempt,
        mergeResult
      }
    }

    // Apply merged issue (either success or auto_merged)
    const updated: Issue = {
      ...mergeResult.mergedIssue!,
      updated_at: new Date().toISOString(),
    }

    // Handle closed_at
    if (updated.status === 'closed' && !updated.closed_at) {
      updated.closed_at = new Date().toISOString()
    }

    issueMap.set(issueId, updated)

    // Serialize back to JSONL
    const newContent = Array.from(issueMap.values())
      .map(serializeJsonlIssue)
      .join('\n') + '\n'

    // Try to write
    const writeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/.beads/issues.jsonl`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'abacus',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Update issue: ${updated.title}`,
          content: utf8ToBase64(newContent),
          sha: data.sha,
        }),
      }
    )

    if (writeRes.ok) {
      return { success: true, retryCount: attempt, conflictDetected, mergeResult: lastMergeResult }
    }

    // Check if it's a conflict (409) or SHA mismatch (422)
    const status = writeRes.status
    if (status === 409 || status === 422) {
      conflictDetected = true
      // SHA conflict - retry with exponential backoff (file changed by someone else)
      // Note: This is different from merge conflict - this means GitHub rejected the write
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
    }

    // Non-conflict error or retries exhausted
    const errData = await writeRes.json() as { message?: string }
    return {
      success: false,
      error: attempt >= MAX_RETRIES
        ? `Failed to save issue after ${MAX_RETRIES + 1} attempts due to concurrent modifications. Please try again.`
        : errData.message || 'Failed to save issue',
      retryCount: attempt,
      conflictDetected,
      mergeResult: lastMergeResult
    }
  }

  return {
    success: false,
    error: `Failed to save issue after ${MAX_RETRIES + 1} attempts due to concurrent modifications. Please try again.`,
    retryCount: MAX_RETRIES,
    conflictDetected,
    mergeResult: lastMergeResult
  }
}

// Update markdown issue with merge-on-conflict and retry
async function updateMarkdownIssueWithMerge(
  token: string,
  owner: string,
  repo: string,
  issueId: string,
  updates: Partial<Issue>
): Promise<UpdateResult> {
  let conflictDetected = false

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Fetch current state
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/.beads/issues/${issueId}.md`,
      {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'abacus',
        },
      }
    )

    if (!res.ok) {
      if (res.status === 404) {
        return { success: false, error: 'Issue not found', notFound: true, retryCount: attempt }
      }
      return { success: false, error: 'Failed to fetch issue file', retryCount: attempt }
    }

    const data = await res.json() as { content: string; sha: string }
    const content = atob(data.content.replace(/\n/g, ''))
    const existing = parseMarkdownIssue(content)

    const updated: Issue = {
      ...existing,
      title: updates.title ?? existing.title,
      description: updates.description ?? existing.description,
      status: updates.status ?? existing.status,
      priority: updates.priority ?? existing.priority,
      issue_type: updates.issue_type ?? existing.issue_type,
    }

    // Try to write
    const writeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/.beads/issues/${issueId}.md`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'abacus',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Update issue: ${updated.title}`,
          content: utf8ToBase64(serializeMarkdownIssue(updated)),
          sha: data.sha,
        }),
      }
    )

    if (writeRes.ok) {
      return { success: true, retryCount: attempt, conflictDetected }
    }

    // Check if it's a conflict (409) or SHA mismatch (422)
    const status = writeRes.status
    if (status === 409 || status === 422) {
      conflictDetected = true
      // Conflict - retry with exponential backoff
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
    }

    // Non-conflict error or retries exhausted
    const errData = await writeRes.json() as { message?: string }
    return {
      success: false,
      error: attempt >= MAX_RETRIES
        ? `Failed to save issue after ${MAX_RETRIES + 1} attempts due to concurrent modifications. Please try again.`
        : errData.message || 'Failed to save issue',
      retryCount: attempt,
      conflictDetected,
    }
  }

  return {
    success: false,
    error: `Failed to save issue after ${MAX_RETRIES + 1} attempts due to concurrent modifications. Please try again.`,
    retryCount: MAX_RETRIES,
    conflictDetected,
  }
}

// DELETE /api/repos/:owner/:repo/issues/:id - Delete an issue
export const onRequestDelete: PagesFunction<{ DB: D1Database }> = async (context) => {
  const { params, data, env } = context
  const user = (data as { user: UserContext | AnonymousContext }).user
  const owner = params.owner as string
  const repo = params.repo as string
  const issueId = params.id as string

  // Block anonymous users and guests from deleting issues
  if (isAnonymous(user)) {
    return new Response(JSON.stringify({ error: 'Login required to delete issues' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (user.role === 'guest') {
    return new Response(JSON.stringify({ error: 'Guest users cannot delete issues. Contact an admin to upgrade your account.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Validate path parameters
  const ownerValidation = validateRepoOwner(owner)
  if (!ownerValidation.valid) {
    return new Response(JSON.stringify({ error: ownerValidation.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const repoValidation = validateRepoName(repo)
  if (!repoValidation.valid) {
    return new Response(JSON.stringify({ error: repoValidation.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const issueIdValidation = validateIssueId(issueId)
  if (!issueIdValidation.valid) {
    return new Response(JSON.stringify({ error: issueIdValidation.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Validate repo access
  const accessDenied = await validateRepoAccess(env, user, owner, repo, true)
  if (accessDenied) return accessDenied

  try {
    // For JSONL format, we add to deletions.jsonl rather than modifying issues.jsonl
    // This is how beads handles deletions

    // Get current deletions file
    const deletionsRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/.beads/deletions.jsonl`,
      {
        headers: {
          'Authorization': `token ${user.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'abacus',
        },
      }
    )

    let deletionsContent = ''
    let deletionsSha: string | undefined

    if (deletionsRes.ok) {
      const data = await deletionsRes.json() as { content: string; sha: string }
      deletionsContent = atob(data.content.replace(/\n/g, ''))
      deletionsSha = data.sha
    }

    // Add deletion record
    const deletion = JSON.stringify({
      id: issueId,
      deleted_at: new Date().toISOString(),
    })

    const newContent = deletionsContent.trim() + '\n' + deletion + '\n'

    await updateGitHubFile(
      user.githubToken,
      owner,
      repo,
      '.beads/deletions.jsonl',
      newContent.trim() + '\n',
      `Delete issue: ${issueId}`,
      deletionsSha
    )

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error deleting issue:', err)
    return new Response(JSON.stringify({ error: 'Failed to delete issue' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// Helper functions

function normalizeIssue(obj: Record<string, unknown>): Issue {
  return {
    id: String(obj.id || ''),
    title: String(obj.title || ''),
    description: obj.description ? String(obj.description) : undefined,
    status: normalizeStatus(obj.status),
    priority: Number(obj.priority) || 3,
    issue_type: normalizeType(obj.issue_type || obj.type),
    assignee: obj.assignee ? String(obj.assignee) : undefined,
    created_at: String(obj.created_at || obj.created || new Date().toISOString()),
    updated_at: obj.updated_at ? String(obj.updated_at) : undefined,
    closed_at: obj.closed_at ? String(obj.closed_at) : undefined,
    parent: obj.parent ? String(obj.parent) : undefined,
  }
}

function parseMarkdownIssue(content: string): Issue {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) throw new Error('Invalid markdown')

  const [, frontmatter, body] = match
  const meta: Record<string, string> = {}

  for (const line of frontmatter.split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/)
    if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }

  return normalizeIssue({ ...meta, description: body.trim() })
}

function normalizeStatus(status: unknown): Issue['status'] {
  const s = String(status || 'open').toLowerCase()
  if (s === 'closed') return 'closed'
  if (s === 'in_progress' || s === 'in-progress') return 'in_progress'
  return 'open'
}

function normalizeType(type: unknown): Issue['issue_type'] {
  const t = String(type || 'task').toLowerCase()
  if (t === 'bug') return 'bug'
  if (t === 'feature') return 'feature'
  if (t === 'epic') return 'epic'
  return 'task'
}

function serializeJsonlIssue(issue: Issue): string {
  return JSON.stringify({
    id: issue.id,
    title: issue.title,
    description: issue.description || '',
    status: issue.status,
    priority: issue.priority,
    issue_type: issue.issue_type,
    assignee: issue.assignee || '',
    created_at: issue.created_at,
    updated_at: issue.updated_at || new Date().toISOString(),
    closed_at: issue.closed_at,
  })
}

function serializeMarkdownIssue(issue: Issue): string {
  const lines = [
    '---',
    `id: ${issue.id}`,
    `title: "${issue.title.replace(/"/g, '\\"')}"`,
    `type: ${issue.issue_type}`,
    `status: ${issue.status}`,
    `priority: ${issue.priority}`,
    `created: ${issue.created_at.split('T')[0]}`,
  ]
  if (issue.parent) lines.push(`parent: ${issue.parent}`)
  lines.push('---', '', `# ${issue.title}`, '')
  if (issue.description) lines.push(issue.description, '')
  return lines.join('\n')
}

async function updateGitHubFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  sha?: string
): Promise<void> {
  const body: Record<string, string> = {
    message,
    content: utf8ToBase64(content),
  }
  if (sha) body.sha = sha

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'abacus',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const data = await res.json() as { message?: string }
    throw new Error(data.message || 'Failed to update file')
  }
}
