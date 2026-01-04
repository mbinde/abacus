import { useState, FormEvent } from 'react'

interface Comment {
  id: number
  issue_id: string
  author: string
  text: string
  created_at: string
}

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
  comments?: Comment[]
}

interface Props {
  issue: Issue | null
  onSave: (issue: Partial<Issue>) => void
  onCancel: () => void
  repoOwner?: string
  repoName?: string
  userLogin?: string
  onCommentAdded?: () => void
}

export default function IssueForm({ issue, onSave, onCancel, repoOwner, repoName, userLogin, onCommentAdded }: Props) {
  const [title, setTitle] = useState(issue?.title || '')
  const [description, setDescription] = useState(issue?.description || '')
  const [issueType, setIssueType] = useState<Issue['issue_type']>(issue?.issue_type || 'task')
  const [status, setStatus] = useState<Issue['status']>(issue?.status || 'open')
  const [priority, setPriority] = useState(issue?.priority || 3)
  const [newComment, setNewComment] = useState('')
  const [commentLoading, setCommentLoading] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)

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

  async function handleAddComment(e: FormEvent) {
    e.preventDefault()
    if (!newComment.trim() || !repoOwner || !repoName || !issue) return

    setCommentLoading(true)
    setCommentError(null)

    try {
      const res = await fetch(`/api/repos/${repoOwner}/${repoName}/issues/${issue.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newComment.trim() }),
      })

      if (res.ok) {
        setNewComment('')
        onCommentAdded?.()
      } else {
        const data = await res.json() as { error?: string }
        setCommentError(data.error || 'Failed to add comment')
      }
    } catch {
      setCommentError('Failed to add comment')
    } finally {
      setCommentLoading(false)
    }
  }

  const isNew = !issue
  const comments = issue?.comments || []

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

      {!isNew && (
        <div style={{ marginTop: '2rem', borderTop: '1px solid #333', paddingTop: '1.5rem' }}>
          <h4 style={{ marginBottom: '1rem' }}>Comments ({comments.length})</h4>

          {comments.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  style={{
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    background: '#1a1a24',
                    borderRadius: '4px',
                    border: '1px solid #2a2a3a',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 600, color: '#4dc3ff' }}>@{comment.author}</span>
                    <span style={{ color: '#666', fontSize: '0.875rem' }}>
                      {new Date(comment.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{comment.text}</div>
                </div>
              ))}
            </div>
          )}

          {commentError && <div className="error">{commentError}</div>}

          <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '0.5rem' }}>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              rows={2}
              style={{ flex: 1 }}
              disabled={commentLoading}
            />
            <button
              type="submit"
              disabled={commentLoading || !newComment.trim()}
              style={{ alignSelf: 'flex-end' }}
            >
              {commentLoading ? '...' : 'Comment'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
