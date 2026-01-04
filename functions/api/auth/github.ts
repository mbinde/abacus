// GET /api/auth/github - Initiate GitHub OAuth flow

interface Env {
  GITHUB_CLIENT_ID: string
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context
  const url = new URL(request.url)

  // Generate state for CSRF protection
  const state = crypto.randomUUID()

  // Build GitHub OAuth URL
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${url.origin}/api/auth/callback`,
    scope: 'repo read:user',
    state,
  })

  const githubUrl = `https://github.com/login/oauth/authorize?${params}`

  // Store state in cookie for verification (10 minute expiry)
  return new Response(null, {
    status: 302,
    headers: {
      'Location': githubUrl,
      'Set-Cookie': `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    },
  })
}
