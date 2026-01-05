// /api/repos/:owner/:repo/executors/:name/dispatch - Dispatch an issue to an executor

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

interface Executor {
  name: string
  type: 'label-poll' | 'webhook'
  label?: string
  endpoint?: string
  description?: string
}

interface ExecutorsFile {
  executors: Record<string, Executor>
}

interface Issue {
  id: string
  title: string
  description?: string
  status: string
  priority: number
  labels?: string[]
}

const EXECUTORS_PATH = '.abacus/executors.json'
const ISSUES_PATH = '.beads/issues.jsonl'
const MAX_RETRIES = 3
const BASE_DELAY_MS = 100

// POST /api/repos/:owner/:repo/executors/:name/dispatch
export const onRequestPost: PagesFunction = async (context) => {
  const { request, params, data } = context
  const user = (data as { user: UserContext }).user
  const owner = params.owner as string
  const repo = params.repo as string
  const executorName = params.name as string

  try {
    const reqData = await request.json() as { issue_id: string }

    if (!reqData.issue_id) {
      return new Response(JSON.stringify({ error: 'issue_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Get executor config
    const executor = await fetchExecutor(user.githubToken, owner, repo, executorName)
    if (!executor) {
      return new Response(JSON.stringify({ error: 'Executor not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (executor.type === 'label-poll') {
      // Add label to issue
      const result = await addLabelToIssue(
        user.githubToken,
        owner,
        repo,
        reqData.issue_id,
        executor.label!
      )

      if (!result.success) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: result.notFound ? 404 : 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({
        status: 'dispatched',
        type: 'label-poll',
        label_applied: executor.label,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

    } else if (executor.type === 'webhook') {
      // Get issue details for webhook payload
      const issue = await fetchIssue(user.githubToken, owner, repo, reqData.issue_id)
      if (!issue) {
        return new Response(JSON.stringify({ error: 'Issue not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // POST to webhook endpoint
      const webhookRes = await fetch(executor.endpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'abacus',
        },
        body: JSON.stringify({
          action: 'dispatch',
          issue_id: reqData.issue_id,
          repo: `${owner}/${repo}`,
          issue: {
            id: issue.id,
            title: issue.title,
            description: issue.description,
            status: issue.status,
            priority: issue.priority,
          },
        }),
      })

      if (!webhookRes.ok) {
        return new Response(JSON.stringify({
          error: `Webhook returned ${webhookRes.status}`,
        }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({
        status: 'dispatched',
        type: 'webhook',
        endpoint_called: executor.endpoint,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown executor type' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Error dispatching:', err)
    return new Response(JSON.stringify({ error: 'Failed to dispatch' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// Fetch a single executor
async function fetchExecutor(
  token: string,
  owner: string,
  repo: string,
  name: string
): Promise<Executor | null> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${EXECUTORS_PATH}`,
    {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'abacus',
      },
    }
  )

  if (!res.ok) {
    return null
  }

  const data = await res.json() as { content: string }
  const content = atob(data.content.replace(/\n/g, ''))
  const parsed = JSON.parse(content) as ExecutorsFile

  return parsed.executors?.[name] || null
}

// Fetch a single issue
async function fetchIssue(
  token: string,
  owner: string,
  repo: string,
  issueId: string
): Promise<Issue | null> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${ISSUES_PATH}`,
    {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'abacus',
      },
    }
  )

  if (!res.ok) {
    return null
  }

  const data = await res.json() as { content: string }
  const content = atob(data.content.replace(/\n/g, ''))

  for (const line of content.trim().split('\n')) {
    if (!line.trim()) continue
    try {
      const obj = JSON.parse(line)
      if (obj.id === issueId) {
        return {
          id: obj.id,
          title: obj.title,
          description: obj.description,
          status: obj.status,
          priority: obj.priority,
          labels: obj.labels,
        }
      }
    } catch {}
  }

  return null
}

// Add label to issue with merge-on-conflict
async function addLabelToIssue(
  token: string,
  owner: string,
  repo: string,
  issueId: string,
  label: string
): Promise<{ success: boolean; error?: string; notFound?: boolean }> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Fetch current issues
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${ISSUES_PATH}`,
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

    // Parse issues
    const issues: Record<string, unknown>[] = []
    let found = false

    for (const line of content.trim().split('\n')) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line)
        if (obj.id === issueId) {
          found = true
          // Add label if not already present
          const labels = Array.isArray(obj.labels) ? obj.labels : []
          if (!labels.includes(label)) {
            labels.push(label)
          }
          obj.labels = labels
          obj.updated_at = new Date().toISOString()
        }
        issues.push(obj)
      } catch {}
    }

    if (!found) {
      return { success: false, error: 'Issue not found', notFound: true }
    }

    // Serialize back
    const newContent = issues.map(i => JSON.stringify(i)).join('\n') + '\n'

    // Try to write
    const writeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${ISSUES_PATH}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'abacus',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Dispatch issue ${issueId} to executor (add label: ${label})`,
          content: utf8ToBase64(newContent),
          sha: data.sha,
        }),
      }
    )

    if (writeRes.ok) {
      return { success: true }
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
        ? 'Failed to dispatch after multiple attempts. Please try again.'
        : errData.message || 'Failed to dispatch',
    }
  }

  return { success: false, error: 'Failed to dispatch after multiple attempts.' }
}
