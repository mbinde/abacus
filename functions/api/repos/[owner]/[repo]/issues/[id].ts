// /api/repos/:owner/:repo/issues/:id - Update and delete issues

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

// PUT /api/repos/:owner/:repo/issues/:id - Update an issue
export const onRequestPut: PagesFunction = async (context) => {
  const { request, params, data } = context
  const user = (data as { user: UserContext }).user
  const owner = params.owner as string
  const repo = params.repo as string
  const issueId = params.id as string

  try {
    const reqData = await request.json() as Partial<Issue>
    const clientSha = reqData.sha

    // Check if using JSONL or markdown format
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
      // JSONL format
      const jsonlData = await jsonlRes.json() as { content: string; sha: string }

      // Conflict detection
      if (clientSha && clientSha !== jsonlData.sha) {
        // Get the server version of this issue
        const content = atob(jsonlData.content.replace(/\n/g, ''))
        const lines = content.trim().split('\n')
        let serverVersion: Issue | null = null

        for (const line of lines) {
          const obj = JSON.parse(line)
          if (obj.id === issueId) {
            serverVersion = normalizeIssue(obj)
            break
          }
        }

        return new Response(JSON.stringify({
          error: 'Conflict detected',
          conflict: true,
          serverVersion,
          serverSha: jsonlData.sha,
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const content = atob(jsonlData.content.replace(/\n/g, ''))
      const lines = content.trim().split('\n')
      const newLines: string[] = []
      let found = false

      for (const line of lines) {
        const obj = JSON.parse(line)
        if (obj.id === issueId) {
          found = true
          const updated: Issue = {
            ...normalizeIssue(obj),
            title: reqData.title ?? obj.title,
            description: reqData.description ?? obj.description,
            status: reqData.status ?? obj.status,
            priority: reqData.priority ?? obj.priority,
            issue_type: reqData.issue_type ?? obj.issue_type,
            updated_at: new Date().toISOString(),
          }
          if (updated.status === 'closed' && !updated.closed_at) {
            updated.closed_at = new Date().toISOString()
          }
          newLines.push(serializeJsonlIssue(updated))
        } else {
          newLines.push(line)
        }
      }

      if (!found) {
        return new Response(JSON.stringify({ error: 'Issue not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      await updateGitHubFile(
        user.githubToken,
        owner,
        repo,
        '.beads/issues.jsonl',
        newLines.join('\n') + '\n',
        `Update issue: ${reqData.title || issueId}`,
        jsonlData.sha
      )
    } else {
      // Markdown format
      const fileRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/.beads/issues/${issueId}.md`,
        {
          headers: {
            'Authorization': `token ${user.githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'abacus',
          },
        }
      )

      if (!fileRes.ok) {
        return new Response(JSON.stringify({ error: 'Issue not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const fileData = await fileRes.json() as { content: string; sha: string }

      // Conflict detection
      if (clientSha && clientSha !== fileData.sha) {
        const content = atob(fileData.content.replace(/\n/g, ''))
        const serverVersion = parseMarkdownIssue(content)

        return new Response(JSON.stringify({
          error: 'Conflict detected',
          conflict: true,
          serverVersion,
          serverSha: fileData.sha,
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const content = atob(fileData.content.replace(/\n/g, ''))
      const existing = parseMarkdownIssue(content)

      const updated: Issue = {
        ...existing,
        title: reqData.title ?? existing.title,
        description: reqData.description ?? existing.description,
        status: reqData.status ?? existing.status,
        priority: reqData.priority ?? existing.priority,
        issue_type: reqData.issue_type ?? existing.issue_type,
      }

      await updateGitHubFile(
        user.githubToken,
        owner,
        repo,
        `.beads/issues/${issueId}.md`,
        serializeMarkdownIssue(updated),
        `Update issue: ${updated.title}`,
        fileData.sha
      )
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
