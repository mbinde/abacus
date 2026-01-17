// /api/admin/action-log - View action log entries (admin only)

import type { UserContext } from '../_middleware'

interface ActionLogEntry {
  id: number
  user_id: number | null
  user_login: string | null
  action: string
  repo_owner: string
  repo_name: string
  issue_id: string | null
  request_payload: string | null
  success: number
  error_message: string | null
  retry_count: number
  conflict_detected: number
  duration_ms: number | null
  request_id: string | null
  created_at: string
}

interface Env {
  DB: D1Database
}

// GET /api/admin/action-log - List action log entries with filters
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, data } = context
  const user = (data as { user: UserContext }).user

  // Admin only
  if (user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
  const offset = parseInt(url.searchParams.get('offset') || '0')
  const successFilter = url.searchParams.get('success') // 'true', 'false', or null for all
  const actionFilter = url.searchParams.get('action') // 'update_issue', 'add_comment', etc.
  const repoFilter = url.searchParams.get('repo') // 'owner/name'
  const userFilter = url.searchParams.get('user') // github_login

  try {
    let query = 'SELECT * FROM action_log WHERE 1=1'
    const params: (string | number)[] = []

    if (successFilter === 'true') {
      query += ' AND success = 1'
    } else if (successFilter === 'false') {
      query += ' AND success = 0'
    }

    if (actionFilter) {
      query += ' AND action = ?'
      params.push(actionFilter)
    }

    if (repoFilter) {
      const [owner, name] = repoFilter.split('/')
      if (owner && name) {
        query += ' AND LOWER(repo_owner) = LOWER(?) AND LOWER(repo_name) = LOWER(?)'
        params.push(owner, name)
      }
    }

    if (userFilter) {
      query += ' AND user_login = ?'
      params.push(userFilter)
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const result = await env.DB.prepare(query).bind(...params).all<ActionLogEntry>()

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as count FROM action_log WHERE 1=1'
    const countParams: (string | number)[] = []

    if (successFilter === 'true') {
      countQuery += ' AND success = 1'
    } else if (successFilter === 'false') {
      countQuery += ' AND success = 0'
    }

    if (actionFilter) {
      countQuery += ' AND action = ?'
      countParams.push(actionFilter)
    }

    if (repoFilter) {
      const [owner, name] = repoFilter.split('/')
      if (owner && name) {
        countQuery += ' AND LOWER(repo_owner) = LOWER(?) AND LOWER(repo_name) = LOWER(?)'
        countParams.push(owner, name)
      }
    }

    if (userFilter) {
      countQuery += ' AND user_login = ?'
      countParams.push(userFilter)
    }

    const countResult = await env.DB.prepare(countQuery).bind(...countParams).first<{ count: number }>()

    return new Response(JSON.stringify({
      entries: result.results,
      total: countResult?.count || 0,
      limit,
      offset,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error fetching action log:', err)
    return new Response(JSON.stringify({ error: 'Failed to fetch action log' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// DELETE /api/admin/action-log - Clear old entries
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, data } = context
  const user = (data as { user: UserContext }).user

  // Admin only
  if (user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(request.url)
  const days = parseInt(url.searchParams.get('days') || '30')

  try {
    const result = await env.DB.prepare(
      `DELETE FROM action_log WHERE created_at < datetime('now', '-' || ? || ' days')`
    ).bind(days).run()

    return new Response(JSON.stringify({
      success: true,
      deleted: result.meta.changes,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error clearing action log:', err)
    return new Response(JSON.stringify({ error: 'Failed to clear action log' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
