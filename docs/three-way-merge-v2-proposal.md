# Proposal: Robust Three-Way Merge Conflict Detection v2

## Executive Summary

The current implementation has significant gaps that undermine its effectiveness. This proposal addresses the critical issues while keeping the scope manageable.

---

## Current State

We implemented three-way merge conflict detection for Abacus to address the dual-writer problem (Abacus web UI vs beads CLI both writing to `.beads/issues.jsonl`). The implementation:

- Captures "base state" when user starts editing
- Performs field-level three-way merge on save
- Auto-merges non-conflicting changes
- Shows conflict resolution UI for true conflicts

**Files created/modified:**
- `src/lib/merge.ts` - Shared types (currently unused)
- `src/components/ConflictResolver.tsx` - Conflict resolution UI
- `functions/api/repos/[owner]/[repo]/issues/[id].ts` - Backend merge logic
- `src/App.tsx` - Frontend state management and handlers

---

## Problems to Fix

### Critical (Must Fix)

| # | Problem | Impact |
|---|---------|--------|
| 1 | **Stale base state** - captured from React state, not fresh fetch | False conflict detection, missed real conflicts |
| 2 | **Base state lost on refresh** - stored only in React state | Falls back to silent last-write-wins |
| 3 | **Auto-merge is invisible** - only logged to console | Users confused by unexpected field values |
| 4 | **"Force My Version" is one click from data loss** | Accidental obliteration of others' work |
| 5 | **Cancel behavior unclear** - what state does the form return to? | User confusion, potential data loss |

### Important (Should Fix)

| # | Problem | Impact |
|---|---------|--------|
| 6 | **No tests for merge logic** | Bugs in critical algorithmic code |
| 7 | **Type duplication across 4 files** | Maintenance burden, drift risk |
| 8 | **No "who changed it" info** | User confusion |

### Nice to Have (Could Fix Later)

| # | Problem | Impact |
|---|---------|--------|
| 9 | No preview of merged result | Hard to visualize outcome |
| 10 | No "refresh and start over" option | Clunky recovery flow |

---

## Proposed Solutions

### 1. Fresh Fetch on Edit Start

**Problem**: Base state captured from potentially stale React state. User loads issues at 10am, goes to lunch, clicks Edit at 2pm - base state is 4 hours stale.

**Solution**: When user navigates to edit view, fetch the issue fresh from GitHub API before capturing base state.

```typescript
// In App.tsx - new function
async function startEdit(issue: Issue) {
  setDataLoading(true)
  try {
    // Fetch fresh state from server
    const res = await fetch(`/api/repos/${selectedRepo.owner}/${selectedRepo.name}/issues/${issue.id}`)
    const freshIssue = await res.json()

    setEditBaseState({
      issue: freshIssue,
      fetchedAt: new Date().toISOString()
    })

    setSelectedIssue(freshIssue)  // Update form with fresh data too
    navigate('edit', freshIssue)
  } finally {
    setDataLoading(false)
  }
}
```

**Trade-off**: Adds latency before edit form appears. Show loading state.

**Files**: `src/App.tsx`, may need new GET endpoint for single issue

---

### 2. Persist Base State in sessionStorage

**Problem**: Page refresh loses base state, falling back to dangerous last-write-wins.

**Solution**: Store base state in sessionStorage, keyed by issue ID.

```typescript
// On setting base state
useEffect(() => {
  if (editBaseState && selectedIssue) {
    sessionStorage.setItem(
      `abacus:baseState:${selectedIssue.id}`,
      JSON.stringify(editBaseState)
    )
  }
}, [editBaseState, selectedIssue])

// On mount / entering edit mode
useEffect(() => {
  if (view === 'edit' && selectedIssue && !editBaseState) {
    const saved = sessionStorage.getItem(`abacus:baseState:${selectedIssue.id}`)
    if (saved) {
      setEditBaseState(JSON.parse(saved))
    }
  }
}, [view, selectedIssue])

// Clean up on successful save or cancel
sessionStorage.removeItem(`abacus:baseState:${issueId}`)
```

**Files**: `src/App.tsx`

