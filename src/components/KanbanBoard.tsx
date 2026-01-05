import { useState, useRef } from 'react'

interface Issue {
  id: string
  title: string
  description?: string
  status: 'open' | 'closed' | 'in_progress'
  priority: number
  issue_type: 'bug' | 'feature' | 'task' | 'epic'
  assignee?: string
  created_at: string
  updated_at?: string
}

interface Props {
  issues: Issue[]
  onEdit: (issue: Issue) => void
  onStatusChange: (issueId: string, newStatus: 'open' | 'in_progress' | 'closed') => void
}

type Status = 'open' | 'in_progress' | 'closed'

const columns: { status: Status; label: string; color: string }[] = [
  { status: 'open', label: 'Open', color: '#4ade80' },
  { status: 'in_progress', label: 'In Progress', color: '#ffb464' },
  { status: 'closed', label: 'Closed', color: '#999' },
]

export default function KanbanBoard({ issues, onEdit, onStatusChange }: Props) {
  const [draggedIssue, setDraggedIssue] = useState<Issue | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<Status | null>(null)
  const dragCounter = useRef<Map<Status, number>>(new Map())

  const handleDragStart = (e: React.DragEvent, issue: Issue) => {
    setDraggedIssue(issue)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', issue.id)
    // Add dragging class after a small delay to not affect the drag image
    requestAnimationFrame(() => {
      const el = e.target as HTMLElement
      el.classList.add('dragging')
    })
  }

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedIssue(null)
    setDragOverColumn(null)
    dragCounter.current.clear()
    const el = e.target as HTMLElement
    el.classList.remove('dragging')
  }

  const handleDragEnter = (e: React.DragEvent, status: Status) => {
    e.preventDefault()
    const count = (dragCounter.current.get(status) || 0) + 1
    dragCounter.current.set(status, count)
    setDragOverColumn(status)
  }

  const handleDragLeave = (e: React.DragEvent, status: Status) => {
    e.preventDefault()
    const count = (dragCounter.current.get(status) || 0) - 1
    dragCounter.current.set(status, count)
    if (count <= 0) {
      dragCounter.current.delete(status)
      if (dragOverColumn === status) {
        setDragOverColumn(null)
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, status: Status) => {
    e.preventDefault()
    if (draggedIssue && draggedIssue.status !== status) {
      onStatusChange(draggedIssue.id, status)
    }
    setDraggedIssue(null)
    setDragOverColumn(null)
    dragCounter.current.clear()
  }

  const priorityColors: Record<number, string> = {
    1: '#ff6b6b',
    2: '#ffb464',
    3: '#ffd93d',
    4: '#4ade80',
    5: '#888888',
  }

  return (
    <div className="kanban-container">
      {columns.map(column => {
        const columnIssues = issues
          .filter(i => i.status === column.status)
          .sort((a, b) => a.priority - b.priority)

        return (
          <div
            key={column.status}
            className={`kanban-column ${dragOverColumn === column.status ? 'drag-over' : ''}`}
            onDragEnter={(e) => handleDragEnter(e, column.status)}
            onDragLeave={(e) => handleDragLeave(e, column.status)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.status)}
          >
            <div className="kanban-column-header">
              <span style={{ color: column.color }}>{column.label}</span>
              <span className="kanban-column-count">{columnIssues.length}</span>
            </div>
            <div className="kanban-cards">
              {dragOverColumn === column.status && draggedIssue?.status !== column.status && (
                <div className="kanban-drop-indicator" />
              )}
              {columnIssues.map(issue => (
                <div
                  key={issue.id}
                  className="kanban-card"
                  draggable
                  onDragStart={(e) => handleDragStart(e, issue)}
                  onDragEnd={handleDragEnd}
                  onClick={() => onEdit(issue)}
                >
                  <div className="kanban-card-title">{issue.title}</div>
                  <div className="kanban-card-meta">
                    <span className={`badge badge-${issue.issue_type}`} style={{ fontSize: '0.625rem' }}>
                      {issue.issue_type}
                    </span>
                    <span style={{
                      color: priorityColors[issue.priority] || '#888',
                      fontWeight: issue.priority <= 2 ? 600 : 400,
                    }}>
                      P{issue.priority}
                    </span>
                    <code style={{ fontSize: '0.625rem', color: '#666' }}>{issue.id}</code>
                  </div>
                </div>
              ))}
              {columnIssues.length === 0 && !dragOverColumn && (
                <div style={{
                  padding: '2rem 1rem',
                  textAlign: 'center',
                  color: '#555',
                  fontSize: '0.875rem',
                }}>
                  No issues
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
