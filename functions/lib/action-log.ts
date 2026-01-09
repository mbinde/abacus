// Action logging for debugging user operations
// Enable with ENABLE_ACTION_LOG=true environment variable

// Sensitive fields to redact from logged payloads
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'api_key',
  'apiKey',
  'auth',
  'authorization',
  'bearer',
  'credit_card',
  'creditCard',
  'ssn',
  'social_security',
  'socialSecurity',
]

// Redact sensitive fields from an object (deep)
function redactSensitiveFields(obj: unknown, depth = 0): unknown {
  // Prevent infinite recursion
  if (depth > 10) return '[MAX_DEPTH]'

  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveFields(item, depth + 1))
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase()
    // Check if this key is sensitive
    if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
      result[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSensitiveFields(value, depth + 1)
    } else {
      result[key] = value
    }
  }
  return result
}

// Truncate long string fields to prevent DB bloat
function truncateLongFields(obj: unknown, maxLength = 1000): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'string') {
    return obj.length > maxLength ? obj.slice(0, maxLength) + '...[TRUNCATED]' : obj
  }
  if (typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return obj.map(item => truncateLongFields(item, maxLength))
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = truncateLongFields(value, maxLength)
  }
  return result
}

// Sanitize payload for logging (redact sensitive data, truncate long strings)
function sanitizePayload(payload: unknown): unknown {
  if (payload === null || payload === undefined) return null
  const redacted = redactSensitiveFields(payload)
  return truncateLongFields(redacted)
}

export interface ActionLogEntry {
  userId?: number
  userLogin?: string
  action: 'update_issue' | 'add_comment' | 'delete_issue' | 'bulk_update' | 'create_issue' | 'admin_role_change' | 'admin_user_delete'
  repoOwner?: string
  repoName?: string
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
    // Sanitize the payload to redact sensitive data and truncate long fields
    const sanitizedPayload = entry.requestPayload
      ? JSON.stringify(sanitizePayload(entry.requestPayload))
      : null

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
      entry.repoOwner ?? null,
      entry.repoName ?? null,
      entry.issueId ?? null,
      sanitizedPayload,
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
