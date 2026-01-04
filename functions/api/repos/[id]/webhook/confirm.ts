// /api/repos/:id/webhook/confirm - Confirm webhook configuration

import type { UserContext } from '../../../_middleware'

interface Env {
  DB: D1Database
}

// POST /api/repos/:id/webhook/confirm - Promote provisional secret to confirmed
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
    // Get provisional secret
    const provisional = await env.DB.prepare(
      'SELECT secret, verified_at FROM provisional_webhook_secrets WHERE repo_id = ? AND user_id = ?'
    ).bind(repoId, user.id).first() as { secret: string; verified_at: string | null } | null

    if (!provisional) {
      return new Response(JSON.stringify({ error: 'No pending configuration. Call configure first.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check that GitHub has pinged us with this secret (verification)
    if (!provisional.verified_at) {
      return new Response(JSON.stringify({ error: 'Webhook not verified. Please ensure the webhook is configured correctly in GitHub and that GitHub has successfully sent a ping.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check repo still exists and is available for configuration
    const repo = await env.DB.prepare(
      'SELECT webhook_secret, webhook_owner_id FROM repos WHERE id = ?'
    ).bind(repoId).first() as { webhook_secret: string | null; webhook_owner_id: number | null } | null

    if (!repo) {
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check if someone else configured it while we were setting up
    const isConfigured = repo.webhook_secret !== null && repo.webhook_owner_id !== null
    const isOwner = repo.webhook_owner_id === user.id

    if (isConfigured && !isOwner) {
      // Someone else beat us to it - clean up our provisional
      await env.DB.prepare(
        'DELETE FROM provisional_webhook_secrets WHERE repo_id = ? AND user_id = ?'
      ).bind(repoId, user.id).run()

      return new Response(JSON.stringify({ error: 'Webhook was configured by another user' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Promote provisional to confirmed
    await env.DB.prepare(`
      UPDATE repos
      SET webhook_secret = ?, webhook_owner_id = ?
      WHERE id = ?
    `).bind(provisional.secret, user.id, repoId).run()

    // Clean up provisional secret
    await env.DB.prepare(
      'DELETE FROM provisional_webhook_secrets WHERE repo_id = ? AND user_id = ?'
    ).bind(repoId, user.id).run()

    // Also clean up any other provisional secrets for this repo (other users who were trying)
    await env.DB.prepare(
      'DELETE FROM provisional_webhook_secrets WHERE repo_id = ?'
    ).bind(repoId).run()

    return new Response(JSON.stringify({
      success: true,
      secret: provisional.secret,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to confirm configuration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
