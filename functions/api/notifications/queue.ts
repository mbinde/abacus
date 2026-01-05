// Notification queue with exponential backoff batching
//
// Since Cloudflare cron minimum is 1 minute, we use minute-based backoff:
// Backoff schedule: 1min -> 2min -> 4min -> 5min (max)
// Once we hit 5 minutes, keep batching every 5 minutes until no new notifications
// Then reset to 1 minute for the next batch

const INITIAL_BACKOFF_SECONDS = 60 // 1 minute (Cloudflare cron minimum)
const MAX_BACKOFF_SECONDS = 300 // 5 minutes
const BACKOFF_MULTIPLIER = 2

interface QueuedNotification {
  userId: number
  repoOwner: string
  repoName: string
  issueId: string
  issueTitle: string
  changeType: 'created' | 'updated' | 'closed'
  changeDetails?: string
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

interface BackoffState {
  user_id: number
  next_send_at: string
  backoff_seconds: number
  last_notification_at: string | null
}

// Queue a notification and update the user's backoff state
export async function queueNotification(
  db: D1Database,
  notification: QueuedNotification
): Promise<void> {
  const now = new Date()

  // Insert or update the pending notification
  // Uses UNIQUE constraint to avoid duplicates for same issue/change combo
  await db.prepare(`
    INSERT INTO pending_notifications
      (user_id, repo_owner, repo_name, issue_id, issue_title, change_type, change_details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, repo_owner, repo_name, issue_id, change_type)
    DO UPDATE SET
      issue_title = excluded.issue_title,
      change_details = excluded.change_details,
      created_at = datetime('now')
  `).bind(
    notification.userId,
    notification.repoOwner,
    notification.repoName,
    notification.issueId,
    notification.issueTitle,
    notification.changeType,
    notification.changeDetails || null
  ).run()

  // Get or create backoff state for this user
  const existingBackoff = await db.prepare(`
    SELECT next_send_at, backoff_seconds, last_notification_at
    FROM notification_backoff
    WHERE user_id = ?
  `).bind(notification.userId).first() as BackoffState | null

  if (!existingBackoff) {
    // First notification for this user - schedule send in INITIAL_BACKOFF_SECONDS
    const nextSendAt = new Date(now.getTime() + INITIAL_BACKOFF_SECONDS * 1000)
    await db.prepare(`
      INSERT INTO notification_backoff (user_id, next_send_at, backoff_seconds, last_notification_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(
      notification.userId,
      nextSendAt.toISOString(),
      INITIAL_BACKOFF_SECONDS,
      now.toISOString()
    ).run()
  } else {
    // User already has pending notifications
    const nextSendTime = new Date(existingBackoff.next_send_at)

    if (now >= nextSendTime) {
      // The scheduled send time has passed but notifications haven't been sent yet
      // This means we're adding more notifications after the timer expired
      // Schedule a new send with the same backoff (don't reset yet)
      const newNextSendAt = new Date(now.getTime() + existingBackoff.backoff_seconds * 1000)
      await db.prepare(`
        UPDATE notification_backoff
        SET next_send_at = ?, last_notification_at = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).bind(
        newNextSendAt.toISOString(),
        now.toISOString(),
        notification.userId
      ).run()
    } else {
      // Still waiting for the scheduled send time
      // Increase the backoff for next time (exponential backoff)
      const newBackoff = Math.min(existingBackoff.backoff_seconds * BACKOFF_MULTIPLIER, MAX_BACKOFF_SECONDS)
      const newNextSendAt = new Date(now.getTime() + newBackoff * 1000)

      await db.prepare(`
        UPDATE notification_backoff
        SET next_send_at = ?, backoff_seconds = ?, last_notification_at = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).bind(
        newNextSendAt.toISOString(),
        newBackoff,
        now.toISOString(),
        notification.userId
      ).run()
    }
  }
}

// Get users who are ready to receive their batched notifications
export async function getUsersReadyToNotify(db: D1Database): Promise<number[]> {
  const now = new Date().toISOString()

  const result = await db.prepare(`
    SELECT DISTINCT nb.user_id
    FROM notification_backoff nb
    JOIN pending_notifications pn ON pn.user_id = nb.user_id
    WHERE nb.next_send_at <= ?
  `).bind(now).all() as { results: Array<{ user_id: number }> }

  return result.results.map(r => r.user_id)
}

// Get pending notifications for a user
export async function getPendingNotifications(
  db: D1Database,
  userId: number
): Promise<PendingNotification[]> {
  const result = await db.prepare(`
    SELECT * FROM pending_notifications
    WHERE user_id = ?
    ORDER BY created_at ASC
  `).bind(userId).all() as { results: PendingNotification[] }

  return result.results
}

// Clear pending notifications and reset backoff for a user
export async function clearUserNotifications(
  db: D1Database,
  userId: number
): Promise<void> {
  // Delete all pending notifications
  await db.prepare(`
    DELETE FROM pending_notifications WHERE user_id = ?
  `).bind(userId).run()

  // Reset backoff state (will start fresh with 10s next time)
  await db.prepare(`
    DELETE FROM notification_backoff WHERE user_id = ?
  `).bind(userId).run()
}

// Get user's email for sending
export async function getUserEmail(
  db: D1Database,
  userId: number
): Promise<string | null> {
  const result = await db.prepare(`
    SELECT email FROM users WHERE id = ? AND email IS NOT NULL
  `).bind(userId).first() as { email: string } | null

  return result?.email || null
}
