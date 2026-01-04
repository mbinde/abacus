// /api/admin/users/:id - Update and delete users (admin only)

import type { UserContext } from '../../_middleware'

interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
}

// Audit log helper - logs admin actions to console in structured format
function auditLog(action: string, adminUser: UserContext, targetUserId: number, details: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    type: 'AUDIT',
    timestamp: new Date().toISOString(),
    action,
    admin: {
      id: adminUser.id,
      login: adminUser.github_login,
    },
    target: {
      userId: targetUserId,
    },
    ...details,
  }))
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

    // Check if target user exists and get current role
    const targetUser = await env.DB.prepare('SELECT id, role, github_login FROM users WHERE id = ?')
      .bind(targetUserId).first<{ id: number; role: string; github_login: string }>()

    if (!targetUser) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const oldRole = targetUser.role
    await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?')
      .bind(role, targetUserId).run()

    auditLog('ROLE_CHANGE', currentUser, targetUserId, {
      targetLogin: targetUser.github_login,
      oldRole,
      newRole: role,
    })

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
      .bind(targetUserId).first<{ id: number; github_login: string }>()

    if (!targetUser) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Invalidate all sessions for the deleted user
    const userSessionsKey = `user_sessions:${targetUserId}`
    const sessionsData = await env.SESSIONS.get(userSessionsKey)
    if (sessionsData) {
      const sessionTokens = JSON.parse(sessionsData) as string[]
      await Promise.all(sessionTokens.map(token => env.SESSIONS.delete(`session:${token}`)))
      await env.SESSIONS.delete(userSessionsKey)
    }

    // Delete user (CASCADE will delete their repos)
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(targetUserId).run()

    // Also delete their repos explicitly in case CASCADE isn't working
    await env.DB.prepare('DELETE FROM repos WHERE user_id = ?').bind(targetUserId).run()

    auditLog('USER_DELETE', currentUser, targetUserId, {
      targetLogin: targetUser.github_login,
    })

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