---

### 3. Show Auto-Merge Notification

**Problem**: Auto-merged fields are invisible to user. They save, it succeeds, and suddenly the issue has values they didn't set.

**Solution**: Add a notification banner when auto-merge happens.

```typescript
const [notification, setNotification] = useState<string | null>(null)

// On auto-merge success in handleSaveIssue
if (data.mergeResult?.status === 'auto_merged') {
  const fields = data.mergeResult.autoMergedFields
    .map(f => FIELD_LABELS[f])
    .join(', ')
  setNotification(
    `Note: ${fields} were updated by someone else and automatically merged into your save.`
  )
  setTimeout(() => setNotification(null), 8000)
}

// In render, near error display
{notification && (
  <div style={{
    background: '#1e3a5f',
    border: '1px solid #3b82f6',
    padding: '0.75rem',
    borderRadius: '4px',
    marginBottom: '1rem'
  }}>
    {notification}
  </div>
)}
```

**Files**: `src/App.tsx`

---

### 4. Guard "Force My Version" with Confirmation

**Problem**: One click from data loss. User might not understand the consequences.

**Solution**: Require explicit confirmation with clear warning.

```typescript
async function handleForceLocalChanges() {
  const confirmed = window.confirm(
    'WARNING: This will OVERWRITE all changes made by others.\n\n' +
    'Their work will be lost. This cannot be undone.\n\n' +
    'Are you sure you want to force your version?'
  )
  if (!confirmed) return

  // ... existing logic
}
```

**Alternative considered**: Remove the button entirely. Decided against - sometimes users legitimately need this escape hatch.

**Files**: `src/App.tsx`

---

### 5. Clarify Cancel Behavior

**Problem**: Cancel button behavior is ambiguous. User doesn't know what happens to their changes.

**Solution**:
1. Rename button to "Back to Editing"
2. Add helper text explaining behavior
3. Ensure form state is preserved

```typescript
// In ConflictResolver.tsx
<p style={{ fontSize: '0.85rem', color: '#888', marginTop: '1rem' }}>
  "Back to Editing" returns you to the form with your changes preserved.
  You can modify them and try saving again.
</p>

<button onClick={onCancel} style={{ background: '#444' }}>
  Back to Editing
</button>
```

**Files**: `src/components/ConflictResolver.tsx`

---

### 6. Add Unit Tests for Merge Logic

**Problem**: Complex algorithmic code with zero test coverage.

**Solution**: Extract merge logic to shared module and add comprehensive tests.

```typescript
// New file: src/lib/three-way-merge.ts
export const EDITABLE_FIELDS = ['title', 'description', 'status', 'priority', 'issue_type', 'assignee']

export function isEqual(a: unknown, b: unknown): boolean { ... }
export function performThreeWayMerge(base, local, remote): MergeResult { ... }

// New file: src/lib/three-way-merge.test.ts
describe('performThreeWayMerge', () => {
  it('falls back to last-write-wins when no base state')
  it('applies local changes when remote unchanged')
  it('auto-merges remote changes when local unchanged')
  it('detects conflict when both changed same field differently')
  it('no conflict when both changed to same value')
  it('handles mixed fields correctly')
  it('treats empty string and undefined as equal')
})

describe('isEqual', () => {
  it('treats undefined and empty string as equal')
  it('compares objects by JSON serialization')
  it('handles null values')
})
```

**Files**:
- New `src/lib/three-way-merge.ts`
- New `src/lib/three-way-merge.test.ts`
- Update `functions/api/.../[id].ts` to import from shared module

---

### 7. Consolidate Type Definitions

**Problem**: Same types defined in 4 places - `src/lib/merge.ts`, `src/App.tsx`, `functions/api/.../[id].ts`, `src/components/ConflictResolver.tsx`.

**Solution**: Single source of truth in `src/lib/merge.ts`, import everywhere.

