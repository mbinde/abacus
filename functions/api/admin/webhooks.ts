// /api/admin/webhooks - Admin webhook management

import type { UserContext } from '../_middleware'

interface Env {
  DB: D1Database
}

interface RepoWebhook {
  id: number
  owner: string
  name: string
  webhook_owner_id: number | null
  webhook_owner_login: string | null
  webhook_configured: boolean
}

// GET /api/admin/webhooks - List all repos with webhook info
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = (data as { user: UserContext }).user

  if (user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const result = await env.DB.prepare(`
      SELECT
        r.id,
        r.owner,
        r.name,
        r.webhook_owner_id,
        u.github_login as webhook_owner_login,
        CASE WHEN r.webhook_secret IS NOT NULL AND r.webhook_owner_id IS NOT NULL THEN 1 ELSE 0 END as webhook_configured
      FROM repos r
      LEFT JOIN users u ON r.webhook_owner_id = u.id
      ORDER BY r.owner, r.name
    `).all()

    const webhooks = (result.results as Array<Record<string, unknown>>).map(r => ({
      ...r,
      webhook_configured: Boolean(r.webhook_configured),
    }))

    return new Response(JSON.stringify({ webhooks }), {
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

// PUT /api/admin/webhooks - Update webhook ownership
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, data } = context
  const user = (data as { user: UserContext }).user

  if (user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { repo_id, action, new_owner_id } = await request.json() as {
      repo_id: number
      action: 'revoke' | 'transfer'
      new_owner_id?: number
    }

    if (!repo_id || !action) {
      return new Response(JSON.stringify({ error: 'repo_id and action are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (action === 'revoke') {
      // Clear webhook secret and owner
      await env.DB.prepare(`
        UPDATE repos
        SET webhook_secret = NULL, webhook_owner_id = NULL
        WHERE id = ?
      `).bind(repo_id).run()

      return new Response(JSON.stringify({ success: true, message: 'Webhook revoked' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (action === 'transfer') {
      if (!new_owner_id) {
        return new Response(JSON.stringify({ error: 'new_owner_id is required for transfer' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Transfer ownership to new user
      await env.DB.prepare(`
        UPDATE repos
        SET webhook_owner_id = ?
        WHERE id = ?
      `).bind(new_owner_id, repo_id).run()

      return new Response(JSON.stringify({ success: true, message: 'Webhook ownership transferred' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to update webhook' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
