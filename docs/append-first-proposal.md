# Proposal: Append-First Architecture for Abacus

## Executive Summary

Instead of trying to make full conflict resolution seamless for all operations, we should **design around the conflict problem** by:

1. Making safe operations (create issue, add comment) the primary UX
2. Making low-stakes edits (status, priority, assignee) frictionless with silent auto-resolution
3. Gating high-stakes edits (title, description) behind explicit warnings

This approach accepts that perfect coordination with beads CLI is impossible and instead minimizes the blast radius of conflicts.

---

## The Core Insight

Not all operations are equally risky:

| Risk Level | Operations | Conflict Impact |
|------------|------------|-----------------|
| **None** | Create issue, add comment | Append-only, no conflicts possible |
| **Low** | Change status, priority, assignee, dependencies | Wrong value is obvious, easy to fix |
| **High** | Edit title, edit description | Data loss, prose gone forever |

Current Abacus treats all edits the same. This proposal separates them.

---

## Conflict Resolution Rule

**One simple rule for everything: Latest `updated_at` timestamp wins.**

No field-specific strategies. No "closed wins" or "higher priority wins" logic. Just: whoever saved last, wins.

Why this is correct:
- Matches user intent (if I reopen an issue, my reopen should win)
- Predictable and explainable
- Aligns with beads' default behavior for most fields
- Simple to implement and test

```typescript
function resolveConflict(local: unknown, remote: unknown, localTime: string, remoteTime: string): unknown {
  return isAfter(localTime, remoteTime) ? local : remote
}
```

---

## Proposed UX Model

### Tier 1: Safe Zone (No Friction)

**Create Issue** and **Add Comment** - these are append-only operations. No conflict possible.

Current UX is fine. No changes needed.

### Tier 2: Quick Actions (Inline, Auto-Resolve)

**Status**, **Priority**, **Assignee**, **Dependencies** - these become inline controls on the issue detail view, not part of a form.

```
┌─────────────────────────────────────────────────────────────┐
│  ISSUE-ABC: Fix the login bug                               │
│                                                             │
│  Status: [In Progress ▾]   Priority: [P2 ▾]                │
│  Assignee: [@alice ▾]      Type: [Bug ▾]                   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  Description                                    [Edit ✎]   │
│  The login form throws an error when...                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Behavior:**
1. User clicks dropdown, selects new value
2. Optimistic update - UI changes immediately
3. Save to server in background
4. On conflict: auto-resolve (latest timestamp wins), show subtle toast

```typescript
// On conflict for quick action
if (response.status === 409) {
  const resolved = resolveByTimestamp(localValue, remoteValue, localTime, remoteTime)

  if (resolved === localValue) {
    // Our change won, retry save
    await saveWithForce(field, localValue)
    showToast(`Saved (synced with concurrent change)`)
  } else {
    // Remote won, update UI to show remote value
    updateField(field, remoteValue)
    showToast(`${fieldLabel} was just changed to "${remoteValue}" by someone else`)
  }
}
```

**Why this works:**
- Worst case: user sees "Status was just changed to 'Closed' by someone else"
- They can immediately click the dropdown and change it back if needed
- No data loss, just minor confusion

### Tier 3: Danger Zone (Text Edits with Inline Warning)

**Edit Title** and **Edit Description** - these are high-risk. Warning appears inline when user starts typing.

**Key insight:** Instead of a blocking dialog before editing, show an inline warning pane **when the user starts typing** in a text field. This is less friction but still surfaces the warning when it matters.

**Flow:**
1. User opens edit form - no dialog, no warning yet
2. User changes status/priority/type/assignee - no warning (quick actions, low risk)
3. User starts typing in Title or Description - **warning pane appears**
4. Warning pane is collapsible but **expanded by default**
5. On save, backup is created if checkbox is checked (default: ON)

**Warning pane (appears below "Linked PRs & Commits", above Cancel/Save):**

```
┌─────────────────────────────────────────────────────────────┐
│  ▼ Text Edit Warning                                        │
│  ───────────────────────────────────────────────────────────│
│  Beads uses "last write wins" for text fields - if someone  │
│  else (human or AI) edits this at the same time, your       │
│  changes may be silently overwritten. Recovery requires     │
│  digging through git history.                               │
│                                                             │
│  ☑️  Save a copy of my changes as a comment                 │
│      (Easier recovery if overwritten)                       │
│                                                             │
│  Last modified: 3 hours ago                                 │
└─────────────────────────────────────────────────────────────┘

                                        [Cancel]  [Save]
