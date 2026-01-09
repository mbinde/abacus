// /api/admin/repo-views - Get repo view statistics (admin only)

import type { UserContext } from '../_middleware'

interface Env {
  DB: D1Database
}

interface RepoViewStats {
  repo_owner: string
  repo_name: string
  view_count: number
  last_viewed_at: string | null
  created_at: string
}

// GET /api/admin/repo-views - Get all repo view stats
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = (data as { user: UserContext }).user

  // Check admin permission
  if (user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const result = await env.DB.prepare(`
      SELECT repo_owner, repo_name, view_count, last_viewed_at, created_at
      FROM repo_views
      ORDER BY view_count DESC
    `).all()

    const stats = result.results as RepoViewStats[]
    const totalViews = stats.reduce((sum, s) => sum + s.view_count, 0)

    return new Response(JSON.stringify({ stats, totalViews }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error fetching repo views:', err)
    return new Response(JSON.stringify({ error: 'Failed to fetch repo views' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
