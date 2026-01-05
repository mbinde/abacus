// /api/repos/:owner/:repo/executors - List and create executors

import type { UserContext } from '../../../../_middleware'

interface Executor {
  name: string
  type: 'label-poll' | 'webhook'
  label?: string      // For label-poll
  endpoint?: string   // For webhook
  description?: string
}

interface ExecutorsFile {
  executors: Record<string, Executor>
}

const EXECUTORS_PATH = '.abacus/executors.json'

// GET /api/repos/:owner/:repo/executors - List all executors
export const onRequestGet: PagesFunction = async (context) => {
  const { params, data } = context
  const user = (data as { user: UserContext }).user
  const owner = params.owner as string
  const repo = params.repo as string

  try {
    const executors = await fetchExecutors(user.githubToken, owner, repo)

    return new Response(JSON.stringify({ executors: Object.values(executors) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error fetching executors:', err)
    return new Response(JSON.stringify({ error: 'Failed to fetch executors' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// Helper: fetch executors from GitHub
async function fetchExecutors(
  token: string,
  owner: string,
  repo: string
): Promise<Record<string, Executor>> {
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
      return {} // No executors file yet
    }
    throw new Error('Failed to fetch executors file')
  }

  const data = await res.json() as { content: string }
  const content = atob(data.content.replace(/\n/g, ''))
  const parsed = JSON.parse(content) as ExecutorsFile

  return parsed.executors || {}
}
