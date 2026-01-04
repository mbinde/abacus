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

  try {
    // Verify the repo belongs to this user before deleting
    const existing = await env.DB.prepare(
      'SELECT id FROM repos WHERE id = ? AND user_id = ?'
    ).bind(repoId, user.id).first()

    if (!existing) {
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await env.DB.prepare('DELETE FROM repos WHERE id = ? AND user_id = ?')
      .bind(repoId, user.id)
      .run()

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to remove repository' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
