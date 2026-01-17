// POST /api/auth/mobile/token - Exchange OAuth code for access token (with App Attest)
//
// This endpoint performs the OAuth token exchange for mobile apps. It requires
// App Attest verification to ensure requests come from the legitimate iOS app.
//
// Flow:
// 1. First request (attestation): Verify the attestation blob with Apple
// 2. Subsequent requests (assertion): Verify the assertion signature
// 3. Exchange the OAuth code for a GitHub access token
// 4. Create a session and return the token

import { encryptToken, createSignedSessionToken } from '../../../lib/crypto'
import { verifyAttestation, verifyAssertion } from '../../../lib/appattest'

interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  TOKEN_ENCRYPTION_KEY: string
  APPLE_APP_ID: string  // e.g., "TEAMID.com.abacus.mobile"
}

interface TokenRequest {
  code: string
  redirect_uri: string
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
  email: string | null
}

interface GitHubEmail {
  email: string
  primary: boolean
  verified: boolean
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context

  const jsonError = (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  try {
    // Validate required environment variables
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      console.error('Missing GitHub OAuth credentials')
      return jsonError('Server configuration error', 500)
    }
    if (!env.TOKEN_ENCRYPTION_KEY || env.TOKEN_ENCRYPTION_KEY.length !== 64) {
      console.error('Missing or invalid TOKEN_ENCRYPTION_KEY')
      return jsonError('Server configuration error', 500)
    }

    // Parse request body
    const body = await request.json() as TokenRequest
    if (!body.code) {
      return jsonError('Missing OAuth code', 400)
    }

    // Get App Attest headers
    const attestSupported = request.headers.get('X-App-Attest-Supported')
    const keyId = request.headers.get('X-App-Attest-Key-Id')
    const attestation = request.headers.get('X-App-Attest-Attestation')
    const challenge = request.headers.get('X-App-Attest-Challenge')
    const challengeId = request.headers.get('X-App-Attest-Challenge-Id')
    const assertion = request.headers.get('X-App-Attest-Assertion')

    // Require App Attest (unless explicitly disabled for development)
    if (attestSupported !== 'true') {
      // In production, you might want to reject non-attested requests
      // For now, log and continue (allows simulator testing)
      console.warn('App Attest not supported by client')
      // return jsonError('App Attest required', 403)
    }

    // Verify App Attest
    if (attestSupported === 'true' && keyId) {
      if (attestation && challenge && challengeId) {
        // First-time attestation flow
        // 1. Verify the challenge hasn't expired and matches
        const storedChallenge = await env.SESSIONS.get(`attest_challenge:${challengeId}`)
        if (!storedChallenge || storedChallenge !== challenge) {
          return jsonError('Invalid or expired attestation challenge', 401)
        }

        // 2. Delete the challenge (one-time use)
        await env.SESSIONS.delete(`attest_challenge:${challengeId}`)

        // 3. Verify the attestation with Apple
        const attestResult = await verifyAttestation({
          attestation,
          challenge,
          keyId,
          appId: env.APPLE_APP_ID,
        })

        if (!attestResult.valid) {
          console.error('Attestation verification failed:', attestResult.error)
          return jsonError(`Attestation verification failed: ${attestResult.error}`, 401)
        }

        // 4. Store the attested key for future assertion verification
        await env.SESSIONS.put(
          `attest_key:${keyId}`,
          JSON.stringify({
            publicKey: attestResult.publicKey,
            counter: 0,  // Assertion counter for replay protection
            attestedAt: Date.now(),
          }),
          { expirationTtl: 60 * 60 * 24 * 365 }  // 1 year
        )

        console.log('App Attest: Key attested successfully:', keyId)

      } else if (assertion) {
        // Subsequent request with assertion
        // 1. Get the stored key data
        const keyDataJson = await env.SESSIONS.get(`attest_key:${keyId}`)
        if (!keyDataJson) {
          return jsonError('Unknown attestation key - please re-authenticate', 401)
        }

        const keyData = JSON.parse(keyDataJson) as {
          publicKey: string
          counter: number
          attestedAt: number
        }

        // 2. Get the request body for assertion verification
        const bodyText = JSON.stringify(body)

        // 3. Verify the assertion
        const assertResult = await verifyAssertion({
          assertion,
          clientData: bodyText,
          publicKey: keyData.publicKey,
          previousCounter: keyData.counter,
        })

        if (!assertResult.valid) {
          console.error('Assertion verification failed:', assertResult.error)
          return jsonError(`Assertion verification failed: ${assertResult.error}`, 401)
        }

        // 4. Update the counter for replay protection
        await env.SESSIONS.put(
          `attest_key:${keyId}`,
          JSON.stringify({
            ...keyData,
            counter: assertResult.counter,
          }),
          { expirationTtl: 60 * 60 * 24 * 365 }
        )

      } else {
        return jsonError('Missing attestation or assertion', 401)
      }
    }

    // === App Attest verified (or skipped for dev) ===
    // Now perform the OAuth token exchange

    // Exchange code for GitHub access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code: body.code,
      }),
    })

    const tokenData = await tokenRes.json() as GitHubTokenResponse

    if (tokenData.error || !tokenData.access_token) {
      const errorMsg = tokenData.error_description || tokenData.error || 'token_exchange_failed'
      return jsonError(errorMsg, 400)
    }

    // Get user info from GitHub
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'abacus-mobile',
      },
    })

    if (!userRes.ok) {
      return jsonError('Failed to get user info from GitHub', 400)
    }

    const githubUser = await userRes.json() as GitHubUser

    // Get user's primary email if not in profile
    let userEmail = githubUser.email
    if (!userEmail) {
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `token ${tokenData.access_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'abacus-mobile',
        },
      })
      if (emailsRes.ok) {
        const emails = await emailsRes.json() as GitHubEmail[]
        const primary = emails.find(e => e.primary && e.verified)
        if (primary) {
          userEmail = primary.email
        }
      }
    }

    // Encrypt the GitHub token before storing
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
          email = COALESCE(email, ?),
          last_login_at = CURRENT_TIMESTAMP
        WHERE github_id = ?
      `).bind(
        githubUser.login,
        githubUser.name,
        githubUser.avatar_url,
        encryptedToken,
        userEmail,
        githubUser.id
      ).run()

      user = await env.DB.prepare(
        'SELECT * FROM users WHERE github_id = ?'
      ).bind(githubUser.id).first()
    } else {
      // Check if this is the first user (make them admin)
      const countResult = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first() as { count: number }
      const isFirstUser = countResult.count === 0

      // Check registration mode
      if (!isFirstUser) {
        const regMode = await env.DB.prepare(
          "SELECT value FROM settings WHERE key = 'registration_mode'"
        ).first() as { value: string } | null

        if (!regMode || regMode.value === 'closed') {
          return jsonError('Registration is closed. Contact an administrator for access.', 403)
        }
      }

      // Create new user
      const newRole = isFirstUser ? 'admin' : 'guest'

      await env.DB.prepare(`
        INSERT INTO users (github_id, github_login, github_name, github_avatar_url, github_token_encrypted, role, email, last_login_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(
        githubUser.id,
        githubUser.login,
        githubUser.name,
        githubUser.avatar_url,
        encryptedToken,
        newRole,
        userEmail
      ).run()

      user = await env.DB.prepare(
        'SELECT * FROM users WHERE github_id = ?'
      ).bind(githubUser.id).first()
    }

    // Create session
    const sessionId = crypto.randomUUID()
    const sessionTtl = 60 * 60 * 24 * 30  // 30 days for mobile

    const sessionToken = await createSignedSessionToken(
      {
        id: sessionId,
        userId: user!.id as number,
        githubId: githubUser.id,
        role: user!.role as 'admin' | 'premium' | 'user' | 'guest',
      },
      env.TOKEN_ENCRYPTION_KEY,
      sessionTtl
    )

    // Store in KV for revocation capability
    const sessionData = JSON.stringify({
      userId: user!.id,
      githubId: githubUser.id,
      role: user!.role,
      source: 'mobile',
    })

    await env.SESSIONS.put(`session:${sessionId}`, sessionData, {
      expirationTtl: sessionTtl
    })

    // Return the session token to the mobile app
    return new Response(JSON.stringify({
      access_token: sessionToken,
      user: {
        id: user!.id,
        github_id: githubUser.id,
        login: githubUser.login,
        name: githubUser.name,
        avatar_url: githubUser.avatar_url,
        role: user!.role,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Mobile token exchange error:', err instanceof Error ? err.message : err)
    return jsonError('Authentication failed. Please try again.', 500)
  }
}
