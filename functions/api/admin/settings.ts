// /api/admin/settings - Get and update app settings (admin only)

import type { UserContext } from '../_middleware'

interface Env {
  DB: D1Database
}

// GET /api/admin/settings - Get all settings
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
    const result = await env.DB.prepare('SELECT key, value FROM settings').all()

    // Convert to object
    const settings: Record<string, string> = {}
    for (const row of result.results as Array<{ key: string; value: string }>) {
      settings[row.key] = row.value
    }

    return new Response(JSON.stringify({ settings }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error fetching settings:', err)
    return new Response(JSON.stringify({ error: 'Failed to fetch settings' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// PUT /api/admin/settings - Update a setting
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, data } = context
  const user = (data as { user: UserContext }).user

  // Check admin permission
  if (user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { key, value } = await request.json() as { key: string; value: string }

    if (!key || value === undefined) {
      return new Response(JSON.stringify({ error: 'key and value are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Validate known settings
    if (key === 'registration_mode' && !['open', 'closed'].includes(value)) {
      return new Response(JSON.stringify({ error: 'registration_mode must be "open" or "closed"' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (key === 'notification_mode' && !['immediate', 'batched'].includes(value)) {
      return new Response(JSON.stringify({ error: 'notification_mode must be "immediate" or "batched"' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (key === 'anonymous_access' && !['enabled', 'disabled'].includes(value)) {
      return new Response(JSON.stringify({ error: 'anonymous_access must be "enabled" or "disabled"' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Upsert the setting
    await env.DB.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `).bind(key, value, value).run()

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error updating setting:', err)
    return new Response(JSON.stringify({ error: 'Failed to update setting' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
