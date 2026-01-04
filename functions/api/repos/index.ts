// /api/repos - List and add repositories (scoped to user)

import type { UserContext } from '../_middleware'

interface Env {
  DB: D1Database
}

// GET /api/repos - List user's repos
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = (data as { user: UserContext }).user

  try {
    // Ensure table exists with user_id column
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS repos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, owner, name)
      )
    `).run()

    const result = await env.DB.prepare(
      'SELECT * FROM repos WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(user.id).all()

    return new Response(JSON.stringify({ repos: result.results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
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

  try {
    const { owner, name } = await request.json() as { owner: string; name: string }

    if (!owner || !name) {
      return new Response(JSON.stringify({ error: 'owner and name are required' }), {
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

    // Ensure table exists
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS repos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, owner, name)
      )
    `).run()

    // Generate webhook secret for this repo
    const webhookSecret = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '')

    // Insert repo with user_id and webhook_secret
    const result = await env.DB.prepare(
      'INSERT INTO repos (user_id, owner, name, webhook_secret) VALUES (?, ?, ?, ?) RETURNING *'
    ).bind(user.id, owner, name, webhookSecret).first()

    return new Response(JSON.stringify({ repo: result }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const error = err as Error
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