```typescript
// src/lib/merge.ts (update existing file)
export type EditableField = 'title' | 'description' | 'status' | 'priority' | 'issue_type' | 'assignee'

export interface FieldConflict {
  field: EditableField
  baseValue: unknown
  localValue: unknown
  remoteValue: unknown
  remoteUpdatedAt: string
}

export interface MergeResult {
  status: 'success' | 'auto_merged' | 'conflict'
  mergedIssue?: Record<string, unknown>
  autoMergedFields?: EditableField[]
  conflicts?: FieldConflict[]
  remoteIssue?: Record<string, unknown>
}

export interface BaseState {
  issue: Record<string, unknown>
  fetchedAt: string
}

export interface ConflictState {
  mergeResult: MergeResult
  localUpdates: Record<string, unknown>
}

export const FIELD_LABELS: Record<EditableField, string> = {
  title: 'Title',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  issue_type: 'Type',
  assignee: 'Assignee'
}
```

**Files**: `src/lib/merge.ts`, `src/App.tsx`, `src/components/ConflictResolver.tsx`, `functions/api/.../[id].ts`

---

### 8. Improve Timestamp Display

**Problem**: User doesn't know when the conflicting change was made. Timestamp is buried in small text.

**Solution**: Make timestamp more prominent with relative time format.

```typescript
// In ConflictResolver.tsx
function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

// In the remote option card
<div style={{ fontSize: '0.85rem', color: '#f59e0b', fontWeight: 500 }}>
  Changed {formatRelativeTime(conflict.remoteUpdatedAt)}
</div>
```

**Files**: `src/components/ConflictResolver.tsx`

---

## Implementation Order

| Phase | Items | Effort | Risk Reduction |
|-------|-------|--------|----------------|
| **Phase 1** | #2 (sessionStorage), #4 (confirm dialog), #5 (cancel clarity) | Small | High - prevents data loss |
| **Phase 2** | #1 (fresh fetch), #3 (auto-merge notification) | Medium | High - fixes false detections |
| **Phase 3** | #6 (tests), #7 (type consolidation) | Medium | Medium - code quality |
| **Phase 4** | #8 (timestamp), #9-10 (nice to have) | Small | Low - UX polish |

**Recommended approach**: Do Phase 1 first - it's low effort and eliminates the worst failure modes.

---

## What This Does NOT Fix

### 1. Abacus ↔ Beads CLI Fundamental Mismatch

Abacus and beads use different conflict resolution mechanisms at different times:
- **Abacus**: Resolves at HTTP write time via three-way merge
- **Beads CLI**: Resolves at `git merge` time via its merge driver

They never coordinate. When a developer does `git pull` after Abacus writes, beads' merge driver runs and may make different decisions than Abacus made.

**True solutions would require:**
- Beads webhook/notification when files change
- Abacus simulating beads' merge driver logic
- Shared backend service both tools use
- Real-time collaboration (WebSocket sync)

These are significant architectural changes beyond the current scope.

### 2. Race Conditions in Rapid Concurrent Edits

If User A and B both have the edit form open and both click Save within milliseconds, the GitHub API will reject one write (SHA mismatch), that client will retry with fresh data, and the retry will likely succeed - potentially overwriting the other's just-saved changes before the three-way merge can detect it.

This is a limitation of optimistic locking in general.

---

## Open Questions

1. **Fresh fetch latency**: Is it acceptable to add ~200-500ms latency when clicking Edit? Alternative: fetch in background while showing form with stale data, then update if different.

2. **sessionStorage key cleanup**: Should we clean up old base state entries? They could accumulate if user abandons edits. Could add timestamp and clean up entries older than 24h on app load.

3. **Notification duration**: 8 seconds for auto-merge notification - is that enough time to read? Should it be dismissible?

4. **Mobile UX**: The conflict resolver grid layout may not work well on narrow screens. Need to test and possibly add responsive breakpoints.

---

## Success Criteria

After implementation:

1. ✅ User can refresh page mid-edit without losing conflict detection capability
2. ✅ User sees notification when fields are auto-merged
3. ✅ User must confirm before force-overwriting others' changes
4. ✅ Cancel/back behavior is clear and predictable
5. ✅ Base state is always fresh (within seconds of clicking Edit)
6. ✅ Merge logic has test coverage
7. ✅ Types are defined in one place
