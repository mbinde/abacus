import { useState, FormEvent } from 'react'

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
  sha?: string
}

interface Props {
  issue: Issue | null
  onSave: (issue: Partial<Issue>) => void
  onCancel: () => void
}

export default function IssueForm({ issue, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(issue?.title || '')
  const [description, setDescription] = useState(issue?.description || '')
  const [issueType, setIssueType] = useState<Issue['issue_type']>(issue?.issue_type || 'task')
  const [status, setStatus] = useState<Issue['status']>(issue?.status || 'open')
  const [priority, setPriority] = useState(issue?.priority || 3)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const data: Partial<Issue> = {
      title,
      description,
      issue_type: issueType,
      status,
      priority,
    }

    if (issue) {
      data.id = issue.id
      data.sha = issue.sha
    }

    onSave(data)
  }

  const isNew = !issue

  return (
    <div className="card">
      <h3 className="mb-2">{isNew ? 'Create Issue' : 'Edit Issue'}</h3>

      <form onSubmit={handleSubmit}>
        <div className="mb-2">
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Issue title"
            required
            autoFocus
          />
        </div>

        <div className="mb-2">
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue..."
            rows={5}
          />
        </div>

        <div className="flex mb-2">
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
              Type
            </label>
            <select value={issueType} onChange={(e) => setIssueType(e.target.value as Issue['issue_type'])}>
              <option value="task">Task</option>
              <option value="bug">Bug</option>
              <option value="feature">Feature</option>
              <option value="epic">Epic</option>
            </select>
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
              Status
            </label>
            <select value={status} onChange={(e) => setStatus(e.target.value as Issue['status'])}>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
              Priority
            </label>
            <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
              <option value={1}>1 - Critical</option>
              <option value={2}>2 - High</option>
              <option value={3}>3 - Medium</option>
              <option value={4}>4 - Low</option>
              <option value={5}>5 - Lowest</option>
            </select>
          </div>
        </div>

        <div className="flex" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{ background: '#444' }}>
            Cancel
          </button>
          <button type="submit">
            {isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
