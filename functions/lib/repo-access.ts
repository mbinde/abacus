// Repository access validation helper
// Ensures users can only access repos they have explicitly added to their account

import type { UserContext, AnonymousContext } from '../api/_middleware'

interface Env {
  DB: D1Database
}

// Check if user is anonymous
export function isAnonymous(user: UserContext | AnonymousContext): user is AnonymousContext {
  return 'anonymous' in user && user.anonymous === true
}

// Check if an authenticated user has access to a repo
// Returns true if user has explicitly added this repo to their account
export async function hasRepoAccess(
  db: D1Database,
  userId: number,
  owner: string,
  name: string
): Promise<boolean> {
  const result = await db.prepare(`
    SELECT 1 FROM user_repos ur
    JOIN repos r ON ur.repo_id = r.id
    WHERE ur.user_id = ? AND r.owner = ? AND r.name = ?
  `).bind(userId, owner, name).first()

  return result !== null
}

// Validate repo access and return appropriate error response if denied
// Returns null if access is allowed, or a Response object if denied
export async function validateRepoAccess(
  env: Env,
  user: UserContext | AnonymousContext,
  owner: string,
  name: string,
  requireAuth: boolean = true
): Promise<Response | null> {
  // Anonymous users: only allowed for public demo repo (handled by middleware)
  if (isAnonymous(user)) {
    if (requireAuth) {
      return new Response(JSON.stringify({ error: 'Login required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // For read-only anonymous access, allow it (middleware already checks demo repo)
    return null
  }

  // Authenticated users: verify they have explicitly added this repo
  const hasAccess = await hasRepoAccess(env.DB, user.id, owner, name)
  if (!hasAccess) {
    return new Response(JSON.stringify({ error: 'Repository not found or not added to your account' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return null
}
