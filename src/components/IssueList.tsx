import { useState } from 'react'

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
  onEdit: (issue: Issue) => void
  onDelete: (id: string) => void
}

type StatusFilter = 'all' | 'open' | 'in_progress' | 'closed'
type SortKey = 'id' | 'title' | 'type' | 'status' | 'priority' | 'updated'
type SortDir = 'asc' | 'desc'

export default function IssueList({ issues, onEdit, onDelete }: Props) {
  const [filter, setFilter] = useState<StatusFilter>(() => {
    const saved = localStorage.getItem('abacus:statusFilter')
    return (saved as StatusFilter) || 'open'
  })
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

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
      <div className="card" style={{ textAlign: 'center', color: '#666' }}>
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
  }

  // Filter issues
  const filtered = filter === 'all' ? issues : issues.filter(i => i.status === filter)

  // Sort issues
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
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

  const filterButtons: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
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
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
        {filterButtons.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleFilterChange(key)}
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: '0.875rem',
              background: filter === key ? '#0066cc' : '#e0e0e0',
              color: filter === key ? 'white' : '#333',
            }}
          >
            {label} ({counts[key]})
          </button>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <SortHeader column="id" label="ID" />
            <SortHeader column="title" label="Title" />
            <SortHeader column="type" label="Type" />
            <SortHeader column="status" label="Status" />
            <SortHeader column="priority" label="Priority" />
            <SortHeader column="updated" label="Updated" />
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((issue) => (
            <tr key={issue.id}>
              <td>
                <code style={{ fontSize: '0.875rem' }}>{issue.id}</code>
              </td>
              <td>
                <span
                  style={{
                    cursor: 'pointer',
                    color: '#0066cc',
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
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.875rem',
                      background: '#cc0000'
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
  const colors = ['', '#cc0000', '#ff6600', '#ffcc00', '#66cc66', '#999999']

  return (
    <span style={{
      color: colors[priority] || '#666',
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
    <span style={{ color: '#666', fontSize: '0.875rem' }} title={then.toLocaleString()}>
      {text}
    </span>
  )
}
