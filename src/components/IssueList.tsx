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

interface Props {
  issues: Issue[]
  starredIds: Set<string>
  onEdit: (issue: Issue) => void
  onDelete: (id: string) => void
  onToggleStar: (issueId: string, starred: boolean) => void
}

type StatusFilter = 'all' | 'open' | 'in_progress' | 'closed' | 'starred'
type SortKey = 'starred' | 'id' | 'title' | 'type' | 'status' | 'priority' | 'updated'
type SortDir = 'asc' | 'desc'

export default function IssueList({ issues, starredIds, onEdit, onDelete, onToggleStar }: Props) {
  const [filter, setFilter] = useState<StatusFilter>(() => {
    const saved = localStorage.getItem('abacus:statusFilter')
    return (saved as StatusFilter) || 'open'
  })
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [showHelp, setShowHelp] = useState(false)
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
  }

  // Filter issues by status
  let filtered: Issue[]
  if (filter === 'all') {
    filtered = issues
  } else if (filter === 'starred') {
    filtered = issues.filter(i => starredIds.has(i.id))
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
  const sorted = [...filtered].sort((a, b) => {
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

  const filterButtons: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'starred', label: '★ Starred' },
    { key: 'open', label: 'Open' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'closed', label: 'Closed' },
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
      <table>
        <thead>
          <tr>
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
                <span
                  style={{
                    cursor: 'pointer',
                    color: '#4dc3ff',
                    textDecoration: issue.status === 'closed' ? 'line-through' : 'none',
                    opacity: issue.status === 'closed' ? 0.6 : 1
                  }}
                  onClick={() => onEdit(issue)}
                >
                  {issue.title}
                </span>
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

function HelpModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { key: 'j', description: 'Move down' },
    { key: 'k', description: 'Move up' },
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
