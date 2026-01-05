// /api/repos/:owner/:repo/issues/:id - Update and delete issues

import type { UserContext } from '../../../../_middleware'

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
export const onRequestPut: PagesFunction = async (context) => {
  const { request, params, data } = context
  const user = (data as { user: UserContext }).user
  const owner = params.owner as string
  const repo = params.repo as string
  const issueId = params.id as string

  try {
    const reqData = await request.json() as Partial<Issue>

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
      // JSONL format - use merge-on-conflict
      const result = await updateIssueWithMerge(user.githubToken, owner, repo, issueId, reqData)
      if (!result.success) {
        const status = result.notFound ? 404 : 500
        return new Response(JSON.stringify({ error: result.error }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    } else {
      // Markdown format - use merge-on-conflict for individual file
      const result = await updateMarkdownIssueWithMerge(user.githubToken, owner, repo, issueId, reqData)
      if (!result.success) {
        const status = result.notFound ? 404 : 500
        return new Response(JSON.stringify({ error: result.error }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error updating issue:', err)
    return new Response(JSON.stringify({ error: 'Failed to update issue' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// Update issue in JSONL with merge-on-conflict and retry
async function updateIssueWithMerge(
  token: string,
  owner: string,
  repo: string,
  issueId: string,
  updates: Partial<Issue>
): Promise<{ success: boolean; error?: string; notFound?: boolean }> {
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

    // Find and update the issue
    const existing = issueMap.get(issueId)
    if (!existing) {
      return { success: false, error: 'Issue not found', notFound: true }
    }

    const updated: Issue = {
      ...existing,
      title: updates.title ?? existing.title,
      description: updates.description ?? existing.description,
      status: updates.status ?? existing.status,
      priority: updates.priority ?? existing.priority,
      issue_type: updates.issue_type ?? existing.issue_type,
      assignee: updates.assignee !== undefined ? updates.assignee : existing.assignee,
      updated_at: new Date().toISOString(),
    }
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
          content: btoa(newContent),
          sha: data.sha,
        }),
      }
    )

    if (writeRes.ok) {
      return { success: true }
    }

    // Check if it's a conflict (409) or SHA mismatch (422)
    const status = writeRes.status
    if (status === 409 || status === 422) {
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
    }
  }

  return {
    success: false,
    error: `Failed to save issue after ${MAX_RETRIES + 1} attempts due to concurrent modifications. Please try again.`,
  }
}

// Update markdown issue with merge-on-conflict and retry
async function updateMarkdownIssueWithMerge(
  token: string,
  owner: string,
  repo: string,
  issueId: string,
  updates: Partial<Issue>
): Promise<{ success: boolean; error?: string; notFound?: boolean }> {
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
        return { success: false, error: 'Issue not found', notFound: true }
      }
      return { success: false, error: 'Failed to fetch issue file' }
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
          content: btoa(serializeMarkdownIssue(updated)),
          sha: data.sha,
        }),
      }
    )

    if (writeRes.ok) {
      return { success: true }
    }

    // Check if it's a conflict (409) or SHA mismatch (422)
    const status = writeRes.status
    if (status === 409 || status === 422) {
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
    }
  }

  return {
    success: false,
    error: `Failed to save issue after ${MAX_RETRIES + 1} attempts due to concurrent modifications. Please try again.`,
  }
}

// DELETE /api/repos/:owner/:repo/issues/:id - Delete an issue
export const onRequestDelete: PagesFunction = async (context) => {
  const { params, data } = context
  const user = (data as { user: UserContext }).user
  const owner = params.owner as string
  const repo = params.repo as string
  const issueId = params.id as string

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
    content: btoa(content),
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
