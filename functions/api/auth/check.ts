// GET /api/auth/check - Check authentication status and return user info

interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
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
  const session = await env.SESSIONS.get(`session:${token}`)

  if (!session) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const sessionData = JSON.parse(session) as SessionData

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
