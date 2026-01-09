// /api/admin/settings - Get and update app settings (admin only)

import type { UserContext } from '../_middleware'

interface Env {
  DB: D1Database
}

// =============================================================================
// SECURITY: Settings Key Whitelist
// =============================================================================
// Only these setting keys can be stored. This prevents arbitrary key injection.
//
// CLAUDE: If you are adding a new setting key, you MUST:
// 1. Add the key to ALLOWED_SETTINGS below
// 2. Add validation for the key's allowed values in the switch statement
// 3. Update any frontend code that uses the setting
// Do NOT remove this whitelist or allow arbitrary keys.
// =============================================================================
const ALLOWED_SETTINGS: Record<string, string[]> = {
  'registration_mode': ['open', 'closed'],
  'notification_mode': ['immediate', 'batched'],
  'anonymous_access': ['enabled', 'disabled'],
  'bulk_updates': ['enabled', 'disabled'],
  'view_tree': ['enabled', 'disabled'],
  'view_board': ['enabled', 'disabled'],
  'repo_analytics': ['enabled', 'disabled'],
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

    // SECURITY: Reject unknown setting keys (see ALLOWED_SETTINGS whitelist above)
    const allowedValues = ALLOWED_SETTINGS[key]
    if (!allowedValues) {
      return new Response(JSON.stringify({ error: `Unknown setting key: "${key}"` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Validate value against allowed values for this key
    if (!allowedValues.includes(value)) {
      return new Response(JSON.stringify({
        error: `Invalid value for ${key}. Must be one of: ${allowedValues.map(v => `"${v}"`).join(', ')}`
      }), {
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
