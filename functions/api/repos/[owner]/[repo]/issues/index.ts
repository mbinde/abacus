// /api/repos/:owner/:repo/issues - List and create issues

import type { UserContext, AnonymousContext } from '../../../../_middleware'

interface Env {
  DB: D1Database
}

// Check if repo analytics is enabled
async function isRepoAnalyticsEnabled(env: Env): Promise<boolean> {
  try {
    const result = await env.DB.prepare(
      "SELECT value FROM settings WHERE key = 'repo_analytics'"
    ).first() as { value: string } | null
    // Default to enabled if no setting exists
    return result?.value !== 'disabled'
  } catch {
    return true // Default to enabled
  }
}

// Increment view counter for a repo (fire and forget)
async function incrementViewCount(env: Env, owner: string, repo: string): Promise<void> {
  try {
    // Check if analytics is enabled
    const enabled = await isRepoAnalyticsEnabled(env)
    if (!enabled) return

    await env.DB.prepare(`
      INSERT INTO repo_views (repo_owner, repo_name, view_count, last_viewed_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(repo_owner, repo_name) DO UPDATE SET
        view_count = view_count + 1,
        last_viewed_at = CURRENT_TIMESTAMP
    `).bind(owner, repo).run()
  } catch {
    // Silently fail - view counting is not critical
  }
}

// Helper to check if user is anonymous
function isAnonymous(user: UserContext | AnonymousContext): user is AnonymousContext {
  return 'anonymous' in user && user.anonymous === true
}

// Helper to build GitHub API headers
function githubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'abacus',
  }
  if (token) {
    headers['Authorization'] = `token ${token}`
  }
  return headers
}

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
  assignee?: string
  created_at: string
  updated_at?: string
  closed_at?: string
  parent?: string
  sha?: string
  comments?: Comment[]
}

// Retry configuration
const MAX_RETRIES = 3
const BASE_DELAY_MS = 100

