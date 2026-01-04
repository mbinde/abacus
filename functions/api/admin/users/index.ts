// GET /api/admin/users - List all users (admin only)

import type { UserContext } from '../../_middleware'

interface Env {
  DB: D1Database
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = (data as { user: UserContext }).user

  // Check admin permission
  if (user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const result = await env.DB.prepare(`
      SELECT id, github_id, github_login, github_name, github_avatar_url, role, created_at, last_login_at
      FROM users ORDER BY created_at DESC
    `).all()

    return new Response(JSON.stringify({ users: result.results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error fetching users:', err)
    return new Response(JSON.stringify({ error: 'Failed to fetch users' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
