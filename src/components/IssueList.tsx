import { useState, useEffect, useRef, useCallback } from 'react'

interface Issue {
  id: string
  title: string
  description?: string
  status: 'open' | 'closed' | 'in_progress'
  priority: number
  issue_type: 'bug' | 'feature' | 'task' | 'epic'
  created_at: string
  updated_at?: string
  closed_at?: string
  parent?: string
}

interface BulkUpdate {
  status?: 'open' | 'closed' | 'in_progress'
  priority?: number
}

interface Props {
  issues: Issue[]
  starredIds: Set<string>
  onEdit: (issue: Issue) => void
  onDelete: (id: string) => void
  onToggleStar: (issueId: string, starred: boolean) => void
  onBulkUpdate?: (issueIds: string[], updates: BulkUpdate) => Promise<void>
}

type StatusFilter = 'all' | 'open' | 'in_progress' | 'closed' | 'starred' | 'tree'
type SortKey = 'starred' | 'id' | 'title' | 'type' | 'status' | 'priority' | 'updated'
type SortDir = 'asc' | 'desc'

export default function IssueList({ issues, starredIds, onEdit, onDelete, onToggleStar, onBulkUpdate }: Props) {
  const [filter, setFilter] = useState<StatusFilter>(() => {
    const saved = localStorage.getItem('abacus:statusFilter')
    return (saved as StatusFilter) || 'open'
  })
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [showHelp, setShowHelp] = useState(false)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const tableRef = useRef<HTMLTableSectionElement>(null)

  const handleFilterChange = (newFilter: StatusFilter) => {
    setFilter(newFilter)
    localStorage.setItem('abacus:statusFilter', newFilter)
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  if (issues.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', color: '#888' }}>
        No issues found. Create one to get started!
      </div>
    )
  }

  // Count issues by status
  const counts = {
    all: issues.length,
    open: issues.filter(i => i.status === 'open').length,
    in_progress: issues.filter(i => i.status === 'in_progress').length,
    closed: issues.filter(i => i.status === 'closed').length,
    starred: issues.filter(i => starredIds.has(i.id)).length,
    tree: issues.filter(i => i.issue_type === 'epic' || i.parent).length,
  }

  // Filter issues by status
  let filtered: Issue[]
  if (filter === 'all') {
    filtered = issues
  } else if (filter === 'starred') {
    filtered = issues.filter(i => starredIds.has(i.id))
  } else if (filter === 'tree') {
    // Show epics and issues with parents, organized as a tree
    filtered = issues
  } else {
    filtered = issues.filter(i => i.status === filter)
  }

  // Filter by search query
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase()
    filtered = filtered.filter(i =>
      i.id.toLowerCase().includes(query) ||
      i.title.toLowerCase().includes(query) ||
      (i.description?.toLowerCase().includes(query))
    )
  }

  // Sort issues
  let sorted: Issue[]
  if (filter === 'tree') {
    // Tree view: organize by parent-child relationships
    sorted = buildTreeOrder(filtered)
  } else {
    sorted = [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'starred':
          const aStarred = starredIds.has(a.id) ? 1 : 0
          const bStarred = starredIds.has(b.id) ? 1 : 0
          cmp = aStarred - bStarred
          break
        case 'id':
          cmp = a.id.localeCompare(b.id)
          break
        case 'title':
          cmp = a.title.localeCompare(b.title)
          break
        case 'type':
          cmp = a.issue_type.localeCompare(b.issue_type)
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
        case 'priority':
          cmp = a.priority - b.priority
          break
        case 'updated':
          const aDate = a.updated_at || a.created_at
          const bDate = b.updated_at || b.created_at
          cmp = aDate.localeCompare(bDate)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }

  // Build depth map for tree view indentation
  const depthMap = new Map<string, number>()
  if (filter === 'tree') {
    const issueMap = new Map(issues.map(i => [i.id, i]))
    for (const issue of sorted) {
      let depth = 0
      let current = issue
      while (current.parent && issueMap.has(current.parent)) {
        depth++
        current = issueMap.get(current.parent)!
      }
      depthMap.set(issue.id, depth)
    }
  }

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      if (e.key === 'Escape') {
        (e.target as HTMLElement).blur()
        setSelectedIndex(0)
      }
      return
    }

    switch (e.key) {
      case 'j': // Move down
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, sorted.length - 1))
        break
      case 'k': // Move up
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'e': // Edit selected
      case 'Enter':
        if (selectedIndex >= 0 && selectedIndex < sorted.length) {
          e.preventDefault()
          onEdit(sorted[selectedIndex])
        }
        break
      case 's': // Star/unstar selected
        if (selectedIndex >= 0 && selectedIndex < sorted.length) {
          e.preventDefault()
          const issue = sorted[selectedIndex]
          onToggleStar(issue.id, !starredIds.has(issue.id))
        }
        break
      case 'x': // Toggle checkbox on selected
        if (selectedIndex >= 0 && selectedIndex < sorted.length) {
          e.preventDefault()
          toggleCheck(sorted[selectedIndex].id)
        }
        break
      case '/': // Focus search
        e.preventDefault()
        searchInputRef.current?.focus()
        break
      case '?': // Show help
        e.preventDefault()
        setShowHelp(prev => !prev)
        break
      case 'Escape':
        setShowHelp(false)
        setSelectedIndex(-1)
        break
    }
  }, [sorted, selectedIndex, onEdit, onToggleStar, starredIds])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Scroll selected row into view
  useEffect(() => {
    if (selectedIndex >= 0 && tableRef.current) {
      const row = tableRef.current.children[selectedIndex] as HTMLElement
      row?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // Reset selection when list changes
  useEffect(() => {
    setSelectedIndex(-1)
  }, [filter, searchQuery])

  // Clear checked items when issues change
  useEffect(() => {
    setCheckedIds(new Set())
  }, [issues])

  const toggleCheck = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleAllChecked = () => {
    if (checkedIds.size === sorted.length) {
      setCheckedIds(new Set())
    } else {
      setCheckedIds(new Set(sorted.map(i => i.id)))
    }
  }

  const handleBulkAction = async (updates: BulkUpdate) => {
    if (!onBulkUpdate || checkedIds.size === 0) return
    setBulkLoading(true)
    try {
      await onBulkUpdate(Array.from(checkedIds), updates)
      setCheckedIds(new Set())
    } finally {
      setBulkLoading(false)
    }
  }

  const filterButtons: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'starred', label: '★ Starred' },
    { key: 'open', label: 'Open' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'closed', label: 'Closed' },
    { key: 'tree', label: '🌳 Tree' },
  ]

  const SortHeader = ({ column, label }: { column: SortKey; label: string }) => (
    <th
      onClick={() => handleSort(column)}
      style={{ cursor: 'pointer', userSelect: 'none' }}
    >
      {label} {sortKey === column && (sortDir === 'asc' ? '▲' : '▼')}
    </th>
  )

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {filterButtons.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleFilterChange(key)}
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: '0.875rem',
              background: filter === key ? '#0077cc' : '#2a2a3a',
              color: filter === key ? 'white' : '#aaa',
            }}
          >
            {label} ({counts[key]})
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search issues... (press /)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: '0.875rem',
              width: '200px',
              background: '#1a1a24',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#e0e0e0',
            }}
          />
          <button
            onClick={() => setShowHelp(true)}
            style={{
              padding: '0.375rem 0.5rem',
              fontSize: '0.875rem',
              background: '#2a2a3a',
              color: '#888',
            }}
            title="Keyboard shortcuts"
          >
            ?
          </button>
        </div>
      </div>
      {checkedIds.size > 0 && onBulkUpdate && (
        <BulkActionsBar
          count={checkedIds.size}
          loading={bulkLoading}
          onClose={() => handleBulkAction({ status: 'closed' })}
          onSetStatus={(status) => handleBulkAction({ status })}
          onSetPriority={(priority) => handleBulkAction({ priority })}
          onClear={() => setCheckedIds(new Set())}
        />
      )}
      <table>
        <thead>
          <tr>
            {onBulkUpdate && (
              <th style={{ width: '40px' }}>
                <input
                  type="checkbox"
                  checked={checkedIds.size === sorted.length && sorted.length > 0}
                  onChange={toggleAllChecked}
                  title="Select all"
                />
              </th>
            )}
            <SortHeader column="starred" label="★" />
            <SortHeader column="id" label="ID" />
            <SortHeader column="title" label="Title" />
            <SortHeader column="type" label="Type" />
            <SortHeader column="status" label="Status" />
            <SortHeader column="priority" label="Priority" />
            <SortHeader column="updated" label="Updated" />
            <th>Actions</th>
          </tr>
        </thead>
        <tbody ref={tableRef}>
          {sorted.map((issue, index) => (
            <tr
              key={issue.id}
              style={{
                background: selectedIndex === index ? '#1e3a5f' : undefined,
                outline: selectedIndex === index ? '2px solid #0077cc' : undefined,
              }}
              onClick={() => setSelectedIndex(index)}
            >
              {onBulkUpdate && (
                <td>
                  <input
                    type="checkbox"
                    checked={checkedIds.has(issue.id)}
                    onChange={() => toggleCheck(issue.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
              )}
              <td>
                <StarButton
                  starred={starredIds.has(issue.id)}
                  onToggle={() => onToggleStar(issue.id, !starredIds.has(issue.id))}
                />
              </td>
              <td>
                <code style={{ fontSize: '0.875rem' }}>{issue.id}</code>
              </td>
              <td>
                <TitleWithPreview
                  issue={issue}
                  parentTitle={filter !== 'tree' && issue.parent ? sorted.find(i => i.id === issue.parent)?.title : undefined}
                  depth={depthMap.get(issue.id) || 0}
                  onClick={() => onEdit(issue)}
                />
              </td>
              <td>
                <span className={`badge badge-${issue.issue_type}`}>
                  {issue.issue_type}
                </span>
              </td>
              <td>
                <span className={`badge badge-${issue.status}`}>
                  {issue.status.replace('_', ' ')}
                </span>
              </td>
              <td>
                <PriorityIndicator priority={issue.priority} />
              </td>
              <td>
                <TimeAgo date={issue.updated_at || issue.created_at} />
              </td>
              <td>
                <div className="flex" style={{ gap: '0.5rem' }}>
                  <button
                    onClick={() => onEdit(issue)}
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(issue.id)}
                    className="btn-danger"
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.875rem'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PriorityIndicator({ priority }: { priority: number }) {
  const labels = ['', 'Critical', 'High', 'Medium', 'Low', 'Lowest']
  const colors = ['', '#ff6b6b', '#ffb464', '#ffd93d', '#4ade80', '#888888']

  return (
    <span style={{
      color: colors[priority] || '#888',
      fontWeight: priority <= 2 ? 600 : 400
    }}>
      {labels[priority] || `P${priority}`}
    </span>
  )
}

function TimeAgo({ date }: { date: string }) {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  let text: string
  if (diffMins < 1) {
    text = 'just now'
  } else if (diffMins < 60) {
    text = `${diffMins}m ago`
  } else if (diffHours < 24) {
    text = `${diffHours}h ago`
  } else if (diffDays < 30) {
    text = `${diffDays}d ago`
  } else {
    text = then.toLocaleDateString()
  }

  return (
    <span style={{ color: '#888', fontSize: '0.875rem' }} title={then.toLocaleString()}>
      {text}
    </span>
  )
}

function StarButton({ starred, onToggle }: { starred: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontSize: '1.25rem',
        padding: '0',
        color: starred ? '#ffb464' : '#555',
        lineHeight: 1,
      }}
      title={starred ? 'Unstar issue' : 'Star issue'}
    >
      {starred ? '★' : '☆'}
    </button>
  )
}

// Build tree-ordered list: parents followed by their children
function buildTreeOrder(issues: Issue[]): Issue[] {
  const issueMap = new Map(issues.map(i => [i.id, i]))
  const childrenMap = new Map<string, Issue[]>()

  // Build children map
  for (const issue of issues) {
    if (issue.parent) {
      const siblings = childrenMap.get(issue.parent) || []
      siblings.push(issue)
      childrenMap.set(issue.parent, siblings)
    }
  }

  // Find root issues (epics or issues without parents)
  const roots = issues.filter(i => !i.parent || !issueMap.has(i.parent))
    .sort((a, b) => {
      // Epics first, then by priority
      if (a.issue_type === 'epic' && b.issue_type !== 'epic') return -1
      if (b.issue_type === 'epic' && a.issue_type !== 'epic') return 1
      return a.priority - b.priority
    })

  // Recursively add children
  const result: Issue[] = []
  function addWithChildren(issue: Issue) {
    result.push(issue)
    const children = childrenMap.get(issue.id) || []
    children.sort((a, b) => a.priority - b.priority)
    for (const child of children) {
      addWithChildren(child)
    }
  }

  for (const root of roots) {
    addWithChildren(root)
  }

  return result
}

function BulkActionsBar({
  count,
  loading,
  onClose,
  onSetStatus,
  onSetPriority,
  onClear,
}: {
  count: number
  loading: boolean
  onClose: () => void
  onSetStatus: (status: 'open' | 'closed' | 'in_progress') => void
  onSetPriority: (priority: number) => void
  onClear: () => void
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.75rem',
      marginBottom: '0.75rem',
      background: '#1e3a5f',
      borderRadius: '4px',
      flexWrap: 'wrap',
    }}>
      <span style={{ fontWeight: 600 }}>{count} selected</span>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={onClose}
          disabled={loading}
          style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
        >
          Close
        </button>
        <select
          onChange={(e) => e.target.value && onSetStatus(e.target.value as 'open' | 'in_progress')}
          disabled={loading}
          defaultValue=""
          style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
        >
          <option value="" disabled>Set Status...</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
        </select>
        <select
          onChange={(e) => e.target.value && onSetPriority(Number(e.target.value))}
          disabled={loading}
          defaultValue=""
          style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
        >
          <option value="" disabled>Set Priority...</option>
          <option value="1">P1 - Critical</option>
          <option value="2">P2 - High</option>
          <option value="3">P3 - Medium</option>
          <option value="4">P4 - Low</option>
          <option value="5">P5 - Lowest</option>
        </select>
      </div>
      <button
        onClick={onClear}
        disabled={loading}
        style={{
          marginLeft: 'auto',
          padding: '0.25rem 0.5rem',
          fontSize: '0.875rem',
          background: 'transparent',
          border: '1px solid #666',
        }}
      >
        Clear
      </button>
      {loading && <span style={{ color: '#888' }}>Updating...</span>}
    </div>
  )
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { key: 'j', description: 'Move down' },
    { key: 'k', description: 'Move up' },
    { key: 'x', description: 'Toggle checkbox on selected' },
    { key: 'e / Enter', description: 'Edit selected issue' },
    { key: 's', description: 'Star/unstar selected issue' },
    { key: '/', description: 'Focus search' },
    { key: '?', description: 'Toggle this help' },
    { key: 'Escape', description: 'Clear selection / close help' },
  ]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1a1a24',
          border: '1px solid #333',
          borderRadius: '8px',
          padding: '1.5rem',
          minWidth: '300px',
          maxWidth: '400px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: '1rem', color: '#e0e0e0' }}>Keyboard Shortcuts</h3>
        <table style={{ width: '100%' }}>
          <tbody>
            {shortcuts.map(({ key, description }) => (
              <tr key={key}>
                <td style={{ padding: '0.5rem 0', width: '100px' }}>
                  <kbd style={{
                    background: '#2a2a3a',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.875rem',
                    fontFamily: 'monospace',
                    color: '#4dc3ff',
                  }}>
                    {key}
                  </kbd>
                </td>
                <td style={{ padding: '0.5rem 0', color: '#aaa' }}>{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: '1rem', textAlign: 'right' }}>
          <button onClick={onClose} style={{ padding: '0.375rem 1rem' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function TitleWithPreview({
  issue,
  parentTitle,
  depth = 0,
  onClick,
}: {
  issue: Issue
  parentTitle?: string
  depth?: number
  onClick: () => void
}) {
  const [showPreview, setShowPreview] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  const handleMouseEnter = () => {
    if (issue.description) {
      timeoutRef.current = window.setTimeout(() => setShowPreview(true), 400)
    }
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setShowPreview(false)
  }

  return (
    <div
      style={{ position: 'relative', paddingLeft: depth > 0 ? `${depth * 1.5}rem` : undefined }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {parentTitle && (
        <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.125rem' }}>
          ↳ {parentTitle}
        </div>
      )}
      {depth > 0 && !parentTitle && (
        <span style={{ color: '#555', marginRight: '0.5rem' }}>└</span>
      )}
      <span
        style={{
          cursor: 'pointer',
          color: '#4dc3ff',
          textDecoration: issue.status === 'closed' ? 'line-through' : 'none',
          opacity: issue.status === 'closed' ? 0.6 : 1,
        }}
        onClick={onClick}
      >
        {issue.title}
        {issue.description && (
          <span style={{ color: '#666', marginLeft: '0.5rem', fontSize: '0.75rem' }}>
            ⋯
          </span>
        )}
      </span>

      {showPreview && issue.description && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: '100%',
            marginTop: '0.25rem',
            padding: '0.75rem',
            background: '#1a1a24',
            border: '1px solid #333',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            zIndex: 100,
            maxWidth: '400px',
            minWidth: '200px',
            whiteSpace: 'pre-wrap',
            fontSize: '0.875rem',
            color: '#ccc',
          }}
        >
          {issue.description.length > 300
            ? issue.description.slice(0, 300) + '...'
            : issue.description}
        </div>
      )}
    </div>
  )
}
