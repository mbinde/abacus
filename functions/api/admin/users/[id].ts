// /api/admin/users/:id - Update and delete users (admin only)

import type { UserContext } from '../../_middleware'

interface Env {
  DB: D1Database
}

// PUT /api/admin/users/:id - Update user role
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params, data } = context
  const currentUser = (data as { user: UserContext }).user
  const targetUserId = Number(params.id)

  // Check admin permission
  if (currentUser.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Prevent admin from modifying their own role
  if (currentUser.id === targetUserId) {
    return new Response(JSON.stringify({ error: 'Cannot modify your own role' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { role } = await request.json() as { role: string }

    if (!['admin', 'user'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role. Must be "admin" or "user"' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check if target user exists
    const targetUser = await env.DB.prepare('SELECT id FROM users WHERE id = ?')
      .bind(targetUserId).first()

    if (!targetUser) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?')
      .bind(role, targetUserId).run()

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error updating user:', err)
    return new Response(JSON.stringify({ error: 'Failed to update user' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// DELETE /api/admin/users/:id - Delete a user
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, params, data } = context
  const currentUser = (data as { user: UserContext }).user
  const targetUserId = Number(params.id)

  // Check admin permission
  if (currentUser.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Prevent admin from deleting themselves
  if (currentUser.id === targetUserId) {
    return new Response(JSON.stringify({ error: 'Cannot delete yourself' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Check if target user exists
    const targetUser = await env.DB.prepare('SELECT id, github_login FROM users WHERE id = ?')
      .bind(targetUserId).first()

    if (!targetUser) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Delete user (CASCADE will delete their repos)
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(targetUserId).run()

    // Also delete their repos explicitly in case CASCADE isn't working
    await env.DB.prepare('DELETE FROM repos WHERE user_id = ?').bind(targetUserId).run()

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error deleting user:', err)
    return new Response(JSON.stringify({ error: 'Failed to delete user' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
