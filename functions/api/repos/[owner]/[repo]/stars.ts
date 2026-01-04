// /api/repos/:owner/:repo/stars - Manage starred issues

import type { UserContext } from '../../../_middleware'

interface Env {
  DB: D1Database
}

// GET /api/repos/:owner/:repo/stars - Get all starred issue IDs for this repo
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params, data } = context
  const user = (data as { user: UserContext }).user
  const owner = params.owner as string
  const repo = params.repo as string

  try {
    const result = await env.DB.prepare(
      'SELECT issue_id FROM stars WHERE user_id = ? AND repo_owner = ? AND repo_name = ?'
    ).bind(user.id, owner, repo).all()

    const starredIds = (result.results as Array<{ issue_id: string }>).map(r => r.issue_id)

    return new Response(JSON.stringify({ starred: starredIds }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error fetching stars:', err)
    return new Response(JSON.stringify({ error: 'Failed to fetch stars' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// POST /api/repos/:owner/:repo/stars - Star an issue
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params, data } = context
  const user = (data as { user: UserContext }).user
  const owner = params.owner as string
  const repo = params.repo as string

  try {
    const { issue_id } = await request.json() as { issue_id: string }

    if (!issue_id) {
      return new Response(JSON.stringify({ error: 'issue_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await env.DB.prepare(
      'INSERT OR IGNORE INTO stars (user_id, repo_owner, repo_name, issue_id) VALUES (?, ?, ?, ?)'
    ).bind(user.id, owner, repo, issue_id).run()

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error starring issue:', err)
    return new Response(JSON.stringify({ error: 'Failed to star issue' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// DELETE /api/repos/:owner/:repo/stars - Unstar an issue
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params, data } = context
  const user = (data as { user: UserContext }).user
  const owner = params.owner as string
  const repo = params.repo as string

  try {
    const { issue_id } = await request.json() as { issue_id: string }

    if (!issue_id) {
      return new Response(JSON.stringify({ error: 'issue_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await env.DB.prepare(
      'DELETE FROM stars WHERE user_id = ? AND repo_owner = ? AND repo_name = ? AND issue_id = ?'
    ).bind(user.id, owner, repo, issue_id).run()

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error unstarring issue:', err)
    return new Response(JSON.stringify({ error: 'Failed to unstar issue' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
