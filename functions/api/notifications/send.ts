// Send batched notifications
// This endpoint should be called by a cron trigger every 10 seconds

import {
  getUsersReadyToNotify,
  getPendingNotifications,
  clearUserNotifications,
  getUserEmail,
} from './queue'

interface Env {
  DB: D1Database
  RESEND_API_KEY: string
}

interface PendingNotification {
  id: number
  user_id: number
  repo_owner: string
  repo_name: string
  issue_id: string
  issue_title: string
  change_type: string
  change_details: string | null
  created_at: string
}

// Send email via Resend
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  apiKey: string
): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Abacus <notifications@motleywoods.dev>',
        to: [to],
        subject,
        html,
      }),
    })
    if (!res.ok) {
      const errorText = await res.text()
      console.error('[notifications] Resend API error:', res.status, errorText)
    }
    return res.ok
  } catch (err) {
    console.error('[notifications] sendEmail exception:', err)
    return false
  }
}

// Format a batched email with multiple notifications
function formatBatchedEmail(notifications: PendingNotification[]): { subject: string; html: string } {
  const statusEmoji = {
    open: '🟢',
    in_progress: '🔵',
    closed: '⚫',
  }

  const changeEmoji = {
    created: '✨',
    updated: '📝',
    closed: '✅',
  }

  // Group by repo
  const byRepo = new Map<string, PendingNotification[]>()
  for (const n of notifications) {
    const key = `${n.repo_owner}/${n.repo_name}`
    if (!byRepo.has(key)) {
      byRepo.set(key, [])
    }
    byRepo.get(key)!.push(n)
  }

  // Build subject
  const totalCount = notifications.length
  const repos = Array.from(byRepo.keys())
  let subject: string
  if (repos.length === 1) {
    subject = `[${repos[0]}] ${totalCount} issue update${totalCount > 1 ? 's' : ''}`
  } else {
    subject = `${totalCount} issue update${totalCount > 1 ? 's' : ''} across ${repos.length} repos`
  }

  // Build HTML
  let html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333; border-bottom: 1px solid #ddd; padding-bottom: 8px;">
        ${totalCount} Issue Update${totalCount > 1 ? 's' : ''}
      </h2>
  `

  for (const [repoName, repoNotifications] of byRepo) {
    html += `
      <h3 style="color: #666; margin-top: 24px; margin-bottom: 12px;">
        📁 ${repoName}
      </h3>
    `

    for (const n of repoNotifications) {
      const emoji = changeEmoji[n.change_type as keyof typeof changeEmoji] || '📋'
      const changeLabel = {
        created: 'Created',
        updated: 'Updated',
        closed: 'Closed',
      }[n.change_type] || n.change_type

      let details = ''
      if (n.change_details) {
        try {
          const d = JSON.parse(n.change_details)
          if (d.oldStatus !== d.newStatus) {
            const oldEmoji = statusEmoji[d.oldStatus as keyof typeof statusEmoji] || ''
            const newEmoji = statusEmoji[d.newStatus as keyof typeof statusEmoji] || ''
            details = `${oldEmoji} ${d.oldStatus} → ${newEmoji} ${d.newStatus}`
          }
          if (d.oldAssignee !== d.newAssignee) {
            if (details) details += ' · '
            details += `@${d.oldAssignee || 'unassigned'} → @${d.newAssignee || 'unassigned'}`
          }
        } catch {
          // Ignore parse errors
        }
      }

      html += `
        <div style="padding: 12px; margin-bottom: 8px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid ${n.change_type === 'created' ? '#4ade80' : n.change_type === 'closed' ? '#666' : '#64b4ff'};">
          <div style="font-weight: 600; color: #333;">
            ${emoji} ${n.issue_title}
          </div>
          <div style="font-size: 12px; color: #888; margin-top: 4px;">
            <code>${n.issue_id}</code> · ${changeLabel}${details ? ` · ${details}` : ''}
          </div>
        </div>
      `
    }
  }

  html += `
      <p style="color: #999; font-size: 12px; margin-top: 24px; border-top: 1px solid #ddd; padding-top: 12px;">
        You received this because you have email notifications enabled in Abacus.
        This email batches multiple updates to reduce inbox noise.
      </p>
    </div>
  `

  return { subject, html }
}

// Process and send all pending batched notifications
export async function processPendingNotifications(env: Env): Promise<{ sent: number; failed: number }> {
  if (!env.RESEND_API_KEY) {
    console.log('[notifications] No RESEND_API_KEY configured, skipping')
    return { sent: 0, failed: 0 }
  }

  const usersReady = await getUsersReadyToNotify(env.DB)
  console.log('[notifications] Users ready to notify:', usersReady.length)

  let sent = 0
  let failed = 0

  for (const userId of usersReady) {
    const email = await getUserEmail(env.DB, userId)
    if (!email) {
      console.log('[notifications] User', userId, 'has no email, clearing notifications')
      await clearUserNotifications(env.DB, userId)
      continue
    }

    const notifications = await getPendingNotifications(env.DB, userId)
    if (notifications.length === 0) {
      await clearUserNotifications(env.DB, userId)
      continue
    }

    console.log('[notifications] Sending batched email to user', userId, 'with', notifications.length, 'notifications')

    const { subject, html } = formatBatchedEmail(notifications)
    const success = await sendEmail(email, subject, html, env.RESEND_API_KEY)

    if (success) {
      sent++
      await clearUserNotifications(env.DB, userId)
    } else {
      failed++
      // Don't clear on failure - will retry on next run
    }
  }

  return { sent, failed }
}

// HTTP endpoint to trigger notification processing (for cron or manual trigger)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context

  // Optional: Add authentication for this endpoint
  // For now, we'll allow it but you might want to add a secret header check
  const authHeader = request.headers.get('Authorization')
  const expectedSecret = env.RESEND_API_KEY?.slice(0, 16) // Use part of API key as simple auth

  if (authHeader !== `Bearer ${expectedSecret}`) {
    // Allow internal calls without auth (for cron triggers)
    const isInternal = request.headers.get('CF-Worker') !== null
    if (!isInternal && authHeader) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const result = await processPendingNotifications(env)

  return new Response(JSON.stringify({
    success: true,
    sent: result.sent,
    failed: result.failed,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
