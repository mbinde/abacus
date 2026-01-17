// GET /api/auth/check - Check authentication status and return user info

import { verifySignedSessionToken } from '../../lib/crypto'

interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
  TOKEN_ENCRYPTION_KEY: string
}

interface SessionData {
  userId: number
  role: string
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(/session=([^;]+)/)

  if (!match) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const token = match[1]
  let sessionData: SessionData | null = null

  // Try signed token first (contains a dot separator)
  if (token.includes('.')) {
    const payload = await verifySignedSessionToken(token, env.TOKEN_ENCRYPTION_KEY)
    if (payload) {
      sessionData = {
        userId: payload.userId,
        role: payload.role,
      }
    }
  }

  // Fall back to legacy UUID token lookup (for existing sessions during migration)
  if (!sessionData) {
    const session = await env.SESSIONS.get(`session:${token}`)
    if (session) {
      sessionData = JSON.parse(session) as SessionData
    }
  }

  if (!sessionData) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Get user details from database
  const user = await env.DB.prepare(
    'SELECT id, github_login, github_name, github_avatar_url, role FROM users WHERE id = ?'
  ).bind(sessionData.userId).first()

  if (!user) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    authenticated: true,
    user: {
      id: user.id,
      login: user.github_login,
      name: user.github_name,
      avatarUrl: user.github_avatar_url,
      role: user.role,
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
