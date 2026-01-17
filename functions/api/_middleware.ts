// Middleware for all /api/* routes

import { decryptToken, verifySignedSessionToken } from '../lib/crypto'

interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
  TOKEN_ENCRYPTION_KEY: string
}

// Check if anonymous access is enabled in settings
async function isAnonymousAccessEnabled(env: Env): Promise<boolean> {
  try {
    const result = await env.DB.prepare(
      "SELECT value FROM settings WHERE key = 'anonymous_access'"
    ).first() as { value: string } | null
    // Default to disabled if no setting exists
    return result?.value === 'enabled'
  } catch {
    return false
  }
}

// Rate limits for different endpoint categories
const RATE_LIMITS = {
  oauth: { window: 60, max: 10 },        // OAuth: 10 req/min
  mutation: { window: 60, max: 30 },     // Issue create/update/delete: 30 req/min
  bulk: { window: 60, max: 10 },         // Bulk operations: 10 req/min
  admin: { window: 60, max: 20 },        // Admin actions: 20 req/min
  dispatch: { window: 60, max: 20 },     // Executor dispatch: 20 req/min
}

// Get client IP from request
function getClientIP(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ||
         request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
         'unknown'
}

// Check rate limit for a given category and identifier
async function checkRateLimit(
  category: keyof typeof RATE_LIMITS,
  identifier: string,
  env: Env
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const limits = RATE_LIMITS[category]
  const key = `ratelimit:${category}:${identifier}`
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - (now % limits.window)
  const windowKey = `${key}:${windowStart}`

  const countStr = await env.SESSIONS.get(windowKey)
  const count = countStr ? parseInt(countStr, 10) : 0

  if (count >= limits.max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: windowStart + limits.window,
    }
  }

  // Increment counter
  await env.SESSIONS.put(windowKey, String(count + 1), {
    expirationTtl: limits.window * 2, // Keep slightly longer than window
  })

  return {
    allowed: true,
    remaining: limits.max - count - 1,
    resetAt: windowStart + limits.window,
  }
}

// Helper to create rate limit response
function rateLimitResponse(resetAt: number, max: number): Response {
  return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(resetAt - Math.floor(Date.now() / 1000)),
      'X-RateLimit-Limit': String(max),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(resetAt),
    },
  })
}

// Determine rate limit category for a path and method
function getRateLimitCategory(pathname: string, method: string): keyof typeof RATE_LIMITS | null {
  // OAuth endpoints
  if (pathname === '/api/auth/github' || pathname === '/api/auth/callback') {
    return 'oauth'
  }

  // Admin endpoints
  if (pathname.startsWith('/api/admin/') && method !== 'GET') {
    return 'admin'
  }

  // Executor dispatch
  if (pathname.includes('/executors/') && pathname.endsWith('/dispatch')) {
    return 'dispatch'
  }

  // Bulk operations
  if (pathname.endsWith('/issues/bulk')) {
    return 'bulk'
  }

  // Issue mutations (POST, PUT, DELETE on issue endpoints)
  if (pathname.includes('/issues') && ['POST', 'PUT', 'DELETE'].includes(method)) {
    return 'mutation'
  }

  // Comment creation
  if (pathname.endsWith('/comments') && method === 'POST') {
    return 'mutation'
  }

  return null
}

interface SessionData {
  userId: number
  githubId: number
  role: 'admin' | 'premium' | 'user' | 'guest'
}

export interface UserContext {
  id: number
  githubId: number
  github_login: string
  role: 'admin' | 'premium' | 'user' | 'guest'
  githubToken: string
}

// Anonymous user context for unauthenticated access
export interface AnonymousContext {
  anonymous: true
}

export type RequestContext = { user: UserContext } | { user: AnonymousContext }

// Check if path is for the public demo repo (read-only access allowed without auth)
function isPublicDemoRepoReadPath(pathname: string, method: string): boolean {
  // Only allow GET requests to steveyegge/beads
  if (method !== 'GET') return false

  const demoRepoPattern = /^\/api\/repos\/steveyegge\/beads\//
  return demoRepoPattern.test(pathname)
}

// Get session data from cookie (supports both signed tokens and legacy tokens)
async function getSession(request: Request, env: Env): Promise<SessionData | null> {
  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(/session=([^;]+)/)
  if (!match) return null

  const token = match[1]

  // Try signed token first (contains a dot separator)
  if (token.includes('.')) {
    const payload = await verifySignedSessionToken(token, env.TOKEN_ENCRYPTION_KEY)
    if (payload) {
      // Verify session still exists in KV (for revocation support)
      // If KV check fails, still allow the session (KV is optional for revocation)
      try {
        const kvSession = await env.SESSIONS.get(`session:${payload.id}`)
        if (!kvSession) {
          console.log('[auth] Session not found in KV, but token is valid - allowing')
        }
      } catch (kvError) {
        console.error('[auth] KV lookup failed:', kvError)
        // Continue anyway - token signature is valid
      }

      return {
        userId: payload.userId,
        githubId: payload.githubId,
        role: payload.role,
      }
    }
  }

  // Fall back to legacy UUID token lookup (for existing sessions during migration)
  const session = await env.SESSIONS.get(`session:${token}`)
  if (!session) return null

  return JSON.parse(session) as SessionData
}

// Security headers to add to all API responses
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  // CSP for API responses - more restrictive since they're JSON, not HTML
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
}

// CSRF protection: require custom header for state-changing operations
// Browsers block cross-origin sites from setting custom headers
const CSRF_HEADER = 'X-Requested-With'
const CSRF_HEADER_VALUE = 'abacus'

