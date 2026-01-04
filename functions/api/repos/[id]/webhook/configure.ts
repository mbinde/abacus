// /api/repos/:id/webhook/configure - Start webhook configuration

import type { UserContext } from '../../../_middleware'

interface Env {
  DB: D1Database
}

// POST /api/repos/:id/webhook/configure - Get provisional secret to configure webhook
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, params, data } = context
  const user = (data as { user: UserContext }).user
  const repoId = Number(params.id)

  // Only premium users can configure webhooks
  if (user.role !== 'premium' && user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Premium subscription required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

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
      'SELECT webhook_secret, webhook_owner_id FROM repos WHERE id = ?'
    ).bind(repoId).first() as { webhook_secret: string | null; webhook_owner_id: number | null } | null

    if (!repo) {
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Can only configure if not configured, or if user is the current owner
    const isConfigured = repo.webhook_secret !== null && repo.webhook_owner_id !== null
    const isOwner = repo.webhook_owner_id === user.id

    if (isConfigured && !isOwner) {
      return new Response(JSON.stringify({ error: 'Webhook already configured by another user' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Generate or retrieve provisional secret
    let provisional = await env.DB.prepare(
      'SELECT secret FROM provisional_webhook_secrets WHERE repo_id = ? AND user_id = ?'
    ).bind(repoId, user.id).first() as { secret: string } | null

    if (!provisional) {
      const secret = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '')
      await env.DB.prepare(
        'INSERT INTO provisional_webhook_secrets (repo_id, user_id, secret) VALUES (?, ?, ?)'
      ).bind(repoId, user.id, secret).run()
      provisional = { secret }
    }

    return new Response(JSON.stringify({
      provisionalSecret: provisional.secret,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to start configuration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
