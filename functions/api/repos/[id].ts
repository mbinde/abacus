// /api/repos/[id] - Delete a repository

import type { UserContext } from '../_middleware'

interface Env {
  DB: D1Database
}

// DELETE /api/repos/:id - Remove a repo from user's list
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, params, data } = context
  const user = (data as { user: UserContext }).user
  const repoId = params.id as string

  // Guest users cannot remove repos
  if (user.role === 'guest') {
    return new Response(JSON.stringify({ error: 'Guest users cannot remove repositories.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Verify the user has this repo linked
    const existing = await env.DB.prepare(
      'SELECT id FROM user_repos WHERE repo_id = ? AND user_id = ?'
    ).bind(repoId, user.id).first()

    if (!existing) {
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Remove the user-repo link (not the repo itself, as other users may have it)
    await env.DB.prepare('DELETE FROM user_repos WHERE repo_id = ? AND user_id = ?')
      .bind(repoId, user.id)
      .run()

    // Optionally: clean up orphaned repos (no users linked)
    // For now, leave them - they keep webhook secrets intact

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to remove repository' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