```

**Why this wording:**
- "Beads uses last write wins" - explains the mechanism, not just the risk
- "silently overwritten" - makes clear there's no merge conflict marker
- "Recovery requires digging through git history" - acknowledges git-savvy users but explains the pain
- Git users will understand this isn't a normal merge conflict situation

**Why inline pane is better than blocking dialog:**

| Aspect | Blocking Dialog | Inline Pane |
|--------|-----------------|-------------|
| Friction to start editing | High (must dismiss) | None |
| Warning visibility | Seen once, forgotten | Persistent during editing |
| Checkbox visibility | Only in dialog | Visible when saving |
| Quick actions | Still hit dialog | No warning (not needed) |

**Backup checkbox:**
- Defaults to ON (checked)
- On save: creates a comment containing **the user's new text** (not the old value)
- Only creates backup if title or description actually changed
- User can uncheck to skip backup (lives dangerously)
- Checkbox state persists in localStorage for convenience

**Why backup the new text, not the old:**
- The old text isn't what gets lost - it's the user's new work
- If Bob (beads CLI) overwrites Alice's edit, Alice needs to recover **her new text**
- Saving the old value doesn't help with that

**Recency indicator (in warning pane):**
- "Last modified: just now" → RED text, very risky
- "Last modified: 5 minutes ago" → YELLOW text, somewhat risky
- "Last modified: 3 hours ago" → Normal text, probably safe

**On save:**
- Backup comment is created FIRST, before conflict detection
- Then three-way merge runs
- If conflict detected → ConflictResolver UI shows, but backup already exists
- If no conflict → save proceeds normally
- This ensures backup exists regardless of conflict resolution outcome

---

## Auto-Backup Comment Format

When a user edits a text field with the backup option enabled, Abacus automatically creates a comment containing **their new text** (not the old value). This protects the user's work if someone else overwrites it.

**Design goals:**

1. Preserve the user's new work in an append-only location (comments can't be overwritten)
2. Be clearly marked as machine-generated backup
3. Signal to AI agents that this is recovery data, not issue context
4. Be collapsible in the UI to reduce noise

**Format:**

```
── backup: my edit to description ─────────────────────
Saved by alice@example.com in case of conflict
2024-01-15 14:30 UTC

