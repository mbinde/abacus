// /api/repos/:id/settings - Get and update per-repo notification settings

import type { UserContext } from '../../_middleware'

interface Env {
  DB: D1Database
}

interface RepoSettings {
  notify_issues: 'none' | 'favorites' | 'assigned' | 'all'
  notify_actions: string // comma-separated: 'open,update,close'
}

// GET /api/repos/:id/settings - Get notification settings for this repo
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params, data } = context
  const user = (data as { user: UserContext }).user
  const repoId = Number(params.id)

  try {
    // Verify user has access to this repo
    const userRepo = await env.DB.prepare(
      'SELECT 1 FROM user_repos WHERE user_id = ? AND repo_id = ?'
    ).bind(user.id, repoId).first()

    if (!userRepo) {
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Get settings or return defaults
    const settings = await env.DB.prepare(
      'SELECT notify_issues, notify_actions FROM user_repo_settings WHERE user_id = ? AND repo_id = ?'
    ).bind(user.id, repoId).first() as RepoSettings | null

    return new Response(JSON.stringify({
      settings: settings || {
        notify_issues: 'assigned',
        notify_actions: 'open,update,close',
      },
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

// PUT /api/repos/:id/settings - Update notification settings for this repo
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params, data } = context
  const user = (data as { user: UserContext }).user
  const repoId = Number(params.id)

  // Only premium users can configure notifications
  if (user.role !== 'premium' && user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Premium subscription required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await request.json() as Partial<RepoSettings>

    // Validate notify_issues
    const validIssueOptions = ['none', 'favorites', 'assigned', 'all']
    if (body.notify_issues && !validIssueOptions.includes(body.notify_issues)) {
      return new Response(JSON.stringify({ error: 'Invalid notify_issues value' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Validate notify_actions (should be comma-separated subset of open,update,close)
    if (body.notify_actions) {
      const validActions = ['open', 'update', 'close']
      const actions = body.notify_actions.split(',').map(a => a.trim())
      if (!actions.every(a => validActions.includes(a))) {
        return new Response(JSON.stringify({ error: 'Invalid notify_actions value' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // Verify user has access to this repo
    const userRepo = await env.DB.prepare(
      'SELECT 1 FROM user_repos WHERE user_id = ? AND repo_id = ?'
    ).bind(user.id, repoId).first()

    if (!userRepo) {
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Upsert settings
    await env.DB.prepare(`
      INSERT INTO user_repo_settings (user_id, repo_id, notify_issues, notify_actions)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, repo_id) DO UPDATE SET
        notify_issues = COALESCE(excluded.notify_issues, notify_issues),
        notify_actions = COALESCE(excluded.notify_actions, notify_actions),
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      user.id,
      repoId,
      body.notify_issues || 'assigned',
      body.notify_actions || 'open,update,close'
    ).run()

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to save settings' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
