// Three-way merge types for conflict detection

export type EditableField = 'title' | 'description' | 'status' | 'priority' | 'issue_type' | 'assignee'

export const EDITABLE_FIELDS: EditableField[] = [
  'title', 'description', 'status', 'priority', 'issue_type', 'assignee'
]

// Represents a single field conflict
export interface FieldConflict {
  field: EditableField
  baseValue: unknown       // Value when editing started
  localValue: unknown      // User's intended value
  remoteValue: unknown     // Current server value
  remoteUpdatedAt: string  // Remote's updated_at timestamp
}

// Result of three-way merge attempt
export interface MergeResult {
  status: 'success' | 'auto_merged' | 'conflict'

  // For 'success': no concurrent edits detected
  // For 'auto_merged': some fields auto-merged from remote
  mergedIssue?: Record<string, unknown>
  autoMergedFields?: EditableField[]

  // For 'conflict': true conflicts exist
  conflicts?: FieldConflict[]

  // Always present on conflict/auto_merge
  remoteIssue?: Record<string, unknown>
}

// Request payload for update with base state
export interface UpdateIssueRequest {
  // The updated values user wants to save
  updates: Record<string, unknown>

  // Base state snapshot (when user started editing)
  // If absent, fall back to current overwrite behavior
  baseState?: {
    issue: Record<string, unknown>
    fetchedAt: string
  }
}

// Extended response for conflict scenarios
export interface UpdateIssueResponse {
  success: boolean
  error?: string

  // Merge result details
  mergeResult?: MergeResult

  // Standard retry info
  retryCount?: number
  conflictDetected?: boolean
}
