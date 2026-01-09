// /api/settings - Get public app settings (no auth required)

interface Env {
  DB: D1Database
}

// Public settings that can be read without authentication
const PUBLIC_SETTINGS = ['bulk_updates', 'view_tree', 'view_board']

// GET /api/settings - Get public settings
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context

  try {
    const result = await env.DB.prepare(
      `SELECT key, value FROM settings WHERE key IN (${PUBLIC_SETTINGS.map(() => '?').join(', ')})`
    ).bind(...PUBLIC_SETTINGS).all()

    // Convert to object with defaults
    const settings: Record<string, string> = {
      bulk_updates: 'enabled',
      view_tree: 'disabled',
      view_board: 'enabled',
    }

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
