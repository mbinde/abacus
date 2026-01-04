// Unified Hono application - portable across platforms
// This is the core API that can run on Cloudflare, Node.js, Deno, Bun, etc.

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Database } from './interfaces/database'
import type { SessionStore, SessionData, SESSION_TTL, RATE_LIMIT_WINDOW, RATE_LIMIT_MAX } from './interfaces/session-store'
import type { CryptoProvider } from './interfaces/crypto'

// Environment configuration
export interface AppConfig {
  githubClientId: string
  githubClientSecret: string
  tokenEncryptionKey: string
  resendApiKey?: string
  baseUrl: string
}

// Context type for handlers
export interface AppContext {
  db: Database
  sessions: SessionStore
  crypto: CryptoProvider
  config: AppConfig
}

// User context attached after authentication
export interface UserContext {
  id: number
  githubId: number
  login: string
  role: 'admin' | 'premium' | 'user'
  githubToken: string
}

type Variables = {
  ctx: AppContext
  user?: UserContext
}

export function createApp(context: AppContext) {
  const app = new Hono<{ Variables: Variables }>()

  // Attach context to all requests
  app.use('*', async (c, next) => {
    c.set('ctx', context)
    await next()
  })

  // CORS for API routes
  app.use('/api/*', cors())

  // Public endpoints (no auth required)
  const publicPaths = ['/api/auth/check', '/api/auth/github', '/api/auth/callback', '/api/auth/logout', '/api/webhooks/github']

  // Rate-limited endpoints
  const rateLimitedPaths = ['/api/auth/github', '/api/auth/callback']

  // Authentication middleware
  app.use('/api/*', async (c, next) => {
    const path = c.req.path
    const ctx = c.get('ctx')

    // Skip auth for public endpoints
    if (publicPaths.includes(path)) {
      // Apply rate limiting if needed
      if (rateLimitedPaths.includes(path)) {
        const ip = c.req.header('x-forwarded-for')?.split(',')[0] || 'unknown'
        const result = await ctx.sessions.checkRateLimit(`oauth:${ip}`, 10, 60)

        if (!result.allowed) {
          return c.json({ error: 'Too many requests' }, 429)
        }
      }
      return next()
    }

    // Require authentication
    const sessionToken = getCookie(c, 'session')
    if (!sessionToken) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const session = await ctx.sessions.getSession(sessionToken)
    if (!session) {
      deleteCookie(c, 'session')
      return c.json({ error: 'Session expired' }, 401)
    }

    // Load user from database
    const user = await ctx.db.getUserById(session.userId)
    if (!user) {
      await ctx.sessions.deleteSession(sessionToken)
      deleteCookie(c, 'session')
      return c.json({ error: 'User not found' }, 401)
    }

    // Decrypt GitHub token
    const githubToken = await ctx.crypto.decrypt(user.github_token_encrypted, ctx.config.tokenEncryptionKey)

    c.set('user', {
      id: user.id,
      githubId: user.github_id,
      login: user.github_login,
      role: user.role,
      githubToken,
    })

    return next()
  })

  // Admin middleware helper
  const requireAdmin = async (c: any, next: () => Promise<void>) => {
    const user = c.get('user')
    if (user?.role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403)
    }
    return next()
  }

  // ============ AUTH ROUTES ============

  // Check auth status
  app.get('/api/auth/check', async (c) => {
    const ctx = c.get('ctx')
    const sessionToken = getCookie(c, 'session')

    if (!sessionToken) {
      return c.json({ authenticated: false })
    }

    const session = await ctx.sessions.getSession(sessionToken)
    if (!session) {
      return c.json({ authenticated: false })
    }

    const user = await ctx.db.getUserById(session.userId)
    if (!user) {
      return c.json({ authenticated: false })
    }

    return c.json({
      authenticated: true,
      user: {
        id: user.id,
        login: user.github_login,
        name: user.github_name,
        avatarUrl: user.github_avatar_url,
        role: user.role,
      },
    })
  })

  // Initiate GitHub OAuth
  app.get('/api/auth/github', async (c) => {
    const ctx = c.get('ctx')
    const state = ctx.crypto.generateToken()

    setCookie(c, 'oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 600, // 10 minutes
      path: '/',
    })

    const params = new URLSearchParams({
      client_id: ctx.config.githubClientId,
      redirect_uri: `${ctx.config.baseUrl}/api/auth/callback`,
      scope: 'repo read:user user:email',
      state,
    })

    return c.redirect(`https://github.com/login/oauth/authorize?${params}`)
  })

  // GitHub OAuth callback
  app.get('/api/auth/callback', async (c) => {
    const ctx = c.get('ctx')
    const { code, state } = c.req.query()
    const storedState = getCookie(c, 'oauth_state')

    deleteCookie(c, 'oauth_state')

    if (!state || state !== storedState) {
      return c.redirect('/?error=Invalid+OAuth+state')
    }

    if (!code) {
      return c.redirect('/?error=No+authorization+code')
    }

    try {
      // Exchange code for token
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: ctx.config.githubClientId,
          client_secret: ctx.config.githubClientSecret,
          code,
        }),
      })

      const tokenData = await tokenRes.json() as { access_token?: string; error?: string }
      if (!tokenData.access_token) {
        return c.redirect('/?error=Failed+to+get+access+token')
      }

      // Get user info
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${tokenData.access_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'abacus',
        },
      })

      const githubUser = await userRes.json() as {
        id: number
        login: string
        name: string | null
        avatar_url: string
        email: string | null
      }

      // Check registration mode
      const userCount = await ctx.db.getUserCount()
      const registrationMode = await ctx.db.getSetting('registration_mode')

      const existingUser = await ctx.db.getUserByGithubId(githubUser.id)

      if (!existingUser && registrationMode === 'closed' && userCount > 0) {
        return c.redirect('/?error=Registration+is+closed')
      }

      // Encrypt token
      const encryptedToken = await ctx.crypto.encrypt(tokenData.access_token, ctx.config.tokenEncryptionKey)

      let user
      if (existingUser) {
        // Update existing user
        await ctx.db.updateUser(githubUser.id, {
          github_login: githubUser.login,
          github_name: githubUser.name,
          github_avatar_url: githubUser.avatar_url,
          github_token_encrypted: encryptedToken,
          email: githubUser.email,
        })
        user = await ctx.db.getUserByGithubId(githubUser.id)
      } else {
        // Create new user (first user becomes admin)
        const role = userCount === 0 ? 'admin' : 'user'
        user = await ctx.db.createUser({
          github_id: githubUser.id,
          github_login: githubUser.login,
          github_name: githubUser.name,
          github_avatar_url: githubUser.avatar_url,
          github_token_encrypted: encryptedToken,
          role,
          email: githubUser.email,
          email_notifications: 0,
        })

        // Set registration to closed after first user
        if (userCount === 0) {
          await ctx.db.upsertSetting('registration_mode', 'closed')
        }
      }

      // Create session
      const sessionToken = ctx.crypto.generateToken()
      const sessionData: SessionData = {
        userId: user!.id,
        githubId: user!.github_id,
        role: user!.role,
      }

      await ctx.sessions.createSession(sessionToken, sessionData, 7 * 24 * 60 * 60)
      await ctx.sessions.addUserSession(user!.id, sessionToken, 7 * 24 * 60 * 60)

      setCookie(c, 'session', sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
      })

      return c.redirect('/')
    } catch (error) {
      console.error('OAuth error:', error)
      return c.redirect('/?error=Authentication+failed')
    }
  })

  // Logout
  app.post('/api/auth/logout', async (c) => {
    const ctx = c.get('ctx')
    const sessionToken = getCookie(c, 'session')

    if (sessionToken) {
      await ctx.sessions.deleteSession(sessionToken)
    }

    deleteCookie(c, 'session')
    return c.json({ success: true })
  })

  // ============ USER ROUTES ============

  app.get('/api/user/profile', async (c) => {
    const user = c.get('user')!
    const ctx = c.get('ctx')

    const dbUser = await ctx.db.getUserById(user.id)
    if (!dbUser) {
      return c.json({ error: 'User not found' }, 404)
    }

    return c.json({
      profile: {
        email: dbUser.email,
        email_notifications: dbUser.email_notifications === 1,
      },
    })
  })

  app.put('/api/user/profile', async (c) => {
    const user = c.get('user')!
    const ctx = c.get('ctx')
    const { email, email_notifications } = await c.req.json()

    await ctx.db.updateUserProfile(user.id, email, email_notifications)
    return c.json({ success: true })
  })

  // ============ REPO ROUTES ============

  app.get('/api/repos', async (c) => {
    const user = c.get('user')!
    const ctx = c.get('ctx')

    const repos = await ctx.db.getUserRepos(user.id)
    return c.json({ repos })
  })

  app.post('/api/repos', async (c) => {
    const user = c.get('user')!
    const ctx = c.get('ctx')
    const { owner, name } = await c.req.json()

    if (!owner || !name) {
      return c.json({ error: 'owner and name are required' }, 400)
    }

    // Verify repo exists on GitHub
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
      headers: {
        'Authorization': `token ${user.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'abacus',
      },
    })

    if (!repoRes.ok) {
      return c.json({ error: 'Repository not found or not accessible' }, 404)
    }

    // Check for .beads directory
    const beadsRes = await fetch(`https://api.github.com/repos/${owner}/${name}/contents/.beads`, {
      headers: {
        'Authorization': `token ${user.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'abacus',
      },
    })

    if (!beadsRes.ok) {
      return c.json({ error: 'Repository does not have a .beads directory' }, 400)
    }

    // Get or create repo
    let repo = await ctx.db.getRepoByOwnerName(owner, name)
    if (!repo) {
      const webhookSecret = ctx.crypto.generateWebhookSecret()
      repo = await ctx.db.createRepo(owner, name, webhookSecret)
    }

    // Check if user already has this repo
    const existing = await ctx.db.getUserRepoLink(user.id, repo.id)
    if (existing) {
      return c.json({ error: 'Repository already added' }, 409)
    }

    // Link user to repo
    await ctx.db.createUserRepoLink(user.id, repo.id)

    return c.json({ repo }, 201)
  })

  app.delete('/api/repos/:id', async (c) => {
    const user = c.get('user')!
    const ctx = c.get('ctx')
    const repoId = parseInt(c.req.param('id'))

    const link = await ctx.db.getUserRepoLink(user.id, repoId)
    if (!link) {
      return c.json({ error: 'Repository not found' }, 404)
    }

    await ctx.db.deleteUserRepoLink(user.id, repoId)
    return c.json({ success: true })
  })

  // ============ STAR ROUTES ============

  app.get('/api/repos/:owner/:repo/stars', async (c) => {
    const user = c.get('user')!
    const ctx = c.get('ctx')
    const { owner, repo } = c.req.param()

    const starred = await ctx.db.getStarredIssueIds(user.id, owner, repo)
    return c.json({ starred })
  })

  app.post('/api/repos/:owner/:repo/stars', async (c) => {
    const user = c.get('user')!
    const ctx = c.get('ctx')
    const { owner, repo } = c.req.param()
    const { issue_id } = await c.req.json()

    await ctx.db.createStar(user.id, owner, repo, issue_id)
    return c.json({ success: true })
  })

  app.delete('/api/repos/:owner/:repo/stars', async (c) => {
    const user = c.get('user')!
    const ctx = c.get('ctx')
    const { owner, repo } = c.req.param()
    const { issue_id } = await c.req.json()

    await ctx.db.deleteStar(user.id, owner, repo, issue_id)
    return c.json({ success: true })
  })

  // ============ ADMIN ROUTES ============

  app.get('/api/admin/users', requireAdmin, async (c) => {
    const ctx = c.get('ctx')
    const users = await ctx.db.listUsers()
    return c.json({ users })
  })

  app.put('/api/admin/users/:id', requireAdmin, async (c) => {
    const user = c.get('user')!
    const ctx = c.get('ctx')
    const targetId = parseInt(c.req.param('id'))
    const { role } = await c.req.json()

    if (targetId === user.id) {
      return c.json({ error: 'Cannot modify your own role' }, 400)
    }

    await ctx.db.updateUserRole(targetId, role)
    return c.json({ success: true })
  })

  app.delete('/api/admin/users/:id', requireAdmin, async (c) => {
    const user = c.get('user')!
    const ctx = c.get('ctx')
    const targetId = parseInt(c.req.param('id'))

    if (targetId === user.id) {
      return c.json({ error: 'Cannot delete yourself' }, 400)
    }

    // Invalidate all sessions for this user
    await ctx.sessions.deleteAllUserSessions(targetId)
    await ctx.db.deleteUser(targetId)

    return c.json({ success: true })
  })

  app.get('/api/admin/settings', requireAdmin, async (c) => {
    const ctx = c.get('ctx')
    const settings = await ctx.db.getAllSettings()
    return c.json({ settings })
  })

  app.put('/api/admin/settings', requireAdmin, async (c) => {
    const ctx = c.get('ctx')
    const { key, value } = await c.req.json()

    await ctx.db.upsertSetting(key, value)
    return c.json({ success: true })
  })

  return app
}
