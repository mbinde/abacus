// Action logging for debugging user operations
// Enable with ENABLE_ACTION_LOG=true environment variable

export interface ActionLogEntry {
  userId?: number
  userLogin?: string
  action: 'update_issue' | 'add_comment' | 'delete_issue' | 'bulk_update' | 'create_issue'
  repoOwner: string
  repoName: string
  issueId?: string
  requestPayload?: unknown
  success: boolean
  errorMessage?: string
  retryCount?: number
  conflictDetected?: boolean
  durationMs?: number
  requestId?: string
}

export async function logAction(
  db: D1Database | null,
  entry: ActionLogEntry
): Promise<void> {
  if (!db) return

  try {
    await db.prepare(`
      INSERT INTO action_log (
        user_id, user_login, action, repo_owner, repo_name, issue_id,
        request_payload, success, error_message, retry_count, conflict_detected,
        duration_ms, request_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      entry.userId ?? null,
      entry.userLogin ?? null,
      entry.action,
      entry.repoOwner,
      entry.repoName,
      entry.issueId ?? null,
      entry.requestPayload ? JSON.stringify(entry.requestPayload) : null,
      entry.success ? 1 : 0,
      entry.errorMessage ?? null,
      entry.retryCount ?? 0,
      entry.conflictDetected ? 1 : 0,
      entry.durationMs ?? null,
      entry.requestId ?? null
    ).run()
  } catch (err) {
    // Don't let logging failures break the main operation
    console.error('[action-log] Failed to log action:', err)
  }
}

// Helper to create a timer for duration tracking
export function startTimer(): () => number {
  const start = Date.now()
  return () => Date.now() - start
}

// Generate a simple request ID for correlation
export function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
