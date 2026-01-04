interface Env {
  SESSIONS: KVNamespace
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(/session=([^;]+)/)

  if (match) {
    const token = match[1]
    await env.SESSIONS.delete(`session:${token}`)
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
    },
  })
}
