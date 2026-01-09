// /api/repos/:owner/:repo/issues/bulk - Bulk update issues

import type { UserContext, AnonymousContext } from '../../../../_middleware'
import { validateRepoAccess, isAnonymous } from '../../../../../lib/repo-access'

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
  created_at: string
  updated_at?: string
  closed_at?: string
  parent?: string
}

interface BulkUpdateRequest {
  issue_ids: string[]
  updates: {
    status?: 'open' | 'closed' | 'in_progress'
    priority?: number
  }
}

const MAX_RETRIES = 3
const BASE_DELAY_MS = 100

// PUT /api/repos/:owner/:repo/issues/bulk - Bulk update issues
export const onRequestPut: PagesFunction<{ DB: D1Database }> = async (context) => {
  const { request, params, data, env } = context
  const user = (data as { user: UserContext | AnonymousContext }).user
  const owner = params.owner as string
  const repo = params.repo as string

  // Block anonymous users and guests from bulk updates
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

  // Validate repo access
  const accessDenied = await validateRepoAccess(env, user, owner, repo, true)
  if (accessDenied) return accessDenied

  try {
    const body = await request.json() as BulkUpdateRequest

    if (!body.issue_ids?.length) {
      return new Response(JSON.stringify({ error: 'issue_ids is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!body.updates || (!body.updates.status && body.updates.priority === undefined)) {
      return new Response(JSON.stringify({ error: 'At least one update field is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const result = await bulkUpdateWithMerge(
      user.githubToken,
      owner,
      repo,
      body.issue_ids,
      body.updates
    )

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, updated: result.updated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error bulk updating issues:', err)
    return new Response(JSON.stringify({ error: 'Failed to bulk update issues' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function bulkUpdateWithMerge(
  token: string,
  owner: string,
  repo: string,
  issueIds: string[],
  updates: BulkUpdateRequest['updates']
): Promise<{ success: boolean; error?: string; updated?: number }> {
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
      return { success: false, error: 'Failed to fetch issues file' }
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

    // Update matching issues
    const idsToUpdate = new Set(issueIds)
    let updatedCount = 0

    for (const [id, issue] of issueMap) {
      if (!idsToUpdate.has(id)) continue

      const updated: Issue = { ...issue }

      if (updates.status !== undefined) {
        updated.status = updates.status
        if (updates.status === 'closed' && !updated.closed_at) {
          updated.closed_at = new Date().toISOString()
        }
      }

      if (updates.priority !== undefined) {
        updated.priority = updates.priority
      }

      updated.updated_at = new Date().toISOString()
      issueMap.set(id, updated)
      updatedCount++
    }

    if (updatedCount === 0) {
      return { success: true, updated: 0 }
    }

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
          message: `Bulk update ${updatedCount} issues`,
          content: utf8ToBase64(newContent),
          sha: data.sha,
        }),
      }
    )

    if (writeRes.ok) {
      return { success: true, updated: updatedCount }
    }

    const status = writeRes.status
    if (status === 409 || status === 422) {
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
    }

    const errData = await writeRes.json() as { message?: string }
    return {
      success: false,
      error: attempt >= MAX_RETRIES
        ? `Failed after ${MAX_RETRIES + 1} attempts due to concurrent modifications.`
        : errData.message || 'Failed to save',
    }
  }

  return { success: false, error: 'Failed after retries' }
}

function normalizeIssue(obj: Record<string, unknown>): Issue {
  return {
    id: String(obj.id || ''),
    title: String(obj.title || ''),
    description: obj.description ? String(obj.description) : undefined,
    status: normalizeStatus(obj.status),
    priority: Number(obj.priority) || 3,
    issue_type: normalizeType(obj.issue_type || obj.type),
    created_at: String(obj.created_at || obj.created || new Date().toISOString()),
    updated_at: obj.updated_at ? String(obj.updated_at) : undefined,
    closed_at: obj.closed_at ? String(obj.closed_at) : undefined,
    parent: obj.parent ? String(obj.parent) : undefined,
  }
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
    created_at: issue.created_at,
    updated_at: issue.updated_at || new Date().toISOString(),
    closed_at: issue.closed_at,
  })
}
