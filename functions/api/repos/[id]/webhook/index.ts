// /api/repos/:id/webhook - Get webhook status and delete webhook

import type { UserContext } from '../../../_middleware'

interface Env {
  DB: D1Database
}

interface Repo {
  id: number
  owner: string
  name: string
  webhook_secret: string | null
  webhook_owner_id: number | null
}

// GET /api/repos/:id/webhook - Get webhook status for this repo
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params, data } = context
  const user = (data as { user: UserContext }).user
  const repoId = Number(params.id)

  try {
    // Check user has access to this repo
    const userRepo = await env.DB.prepare(
      'SELECT 1 FROM user_repos WHERE user_id = ? AND repo_id = ?'
    ).bind(user.id, repoId).first()

    if (!userRepo) {
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const repo = await env.DB.prepare(
      'SELECT id, owner, name, webhook_secret, webhook_owner_id FROM repos WHERE id = ?'
    ).bind(repoId).first() as Repo | null

    if (!repo) {
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const isOwner = repo.webhook_owner_id === user.id
    const isConfigured = repo.webhook_secret !== null && repo.webhook_owner_id !== null

    // Check if user has a provisional secret
    const provisional = await env.DB.prepare(
      'SELECT secret FROM provisional_webhook_secrets WHERE repo_id = ? AND user_id = ?'
    ).bind(repoId, user.id).first() as { secret: string } | null

    return new Response(JSON.stringify({
      configured: isConfigured,
      isOwner,
      // Only show secret to owner
      secret: isOwner ? repo.webhook_secret : null,
      // Show provisional secret if user is in configure flow
      provisionalSecret: provisional?.secret || null,
      canConfigure: !isConfigured || isOwner,
    }), {
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

// DELETE /api/repos/:id/webhook - Delete webhook configuration (owner only)
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, params, data } = context
  const user = (data as { user: UserContext }).user
  const repoId = Number(params.id)

  try {
    const repo = await env.DB.prepare(
      'SELECT webhook_owner_id FROM repos WHERE id = ?'
    ).bind(repoId).first() as { webhook_owner_id: number | null } | null

    if (!repo) {
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (repo.webhook_owner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Only the webhook owner can delete it' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Clear webhook configuration
    await env.DB.prepare(`
      UPDATE repos
      SET webhook_secret = NULL, webhook_owner_id = NULL
      WHERE id = ?
    `).bind(repoId).run()

    // Also clear any provisional secrets for this repo
    await env.DB.prepare(
      'DELETE FROM provisional_webhook_secrets WHERE repo_id = ?'
    ).bind(repoId).run()

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to delete webhook' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
