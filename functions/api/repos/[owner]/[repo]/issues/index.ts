// /api/repos/:owner/:repo/issues - List and create issues

import type { UserContext } from '../../../../_middleware'

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
  sha?: string
}

// GET /api/repos/:owner/:repo/issues - List all issues
export const onRequestGet: PagesFunction = async (context) => {
  const { params, data } = context
  const user = (data as { user: UserContext }).user
  const owner = params.owner as string
  const repo = params.repo as string

  try {
    const issues: Issue[] = []
    let format: 'jsonl' | 'markdown' = 'jsonl'

    // Try JSONL format first
    const jsonlRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/.beads/issues.jsonl`,
      {
        headers: {
          'Authorization': `token ${user.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'abacus',
        },
      }
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
        {
          headers: {
            'Authorization': `token ${user.githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'abacus',
          },
        }
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
      {
        headers: {
          'Authorization': `token ${user.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'abacus',
        },
      }
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
  const user = (data as { user: UserContext }).user
  const owner = params.owner as string
  const repo = params.repo as string

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

    // Determine format by checking if issues.jsonl exists
    const jsonlRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/.beads/issues.jsonl`,
      {
        headers: {
          'Authorization': `token ${user.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'abacus',
        },
      }
    )

    if (jsonlRes.ok) {
      // JSONL format - append to file
      const jsonlData = await jsonlRes.json() as { content: string; sha: string }
      const content = atob(jsonlData.content.replace(/\n/g, ''))
      const newContent = content.trim() + '\n' + serializeJsonlIssue(issue) + '\n'

      await updateGitHubFile(
        user.githubToken,
        owner,
        repo,
        '.beads/issues.jsonl',
        newContent,
        `Add issue: ${issue.title}`,
        jsonlData.sha
      )
    } else {
      // Markdown format - create new file
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

// Helper functions

function normalizeIssue(obj: Record<string, unknown>, sha?: string): Issue {
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
    sha,
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
  return JSON.stringify({
    id: issue.id,
    title: issue.title,
    description: issue.description || '',
    status: issue.status,
    priority: issue.priority,
    issue_type: issue.issue_type,
    created_at: issue.created_at,
    updated_at: new Date().toISOString(),
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
