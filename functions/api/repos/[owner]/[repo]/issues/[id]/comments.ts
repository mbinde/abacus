// /api/repos/:owner/:repo/issues/:id/comments - Add comments to issues

import type { UserContext } from '../../../../../_middleware'

// UTF-8 safe base64 encoding (handles emojis and non-Latin1 characters)
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

interface Comment {
  id: number
  issue_id: string
  author: string
  text: string
  created_at: string
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
  comments?: Comment[]
}

const MAX_RETRIES = 3
const BASE_DELAY_MS = 100

// POST /api/repos/:owner/:repo/issues/:id/comments - Add a comment
export const onRequestPost: PagesFunction = async (context) => {
  const { request, params, data } = context
  const user = (data as { user: UserContext }).user
  const owner = params.owner as string
  const repo = params.repo as string
  const issueId = params.id as string

  try {
    const body = await request.json() as { text: string }

    if (!body.text?.trim()) {
      return new Response(JSON.stringify({ error: 'Comment text is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const result = await addCommentWithMerge(
      user.githubToken,
      user.github_login,
      owner,
      repo,
      issueId,
      body.text.trim()
    )

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: result.notFound ? 404 : 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ comment: result.comment }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error adding comment:', err)
    return new Response(JSON.stringify({ error: 'Failed to add comment' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function addCommentWithMerge(
  token: string,
  authorLogin: string,
  owner: string,
  repo: string,
  issueId: string,
  text: string
): Promise<{ success: boolean; error?: string; notFound?: boolean; comment?: Comment }> {
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

    // Find the issue
    const issue = issueMap.get(issueId)
    if (!issue) {
      return { success: false, error: 'Issue not found', notFound: true }
    }

    // Generate new comment ID (max existing + 1)
    const existingIds = (issue.comments || []).map(c => c.id)
    const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1

    const newComment: Comment = {
      id: newId,
      issue_id: issueId,
      author: authorLogin,
      text,
      created_at: new Date().toISOString(),
    }

    // Add comment to issue
    issue.comments = [...(issue.comments || []), newComment]
    issue.updated_at = new Date().toISOString()
    issueMap.set(issueId, issue)

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
          message: `Add comment to ${issueId}`,
          content: utf8ToBase64(newContent),
          sha: data.sha,
        }),
      }
    )

    if (writeRes.ok) {
      return { success: true, comment: newComment }
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
        : errData.message || 'Failed to add comment',
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
    comments: Array.isArray(obj.comments) ? obj.comments as Comment[] : undefined,
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
  const obj: Record<string, unknown> = {
    id: issue.id,
    title: issue.title,
    description: issue.description || '',
    status: issue.status,
    priority: issue.priority,
    issue_type: issue.issue_type,
    created_at: issue.created_at,
    updated_at: issue.updated_at || new Date().toISOString(),
  }
  if (issue.closed_at) {
    obj.closed_at = issue.closed_at
  }
  if (issue.comments && issue.comments.length > 0) {
    obj.comments = issue.comments
  }
  return JSON.stringify(obj)
}