Detailed steps for fixing login bug:
1. Check if password > 72 chars
2. Truncate or show error
───────────────────────────────────────────────────────
```

**Why this format works:**

| Element | Purpose |
|---------|---------|
| `backup: my edit to` | Signals this is the user's new content, saved for recovery |
| `in case of conflict` | Explains why it exists |
| Horizontal rules | Visually isolates the content |
| Attribution + timestamp | Audit trail, searchable |

**AI-agent compatibility:**

The phrase "backup" and "in case of conflict" signals to AI agents:
- This is **recovery data**, not current issue requirements
- The current description field is the source of truth
- This comment exists for **disaster recovery**, not context

Human comments remain fully valid context. Only backup comments use this format.

**UI treatment:**

Backup comments should be **collapsed by default** in the Abacus UI:
- Show: `[Backup comment from alice@example.com - click to expand]`
- Click to reveal full content
- Keeps comment stream clean while preserving recoverability
- Multiple consecutive backups from same user are grouped: `[3 backup comments from alice - click to expand]`

**When backup is created:**
- On save (after user clicks Save, BEFORE conflict detection or writing to issue)
- Only if the field value actually changed
- One backup comment per changed text field (if both title and description change, two backup comments)
- Comment is created first, then issue is saved (so backup exists even if save fails or conflict is detected)

**Reducing backup noise:**

If user edits the same field multiple times in quick succession, we could accumulate many backup comments. Mitigations:

1. **Group consecutive backups in UI** - Show as single expandable group (implemented in UI treatment above)
2. **Accept the noise** - Backups are collapsed anyway, and frequent editing is rare
3. **Future consideration**: Could dedupe backups for same field within short time window, but adds complexity

For v1, we accept that each save creates a backup (if enabled) and rely on collapsed UI to manage noise.

---

## Implementation Plan

### Phase 1: Quick Actions Extraction

**Goal:** Move status/priority/assignee/type out of the edit form into inline dropdowns.

**Files to modify:**
- `src/App.tsx` - Add inline update handlers
- `src/components/IssueDetail.tsx` (or equivalent) - Add dropdown controls
- `functions/api/repos/[owner]/[repo]/issues/[id].ts` - Add single-field PATCH support

**New endpoint behavior:**
```typescript
// PATCH /api/repos/:owner/:repo/issues/:id
// Body: { field: "status", value: "closed", updated_at: "2024-..." }
//
// On conflict: return 409 with { remoteValue, remoteUpdatedAt }
// Client auto-resolves by timestamp
```

**Estimated scope:** Medium - new UI components, new endpoint behavior

### Phase 2: Inline Text Edit Warning with Backup Option

**Goal:** Show inline warning pane when user edits title/description, with optional backup comment that saves the user's new work.

**Files to modify:**
- `src/App.tsx` - Add text change detection, warning pane state, backup preference
- `src/components/TextEditWarningPane.tsx` (new) - Collapsible warning pane component

**Behavior:**
1. User opens edit form - no warning shown yet
2. Track whether title or description fields have been modified (compare to original values)
3. When user first modifies a text field → show warning pane (expanded by default)
4. Warning pane appears below "Linked PRs & Commits", above Cancel/Save buttons
5. Pane is collapsible - user can collapse to minimize distraction
6. Backup checkbox state persists in localStorage for convenience

**Warning pane contents:**
- Collapsible header: "▼ Text Edit Warning"
- Warning text: "Beads uses 'last write wins' for text fields - if someone else (human or AI) edits this at the same time, your changes may be silently overwritten. Recovery requires digging through git history."
- Backup checkbox (default: checked): "Save a copy of my changes as a comment (Easier recovery if overwritten)"
- Recency indicator: "Last modified: 3 hours ago" with color coding

**On save (if backup enabled):**
1. Check if title or description actually changed from original
2. For each changed text field, create a backup comment containing **the user's new text**:
   ```
   ── backup: my edit to {field} ─────────────────────
   Saved by {user email} in case of conflict
   {timestamp} UTC

   {user's new value}
   ───────────────────────────────────────────────────
   ```
3. **IMPORTANT:** Create backup comment FIRST, before conflict detection
4. Then run three-way merge / conflict detection
5. If conflict → show ConflictResolver (backup already exists)
6. If no conflict → save the issue

**Key details:**
- No blocking dialog - warning appears inline only when needed
- Warning is persistent during editing (not dismissed and forgotten)
- Backup contains the NEW text (what the user is saving), not the old text
- Backup is created before conflict detection so it exists regardless of outcome

**Estimated scope:** Medium - warning pane component + text change detection + backup comment creation logic

### Phase 2b: Collapsed Backup Comments in UI

**Goal:** Reduce noise from backup comments by collapsing them by default.

**Files to modify:**
- `src/components/CommentList.tsx` (or equivalent) - Detect and collapse backup comments

**Behavior:**
1. When rendering comments, detect backup comments by prefix `── backup:`
2. Group consecutive backup comments from same user
3. Show collapsed:
   - Single: `[Backup comment from alice@example.com - click to expand]`
   - Multiple: `[3 backup comments from alice@example.com - click to expand]`
4. Click expands to show full content (all backups in group if multiple)
5. Non-backup comments render normally

**Estimated scope:** Small-Medium - conditional rendering + grouping logic in comment list

### Phase 3: Recency Indicator

**Goal:** Show how recently the issue was modified, with color-coded risk.

**Files to modify:**
- `src/App.tsx` or detail component - Add recency display
- Possibly fetch fresh `updated_at` when viewing issue

**Risk levels:**
```typescript
function getRecencyRisk(updatedAt: string): 'high' | 'medium' | 'low' {
  const minutesAgo = (Date.now() - new Date(updatedAt).getTime()) / 60000
  if (minutesAgo < 5) return 'high'    // Red - very recent
  if (minutesAgo < 30) return 'medium' // Yellow - somewhat recent
  return 'low'                          // Normal - probably safe
}
```

**Estimated scope:** Small

### Phase 4: Simplify Conflict Resolution

**Goal:** Remove complex field-specific logic, use "latest timestamp wins" everywhere.

**Files to modify:**
- `functions/api/repos/[owner]/[repo]/issues/[id].ts` - Simplify merge logic

**Remove:**
- Field-specific merge strategies
- Three-way merge complexity for quick actions (just compare timestamps)

**Keep:**
- Three-way merge for text fields (to detect conflicts)
- ConflictResolver UI (for the rare text edit conflicts)

**Estimated scope:** Small - simplification, not new code

---

## What This Removes

### Full Edit Form for Quick Changes

The current "Edit Issue" form that lets you change everything at once goes away (or becomes secondary). Instead:
- Quick actions are inline
- Text edits have their own flow

### Complex Merge Strategies

No more "closed wins" or "higher priority wins". Just timestamps.

### Silent Auto-Merge

For quick actions, we still auto-resolve, but we always show a toast. User is never surprised.

---

## Migration Path

1. **Keep existing edit form** initially, just add the warning
2. **Add inline dropdowns** as an alternative way to change quick fields
3. **Deprecate full edit form** once inline actions are proven
4. **Simplify backend** once frontend is fully migrated

---

## Success Criteria

1. User can change status/priority/assignee without entering edit mode
2. User sees toast when their quick action conflicts with a concurrent change
3. Inline warning pane appears when user starts editing title/description (not before)
4. Warning pane is persistent during editing, not a dismissable dialog
5. Backup comments containing **user's new text** are created by default when text fields are edited
6. Backup comment format signals "recovery data, not context" for AI agents
7. Backup comments are collapsed by default in the UI to reduce noise
8. When someone else overwrites, user's work is recoverable from their backup comment
9. All conflict resolution uses "latest timestamp wins" consistently

---

## Open Questions

1. **Inline dropdown styling:** How to make dropdowns feel native to the detail view without looking like a form?

2. **Mobile UX:** Inline dropdowns may be awkward on mobile. Consider a different pattern (action sheet?).

3. **Bulk operations:** If user wants to change status on 10 issues, inline dropdowns are tedious. Consider bulk actions separately.

4. **Keyboard navigation:** Current edit form is keyboard-friendly. Inline dropdowns should be too.

---

## Comparison: Current vs Proposed

| Aspect | Current | Proposed |
|--------|---------|----------|
| Change status | Open edit form → change dropdown → save | Click status dropdown → select → done |
| Change description | Open edit form → edit text → save | Edit form → start typing → inline warning appears → save |
| Warning UX | N/A | Inline pane (persistent, not blocking dialog) |
| Conflict on status | Full ConflictResolver UI | Toast: "Status changed by someone else" |
| Conflict on description | Full ConflictResolver UI | Full ConflictResolver UI (same, but rare) |
| Data loss recovery | None - lost forever | Backup comment preserves **user's new text** |
| Comment noise | N/A | Backup comments collapsed by default |
| User confusion | High (many code paths) | Low (predictable per-tier behavior) |
| Data loss risk | High (all edits treated same) | Low (warned + recoverable via backup) |
| AI agent compatibility | N/A | Backup comments designed to not confuse AI |

---

## Limitations and Tradeoffs

This proposal is honest about what it does and doesn't solve:

### What This DOES Solve

| Problem | Solution |
|---------|----------|
| Quick action conflicts (status, priority, etc.) | Auto-resolve with toast notification |
| Text edit data loss | Recoverable via backup comment |
| User confusion about conflict behavior | Clear tiered model with explicit warnings |
| AI agents confused by backup comments | Format designed to signal "recovery data, not context" |

### What This Does NOT Solve

| Problem | Why Not | Mitigation |
|---------|---------|------------|
| **Preventing conflicts** | Can't coordinate with beads CLI | Warnings reduce frequency |
| **Automatic recovery** | Would require detecting overwrites | Manual copy-paste is acceptable for rare events |
| **Notification when overwritten** | Abacus doesn't know when beads CLI writes | User must notice themselves |
| **Beads CLI user protection** | Can't modify beads | Only Abacus users get backup |

### Recovery is Manual (And That's OK)

When a user's edit is overwritten, recovery requires:
1. Notice the description changed unexpectedly
2. Find the backup comment (search for "backup: my edit")
3. Expand the collapsed comment
4. Copy the text
5. Edit the description again
6. Paste

This is intentionally manual because:
- Overwrites should be rare (warnings + "add comment instead" guidance)
- Automatic recovery would require complex overwrite detection
- Manual recovery is good enough for rare events
- Adding complexity for rare cases isn't worth it

### Future Improvements (Not in Scope)

If overwrites become frequent, we could consider:
- **"Restore from backup" button** - One-click recovery from backup comment
- **Overwrite notification** - Email/alert when your recent edit is replaced
- **Optimistic locking** - "Check out" an issue for editing

These are not in v1 scope. We'll see if they're needed based on real usage.

---

## Appendix: Why Not Real-Time Sync?

Real-time collaboration (like Google Docs) would eliminate conflicts entirely. But it requires:
- WebSocket infrastructure
- Operational transforms or CRDTs
- Significant complexity
- Doesn't help with beads CLI users (they're offline)

The append-first model is a pragmatic middle ground that works within current constraints.