// GET /api/repos/:owner/:repo/issues - List all issues
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { params, data, env } = context
  const user = (data as { user: UserContext | AnonymousContext }).user
  const owner = params.owner as string
  const repo = params.repo as string

  // Increment view counter (non-blocking)
  incrementViewCount(env, owner, repo)

  // For anonymous users, use raw GitHub content (no rate limits, CDN-cached)
  // For authenticated users, use GitHub API (gets SHA for optimistic locking)
  const anonymous = isAnonymous(user)
  const token = anonymous ? undefined : user.githubToken

  try {
    const issues: Issue[] = []
    let format: 'jsonl' | 'markdown' = 'jsonl'

    if (anonymous) {
      // Anonymous path: use raw.githubusercontent.com (no rate limits)
      const rawRes = await fetch(
        `https://raw.githubusercontent.com/${owner}/${repo}/main/.beads/issues.jsonl`
      )

      if (rawRes.ok) {
        const content = await rawRes.text()
        const lines = content.trim().split('\n').filter(l => l.trim())

        for (const line of lines) {
          const obj = JSON.parse(line)
          issues.push(normalizeIssue(obj)) // No SHA for anonymous (read-only anyway)
        }
      } else {
        // Try markdown format via raw content
        format = 'markdown'
        // For markdown, we'd need to know the file names - fall back to empty for now
        // This is acceptable since steveyegge/beads uses JSONL format
      }

      // Get deletions via raw content
      const deletionsRes = await fetch(
        `https://raw.githubusercontent.com/${owner}/${repo}/main/.beads/deletions.jsonl`
      )

      const deletedIds = new Set<string>()
      if (deletionsRes.ok) {
        const content = await deletionsRes.text()
        for (const line of content.trim().split('\n')) {
          if (!line.trim()) continue
          try {
            const obj = JSON.parse(line)
            deletedIds.add(obj.id)
          } catch {}
        }
      }

      const filteredIssues = issues.filter(i => !deletedIds.has(i.id))

      return new Response(JSON.stringify({ issues: filteredIssues, format }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Authenticated path: use GitHub API (gets SHA for optimistic locking)
    const jsonlRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/.beads/issues.jsonl`,
      { headers: githubHeaders(token) }
    )

    if (jsonlRes.ok) {
      const data = await jsonlRes.json() as { content: string; sha: string }
      const content = atob(data.content.replace(/\n/g, ''))
      const lines = content.trim().split('\n').filter(l => l.trim())

      for (const line of lines) {
        const obj = JSON.parse(line)
        issues.push(normalizeIssue(obj, data.sha))
      }
    } else {
      // Try markdown format
      format = 'markdown'
      const dirRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/.beads/issues`,
        { headers: githubHeaders(token) }
      )

      if (dirRes.ok) {
        const files = await dirRes.json() as Array<{ name: string; sha: string; download_url: string }>

        for (const file of files) {
          if (!file.name.endsWith('.md')) continue

          const fileRes = await fetch(file.download_url)
          if (fileRes.ok) {
            const content = await fileRes.text()
            const issue = parseMarkdownIssue(content, file.sha)
            issues.push(issue)
          }
        }
      }
    }

    // Get deletions to filter out deleted issues
    const deletionsRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/.beads/deletions.jsonl`,
      { headers: githubHeaders(token) }
    )

    const deletedIds = new Set<string>()
    if (deletionsRes.ok) {
      const data = await deletionsRes.json() as { content: string }
      const content = atob(data.content.replace(/\n/g, ''))
      for (const line of content.trim().split('\n')) {
        if (!line.trim()) continue
        try {
          const obj = JSON.parse(line)
          deletedIds.add(obj.id)
        } catch {}
      }
    }

    const filteredIssues = issues.filter(i => !deletedIds.has(i.id))

    return new Response(JSON.stringify({ issues: filteredIssues, format }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error fetching issues:', err)
    return new Response(JSON.stringify({ error: 'Failed to fetch issues' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// POST /api/repos/:owner/:repo/issues - Create a new issue
export const onRequestPost: PagesFunction = async (context) => {
  const { request, params, data } = context
  const user = (data as { user: UserContext | AnonymousContext }).user
  const owner = params.owner as string
  const repo = params.repo as string

  // Block anonymous users and guests from creating issues
  if (isAnonymous(user)) {
    return new Response(JSON.stringify({ error: 'Login required to create issues' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (user.role === 'guest') {
    return new Response(JSON.stringify({ error: 'Guest users cannot create issues. Contact an admin to upgrade your account.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const reqData = await request.json() as Partial<Issue>

    if (!reqData.title) {
      return new Response(JSON.stringify({ error: 'title is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Generate ID
    const prefix = repo.toLowerCase().replace(/[^a-z0-9]/g, '')
    const id = generateId(prefix)

    const issue: Issue = {
      id,
      title: reqData.title,
      description: reqData.description || '',
      status: reqData.status || 'open',
      priority: reqData.priority || 3,
      issue_type: reqData.issue_type || 'task',
      created_at: new Date().toISOString(),
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
      // JSONL format - use merge-on-conflict
      const result = await createIssueWithMerge(user.githubToken, owner, repo, issue)
      if (!result.success) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    } else {
      // Markdown format - create new file (no conflict possible for new files)
      const mdContent = serializeMarkdownIssue(issue)

      await updateGitHubFile(
        user.githubToken,
        owner,
        repo,
        `.beads/issues/${id}.md`,
        mdContent,
        `Add issue: ${issue.title}`
      )
    }

    return new Response(JSON.stringify({ issue }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error creating issue:', err)
    return new Response(JSON.stringify({ error: 'Failed to create issue' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// Create issue with merge-on-conflict and retry
async function createIssueWithMerge(
  token: string,
  owner: string,
  repo: string,
  newIssue: Issue
): Promise<{ success: boolean; error?: string }> {
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

    // Add new issue (shouldn't conflict on ID since we generated it)
    issueMap.set(newIssue.id, newIssue)

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
          message: `Add issue: ${newIssue.title}`,
          content: utf8ToBase64(newContent),
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

// Helper functions

function normalizeIssue(obj: Record<string, unknown>, sha?: string): Issue {
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
    sha,
    comments: Array.isArray(obj.comments) ? obj.comments as Comment[] : undefined,
  }
}

function parseMarkdownIssue(content: string, sha?: string): Issue {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) throw new Error('Invalid markdown')

  const [, frontmatter, body] = match
  const meta: Record<string, string> = {}

  for (const line of frontmatter.split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/)
    if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }

  return normalizeIssue({ ...meta, description: body.trim() }, sha)
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

function generateId(prefix: string): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz'
  let hash = ''
  for (let i = 0; i < 3; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)]
  }
  return `${prefix}-${hash}`
}

function serializeJsonlIssue(issue: Issue): string {
  const obj: Record<string, unknown> = {
    id: issue.id,
    title: issue.title,
    description: issue.description || '',
    status: issue.status,
    priority: issue.priority,
    issue_type: issue.issue_type,
    assignee: issue.assignee || '',
    created_at: issue.created_at,
    updated_at: new Date().toISOString(),
  }
  if (issue.comments && issue.comments.length > 0) {
    obj.comments = issue.comments
  }
  return JSON.stringify(obj)
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
    '---',
    '',
    `# ${issue.title}`,
    '',
  ]
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