function requiresCsrfProtection(method: string, pathname: string): boolean {
  // Only state-changing methods need protection
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) return false

  // Webhook endpoint is called by GitHub, not the browser
  if (pathname === '/api/webhooks/github') return false

  return true
}

// Validate that the origin matches the request's own origin (same-origin policy)
// For Cloudflare Pages, the frontend and API are served from the same origin
function isAllowedOrigin(origin: string, requestUrl: URL): boolean {
  // Same-origin: the Origin header should match the request's origin
  const requestOrigin = requestUrl.origin
  return origin === requestOrigin
}

// Add security headers to a response
function addSecurityHeaders(response: Response, request?: Request): Response {
  const newResponse = new Response(response.body, response)
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    newResponse.headers.set(key, value)
  }

  // Add CORS headers for same-origin requests
  if (request) {
    const origin = request.headers.get('Origin')
    if (origin) {
      const url = new URL(request.url)
      if (isAllowedOrigin(origin, url)) {
        newResponse.headers.set('Access-Control-Allow-Origin', origin)
        newResponse.headers.set('Access-Control-Allow-Credentials', 'true')
      }
    }
  }

  return newResponse
}

// Handle CORS preflight requests
function handleCors(request: Request): Response | null {
  // Only handle OPTIONS requests
  if (request.method !== 'OPTIONS') return null

  const origin = request.headers.get('Origin')
  if (!origin) return null

  const url = new URL(request.url)

  // Only allow same-origin requests
  if (!isAllowedOrigin(origin, url)) {
    return new Response('CORS origin not allowed', { status: 403 })
  }

  const headers = new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    ...SECURITY_HEADERS,
  })

  return new Response(null, { status: 204, headers })
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next, data } = context
  const url = new URL(request.url)

  // Handle CORS preflight
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  // CSRF protection: require custom header for state-changing operations
  if (requiresCsrfProtection(request.method, url.pathname)) {
    const csrfHeader = request.headers.get(CSRF_HEADER)
    if (csrfHeader !== CSRF_HEADER_VALUE) {
      return addSecurityHeaders(new Response(JSON.stringify({ error: 'Missing or invalid CSRF header' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }), request)
    }
  }

  // Check rate limits for this endpoint
  const rateLimitCategory = getRateLimitCategory(url.pathname, request.method)

  if (rateLimitCategory) {
    // Use IP for unauthenticated endpoints (oauth), user session will be added after auth for others
    const clientIP = getClientIP(request)
    const identifier = clientIP  // Will be replaced with user ID for authenticated endpoints below

    // For oauth endpoints, check rate limit immediately
    if (rateLimitCategory === 'oauth') {
      const rateLimit = await checkRateLimit(rateLimitCategory, identifier, env)

      if (!rateLimit.allowed) {
        return addSecurityHeaders(rateLimitResponse(rateLimit.resetAt, RATE_LIMITS[rateLimitCategory].max), request)
      }

      // Add rate limit headers to successful responses
      const response = await next()
      const newResponse = addSecurityHeaders(response, request)
      newResponse.headers.set('X-RateLimit-Limit', String(RATE_LIMITS[rateLimitCategory].max))
      newResponse.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining))
      newResponse.headers.set('X-RateLimit-Reset', String(rateLimit.resetAt))
      return newResponse
    }
    // For authenticated endpoints, rate limiting is applied after auth below
  }

  // Public endpoints - no auth required
  const publicPaths = [
    '/api/auth/check',
    '/api/auth/logout',
    '/api/webhooks/github',
    '/api/settings',
  ]

  if (publicPaths.some(p => url.pathname === p)) {
    const response = await next()
    return addSecurityHeaders(response, request)
  }

  // Get session
  const session = await getSession(request, env)

  if (!session) {
    // Allow anonymous read-only access to demo repo if enabled
    if (isPublicDemoRepoReadPath(url.pathname, request.method)) {
      const anonEnabled = await isAnonymousAccessEnabled(env)
      if (anonEnabled) {
        ;(data as { user: AnonymousContext }).user = { anonymous: true }
        const response = await next()
        return addSecurityHeaders(response, request)
      }
    }

    return addSecurityHeaders(new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }), request)
  }

  // Get user's encrypted token from DB
  const user = await env.DB.prepare(
    'SELECT id, github_login, github_token_encrypted, role FROM users WHERE id = ?'
  ).bind(session.userId).first() as { id: number; github_login: string; github_token_encrypted: string; role: 'admin' | 'premium' | 'user' | 'guest' } | null

  if (!user) {
    return addSecurityHeaders(new Response(JSON.stringify({ error: 'User not found' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }), request)
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

  // Apply rate limiting for authenticated mutation endpoints (using user ID as identifier)
  // Note: 'oauth' is handled earlier in the function so it won't reach here
  if (rateLimitCategory) {
    const rateLimit = await checkRateLimit(rateLimitCategory, String(session.userId), env)

    if (!rateLimit.allowed) {
      return addSecurityHeaders(rateLimitResponse(rateLimit.resetAt, RATE_LIMITS[rateLimitCategory].max), request)
    }

    // Add rate limit headers to successful responses
    const response = await next()
    const newResponse = addSecurityHeaders(response, request)
    newResponse.headers.set('X-RateLimit-Limit', String(RATE_LIMITS[rateLimitCategory].max))
    newResponse.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining))
    newResponse.headers.set('X-RateLimit-Reset', String(rateLimit.resetAt))
    return newResponse
  }

  const response = await next()
  return addSecurityHeaders(response, request)
}
