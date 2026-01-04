// Middleware for all /api/* routes

import { decryptToken } from '../lib/crypto'

interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
  TOKEN_ENCRYPTION_KEY: string
}

interface SessionData {
  userId: number
  githubId: number
  role: 'admin' | 'user'
}

export interface UserContext {
  id: number
  githubId: number
  role: 'admin' | 'user'
  githubToken: string
}

// Get session data from cookie
async function getSession(request: Request, env: Env): Promise<SessionData | null> {
  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(/session=([^;]+)/)
  if (!match) return null

  const token = match[1]
  const session = await env.SESSIONS.get(`session:${token}`)
  if (!session) return null

  return JSON.parse(session) as SessionData
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next, data } = context
  const url = new URL(request.url)

  // Public endpoints - no auth required
  const publicPaths = [
    '/api/auth/github',
    '/api/auth/callback',
    '/api/auth/check',
    '/api/auth/logout',
  ]

  if (publicPaths.some(p => url.pathname === p)) {
    return next()
  }

  // Get session
  const session = await getSession(request, env)

  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Get user's encrypted token from DB
  const user = await env.DB.prepare(
    'SELECT id, github_token_encrypted, role FROM users WHERE id = ?'
  ).bind(session.userId).first() as { id: number; github_token_encrypted: string; role: 'admin' | 'user' } | null

  if (!user) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Decrypt token
  const githubToken = await decryptToken(user.github_token_encrypted, env.TOKEN_ENCRYPTION_KEY)

  // Attach user info to context data for downstream handlers
  ;(data as { user: UserContext }).user = {
    id: session.userId,
    githubId: session.githubId,
    role: user.role,
    githubToken,
  }

  return next()
}
