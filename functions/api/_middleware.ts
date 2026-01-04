// Middleware for all /api/* routes

import { decryptToken } from '../lib/crypto'

interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
  TOKEN_ENCRYPTION_KEY: string
}

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60 // seconds
const RATE_LIMIT_MAX_REQUESTS = 10 // max requests per window for OAuth endpoints

// Get client IP from request
function getClientIP(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ||
         request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
         'unknown'
}

// Check rate limit for OAuth endpoints
async function checkRateLimit(ip: string, env: Env): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const key = `ratelimit:oauth:${ip}`
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - (now % RATE_LIMIT_WINDOW)
  const windowKey = `${key}:${windowStart}`

  const countStr = await env.SESSIONS.get(windowKey)
  const count = countStr ? parseInt(countStr, 10) : 0

  if (count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: windowStart + RATE_LIMIT_WINDOW,
    }
  }

  // Increment counter
  await env.SESSIONS.put(windowKey, String(count + 1), {
    expirationTtl: RATE_LIMIT_WINDOW * 2, // Keep slightly longer than window
  })

  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_REQUESTS - count - 1,
    resetAt: windowStart + RATE_LIMIT_WINDOW,
  }
}

interface SessionData {
  userId: number
  githubId: number
  role: 'admin' | 'premium' | 'user'
}

export interface UserContext {
  id: number
  githubId: number
  github_login: string
  role: 'admin' | 'premium' | 'user'
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

  // Rate-limited OAuth endpoints
  const rateLimitedPaths = [
    '/api/auth/github',
    '/api/auth/callback',
  ]

  if (rateLimitedPaths.some(p => url.pathname === p)) {
    const clientIP = getClientIP(request)
    const rateLimit = await checkRateLimit(clientIP, env)

    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimit.resetAt - Math.floor(Date.now() / 1000)),
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rateLimit.resetAt),
        },
      })
    }

    // Add rate limit headers to successful responses
    const response = await next()
    const newResponse = new Response(response.body, response)
    newResponse.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS))
    newResponse.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining))
    newResponse.headers.set('X-RateLimit-Reset', String(rateLimit.resetAt))
    return newResponse
  }

  // Public endpoints - no auth required
  const publicPaths = [
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
    'SELECT id, github_login, github_token_encrypted, role FROM users WHERE id = ?'
  ).bind(session.userId).first() as { id: number; github_login: string; github_token_encrypted: string; role: 'admin' | 'premium' | 'user' } | null

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
    github_login: user.github_login,
    role: user.role,
    githubToken,
  }

  return next()
}
