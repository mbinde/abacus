// /api/user/profile - Get and update user profile

import type { UserContext } from '../_middleware'

interface Env {
  DB: D1Database
}

interface UserProfile {
  id: number
  github_login: string
  github_name: string | null
  github_avatar_url: string
  email: string | null
  email_notifications: boolean
  role: 'admin' | 'premium' | 'user'
}

// GET /api/user/profile - Get current user's profile
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = (data as { user: UserContext }).user

  try {
    const profile = await env.DB.prepare(`
      SELECT id, github_login, github_name, github_avatar_url, email, email_notifications, role
      FROM users WHERE id = ?
    `).bind(user.id).first() as UserProfile | null

    if (!profile) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      profile: {
        ...profile,
        email_notifications: Boolean(profile.email_notifications),
      }
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

// PUT /api/user/profile - Update current user's profile
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, data } = context
  const user = (data as { user: UserContext }).user

  try {
    const body = await request.json() as { email?: string; email_notifications?: boolean }

    // Validate email format if provided
    if (body.email !== undefined && body.email !== null && body.email !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(body.email)) {
        return new Response(JSON.stringify({ error: 'Invalid email format' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // Build update query dynamically
    const updates: string[] = []
    const values: (string | number | null)[] = []

    if (body.email !== undefined) {
      updates.push('email = ?')
      values.push(body.email || null)
    }

    if (body.email_notifications !== undefined) {
      updates.push('email_notifications = ?')
      values.push(body.email_notifications ? 1 : 0)
    }

    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: 'No fields to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    values.push(user.id)

    await env.DB.prepare(`
      UPDATE users SET ${updates.join(', ')} WHERE id = ?
    `).bind(...values).run()

    // Return updated profile
    const profile = await env.DB.prepare(`
      SELECT id, github_login, github_name, github_avatar_url, email, email_notifications, role
      FROM users WHERE id = ?
    `).bind(user.id).first() as UserProfile

    return new Response(JSON.stringify({
      profile: {
        ...profile,
        email_notifications: Boolean(profile.email_notifications),
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to update profile' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
