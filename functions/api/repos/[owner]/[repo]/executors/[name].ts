// /api/repos/:owner/:repo/executors/:name - Get, update, delete executor

import type { UserContext } from '../../../../_middleware'

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

const EXECUTORS_PATH = '.abacus/executors.json'
const MAX_RETRIES = 3
const BASE_DELAY_MS = 100

// GET /api/repos/:owner/:repo/executors/:name - Get a single executor
export const onRequestGet: PagesFunction = async (context) => {
  const { params, data } = context
  const user = (data as { user: UserContext }).user
  const owner = params.owner as string
  const repo = params.repo as string
  const name = params.name as string

  try {
    const { executors } = await fetchExecutorsWithSha(user.githubToken, owner, repo)
    const executor = executors[name]

    if (!executor) {
      return new Response(JSON.stringify({ error: 'Executor not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ executor }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error fetching executor:', err)
    return new Response(JSON.stringify({ error: 'Failed to fetch executor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// PUT /api/repos/:owner/:repo/executors/:name - Create or update executor
export const onRequestPut: PagesFunction = async (context) => {
  const { request, params, data } = context
  const user = (data as { user: UserContext }).user
  const owner = params.owner as string
  const repo = params.repo as string
  const name = params.name as string

  try {
    const reqData = await request.json() as Partial<Executor>

    if (!reqData.type || !['label-poll', 'webhook'].includes(reqData.type)) {
      return new Response(JSON.stringify({ error: 'type must be "label-poll" or "webhook"' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (reqData.type === 'label-poll' && !reqData.label) {
      return new Response(JSON.stringify({ error: 'label is required for label-poll executors' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (reqData.type === 'webhook' && !reqData.endpoint) {
      return new Response(JSON.stringify({ error: 'endpoint is required for webhook executors' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const executor: Executor = {
      name,
      type: reqData.type,
      label: reqData.label,
      endpoint: reqData.endpoint,
      description: reqData.description,
    }

    const result = await upsertExecutorWithMerge(user.githubToken, owner, repo, name, executor)
    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ executor }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error saving executor:', err)
    return new Response(JSON.stringify({ error: 'Failed to save executor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// DELETE /api/repos/:owner/:repo/executors/:name - Delete executor
export const onRequestDelete: PagesFunction = async (context) => {
  const { params, data } = context
  const user = (data as { user: UserContext }).user
  const owner = params.owner as string
  const repo = params.repo as string
  const name = params.name as string

  try {
    const result = await deleteExecutorWithMerge(user.githubToken, owner, repo, name)
    if (!result.success) {
      const status = result.notFound ? 404 : 500
      return new Response(JSON.stringify({ error: result.error }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error deleting executor:', err)
    return new Response(JSON.stringify({ error: 'Failed to delete executor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// Helper: fetch executors with SHA for updates
async function fetchExecutorsWithSha(
  token: string,
  owner: string,
  repo: string
): Promise<{ executors: Record<string, Executor>; sha?: string }> {
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
    if (res.status === 404) {
      return { executors: {} }
    }
    throw new Error('Failed to fetch executors file')
  }

  const data = await res.json() as { content: string; sha: string }
  const content = atob(data.content.replace(/\n/g, ''))
  const parsed = JSON.parse(content) as ExecutorsFile

  return { executors: parsed.executors || {}, sha: data.sha }
}

// Upsert executor with merge-on-conflict
async function upsertExecutorWithMerge(
  token: string,
  owner: string,
  repo: string,
  name: string,
  executor: Executor
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { executors, sha } = await fetchExecutorsWithSha(token, owner, repo)

    // Add/update executor
    executors[name] = executor

    // Serialize
    const content: ExecutorsFile = { executors }
    const newContent = JSON.stringify(content, null, 2)

    // Try to write
    const body: Record<string, string> = {
      message: sha ? `Update executor: ${name}` : `Add executor: ${name}`,
      content: utf8ToBase64(newContent),
    }
    if (sha) body.sha = sha

    const writeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${EXECUTORS_PATH}`,
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
        ? 'Failed to save executor after multiple attempts. Please try again.'
        : errData.message || 'Failed to save executor',
    }
  }

  return { success: false, error: 'Failed to save executor after multiple attempts.' }
}

// Delete executor with merge-on-conflict
async function deleteExecutorWithMerge(
  token: string,
  owner: string,
  repo: string,
  name: string
): Promise<{ success: boolean; error?: string; notFound?: boolean }> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { executors, sha } = await fetchExecutorsWithSha(token, owner, repo)

    if (!executors[name]) {
      return { success: false, error: 'Executor not found', notFound: true }
    }

    // Remove executor
    delete executors[name]

    // Serialize
    const content: ExecutorsFile = { executors }
    const newContent = JSON.stringify(content, null, 2)

    // Try to write
    const writeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${EXECUTORS_PATH}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'abacus',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Delete executor: ${name}`,
          content: utf8ToBase64(newContent),
          sha,
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
        ? 'Failed to delete executor after multiple attempts. Please try again.'
        : errData.message || 'Failed to delete executor',
    }
  }

  return { success: false, error: 'Failed to delete executor after multiple attempts.' }
}
