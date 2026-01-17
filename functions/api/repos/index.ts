// /api/repos - List and add repositories (scoped to user)

import type { UserContext } from '../_middleware'
import { validateRepoOwner, validateRepoName } from '../../lib/validation'

interface Env {
  DB: D1Database
}

interface Repo {
  id: number
  owner: string
  name: string
  created_at: string
  webhook_configured: boolean
  webhook_is_owner: boolean
}

// GET /api/repos - List user's repos
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = (data as { user: UserContext }).user

  try {
    const result = await env.DB.prepare(`
      SELECT
        r.id,
        r.owner,
        r.name,
        r.created_at,
        CASE WHEN r.webhook_secret IS NOT NULL AND r.webhook_owner_id IS NOT NULL THEN 1 ELSE 0 END as webhook_configured,
        CASE WHEN r.webhook_owner_id = ? THEN 1 ELSE 0 END as webhook_is_owner
      FROM repos r
      JOIN user_repos ur ON ur.repo_id = r.id
      WHERE ur.user_id = ?
      ORDER BY ur.created_at DESC
    `).bind(user.id, user.id).all()

    // Convert 0/1 to boolean
    const repos = (result.results as Array<Record<string, unknown>>).map(r => ({
      ...r,
      webhook_configured: Boolean(r.webhook_configured),
      webhook_is_owner: Boolean(r.webhook_is_owner),
    }))

    return new Response(JSON.stringify({ repos }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Database error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// POST /api/repos - Add a new repo
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, data } = context
  const user = (data as { user: UserContext }).user

  // Guest users cannot add repos
  if (user.role === 'guest') {
    return new Response(JSON.stringify({ error: 'Guest users cannot add repositories. Contact an administrator to upgrade your account.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { owner, name } = await request.json() as { owner: string; name: string }

    // Validate inputs
    const ownerValidation = validateRepoOwner(owner)
    if (!ownerValidation.valid) {
      return new Response(JSON.stringify({ error: ownerValidation.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const nameValidation = validateRepoName(name)
    if (!nameValidation.valid) {
      return new Response(JSON.stringify({ error: nameValidation.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Verify repo exists on GitHub using user's token
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
      headers: {
        'Authorization': `token ${user.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'abacus',
      },
    })

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Repository not found or not accessible' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check if repo has .beads directory
    const beadsRes = await fetch(`https://api.github.com/repos/${owner}/${name}/contents/.beads`, {
      headers: {
        'Authorization': `token ${user.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'abacus',
      },
    })

    if (!beadsRes.ok) {
      return new Response(JSON.stringify({ error: 'Repository does not have a .beads directory' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check if repo already exists in global repos table (case-insensitive)
    let repo = await env.DB.prepare(
      'SELECT * FROM repos WHERE LOWER(owner) = LOWER(?) AND LOWER(name) = LOWER(?)'
    ).bind(owner, name).first() as Repo | null

    if (!repo) {
      // Create new repo with webhook secret
      const webhookSecret = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '')
      repo = await env.DB.prepare(
        'INSERT INTO repos (owner, name, webhook_secret) VALUES (?, ?, ?) RETURNING *'
      ).bind(owner, name, webhookSecret).first() as Repo
    }

    // Check if user already has this repo
    const existing = await env.DB.prepare(
      'SELECT * FROM user_repos WHERE user_id = ? AND repo_id = ?'
    ).bind(user.id, repo.id).first()

    if (existing) {
      return new Response(JSON.stringify({ error: 'Repository already added' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Link user to repo
    await env.DB.prepare(
      'INSERT INTO user_repos (user_id, repo_id) VALUES (?, ?)'
    ).bind(user.id, repo.id).run()

    return new Response(JSON.stringify({ repo }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const error = err as Error
    // Log details server-side but return generic message
    console.error('Error adding repository:', error)

    if (error.message?.includes('UNIQUE constraint')) {
      return new Response(JSON.stringify({ error: 'Repository already added' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ error: 'Failed to add repository' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
