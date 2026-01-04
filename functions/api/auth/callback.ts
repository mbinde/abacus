// GET /api/auth/callback - Handle GitHub OAuth callback

import { encryptToken } from '../../lib/crypto'

interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  TOKEN_ENCRYPTION_KEY: string
}

interface GitHubTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface GitHubUser {
  id: number
  login: string
  name: string | null
  avatar_url: string
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context
  const url = new URL(request.url)

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  // Handle OAuth errors from GitHub
  if (error) {
    const errorDesc = url.searchParams.get('error_description') || error
    return Response.redirect(`${url.origin}/?error=${encodeURIComponent(errorDesc)}`)
  }

  // Verify state from cookie (CSRF protection)
  const cookie = request.headers.get('Cookie') || ''
  const storedState = cookie.match(/oauth_state=([^;]+)/)?.[1]

  if (!code || !state || state !== storedState) {
    return Response.redirect(`${url.origin}/?error=invalid_state`)
  }

  // Exchange code for access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  })

  const tokenData = await tokenRes.json() as GitHubTokenResponse

  if (tokenData.error || !tokenData.access_token) {
    const errorMsg = tokenData.error_description || tokenData.error || 'token_exchange_failed'
    return Response.redirect(`${url.origin}/?error=${encodeURIComponent(errorMsg)}`)
  }

  // Get user info from GitHub
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `token ${tokenData.access_token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'abacus',
    },
  })

  if (!userRes.ok) {
    return Response.redirect(`${url.origin}/?error=failed_to_get_user`)
  }

  const githubUser = await userRes.json() as GitHubUser

  // Encrypt the token before storing
  const encryptedToken = await encryptToken(tokenData.access_token, env.TOKEN_ENCRYPTION_KEY)

  // Check if user already exists
  let user = await env.DB.prepare(
    'SELECT * FROM users WHERE github_id = ?'
  ).bind(githubUser.id).first()

  if (user) {
    // Update existing user
    await env.DB.prepare(`
      UPDATE users SET
        github_login = ?,
        github_name = ?,
        github_avatar_url = ?,
        github_token_encrypted = ?,
        last_login_at = CURRENT_TIMESTAMP
      WHERE github_id = ?
    `).bind(
      githubUser.login,
      githubUser.name,
      githubUser.avatar_url,
      encryptedToken,
      githubUser.id
    ).run()

    // Refresh user data
    user = await env.DB.prepare(
      'SELECT * FROM users WHERE github_id = ?'
    ).bind(githubUser.id).first()
  } else {
    // Check if this is the first user (make them admin)
    const countResult = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first() as { count: number }
    const isFirstUser = countResult.count === 0

    // Check registration mode (first user always allowed)
    if (!isFirstUser) {
      const regMode = await env.DB.prepare(
        "SELECT value FROM settings WHERE key = 'registration_mode'"
      ).first() as { value: string } | null

      if (regMode?.value === 'closed') {
        return Response.redirect(`${url.origin}/?error=${encodeURIComponent('Registration is closed. Contact an administrator for access.')}`)
      }
    }

    // Create new user
    await env.DB.prepare(`
      INSERT INTO users (github_id, github_login, github_name, github_avatar_url, github_token_encrypted, role, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      githubUser.id,
      githubUser.login,
      githubUser.name,
      githubUser.avatar_url,
      encryptedToken,
      isFirstUser ? 'admin' : 'user'
    ).run()

    user = await env.DB.prepare(
      'SELECT * FROM users WHERE github_id = ?'
    ).bind(githubUser.id).first()
  }

  // Create session
  const sessionToken = crypto.randomUUID()
  const sessionData = JSON.stringify({
    userId: user!.id,
    githubId: githubUser.id,
    role: user!.role,
  })

  const sessionTtl = 60 * 60 * 24 * 7 // 7 days

  await env.SESSIONS.put(`session:${sessionToken}`, sessionData, {
    expirationTtl: sessionTtl
  })

  // Store reverse mapping for session invalidation on user deletion
  // Get existing sessions for this user and add the new one
  const userSessionsKey = `user_sessions:${user!.id}`
  const existingSessions = await env.SESSIONS.get(userSessionsKey)
  const sessionsList = existingSessions ? JSON.parse(existingSessions) as string[] : []
  sessionsList.push(sessionToken)
  await env.SESSIONS.put(userSessionsKey, JSON.stringify(sessionsList), {
    expirationTtl: sessionTtl
  })

  // Clear oauth_state and set session cookie
  const headers = new Headers()
  headers.append('Location', url.origin)
  headers.append('Set-Cookie', 'oauth_state=; Path=/; HttpOnly; Secure; Max-Age=0')
  headers.append('Set-Cookie', `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`)

  return new Response(null, {
    status: 302,
    headers,
  })
}
