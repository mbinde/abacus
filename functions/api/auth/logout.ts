import { verifySignedSessionToken } from '../../lib/crypto'

interface Env {
  SESSIONS: KVNamespace
  TOKEN_ENCRYPTION_KEY: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(/session=([^;]+)/)

  if (match) {
    const token = match[1]

    // Try signed token first (contains a dot separator)
    if (token.includes('.')) {
      const payload = await verifySignedSessionToken(token, env.TOKEN_ENCRYPTION_KEY)
      if (payload) {
        // Delete session from KV using the session ID from the token
        await env.SESSIONS.delete(`session:${payload.id}`)
      }
    } else {
      // Legacy UUID token - delete directly
      await env.SESSIONS.delete(`session:${token}`)
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
    },
  })
}
