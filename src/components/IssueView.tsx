import { useState, FormEvent } from 'react'
import DispatchButton from './DispatchButton'
import MentionText from './MentionText'
import type { GitHubLink } from '../lib/beads'

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
  assignee?: string
  created_at: string
  updated_at?: string
  closed_at?: string
  parent?: string
  sha?: string
  comments?: Comment[]
  links?: GitHubLink[]
}

interface Props {
  issue: Issue
  onEdit: () => void
  onClose: () => void
  repoOwner: string
  repoName: string
  onCommentAdded?: () => void
}

const statusColors: Record<string, string> = {
  open: '#4ade80',
  in_progress: '#60a5fa',
  closed: '#888',
}

const priorityLabels: Record<number, string> = {
  1: 'Critical',
  2: 'High',
  3: 'Medium',
  4: 'Low',
  5: 'Lowest',
}

const typeEmoji: Record<string, string> = {
  bug: '',
  feature: '',
  task: '',
  epic: '',
}

export default function IssueView({ issue, onEdit, onClose, repoOwner, repoName, onCommentAdded }: Props) {
  const [newComment, setNewComment] = useState('')
  const [commentLoading, setCommentLoading] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)

  async function handleAddComment(e: FormEvent) {
    e.preventDefault()
    if (!newComment.trim()) return

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
        const errorMsg = data.error || 'Failed to add comment'
        setCommentError(errorMsg)
        alert(`Error saving comment: ${errorMsg}`)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to add comment'
      setCommentError(errorMsg)
      alert(`Error saving comment: ${errorMsg}`)
    } finally {
      setCommentLoading(false)
    }
  }

  const comments = issue.comments || []

  return (
    <div className="card">
      {/* Header with title and actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>
            {typeEmoji[issue.issue_type]} {issue.title}
          </h3>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
            <span style={{
              color: statusColors[issue.status],
              textTransform: 'capitalize',
            }}>
              {issue.status.replace('_', ' ')}
            </span>
            <span style={{ color: '#888' }}>
              P{issue.priority} {priorityLabels[issue.priority]}
            </span>
            <span style={{ color: '#666' }}>
              {issue.issue_type}
            </span>
            {issue.assignee && (
              <span style={{ color: '#4dc3ff' }}>
                @{issue.assignee}
              </span>
            )}
            <code style={{ color: '#666', fontSize: '0.75rem' }}>{issue.id}</code>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={onEdit} style={{ fontSize: '0.8rem', padding: '0.375rem 0.75rem' }}>
            Edit
          </button>
          <button onClick={onClose} style={{ fontSize: '0.8rem', padding: '0.375rem 0.75rem', background: '#444' }}>
            Close
          </button>
        </div>
      </div>

      {/* Description */}
      {issue.description && (
        <div style={{
          marginBottom: '1rem',
          padding: '0.75rem',
          background: '#1a1a24',
          borderRadius: '4px',
          whiteSpace: 'pre-wrap',
        }}>
          <MentionText text={issue.description} />
        </div>
      )}

      {/* Links */}
      {issue.links && issue.links.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.25rem' }}>Linked:</div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {issue.links.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '0.8rem',
                  padding: '0.25rem 0.5rem',
                  background: '#1a1a24',
                  borderRadius: '3px',
                  textDecoration: 'none',
                }}
              >
                {link.type === 'pr' ? 'PR' : 'Commit'} {link.url.split('/').pop()?.substring(0, 7)}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Dispatch button */}
      <DispatchButton
        repoOwner={repoOwner}
        repoName={repoName}
        issueId={issue.id}
      />

      {/* Comments section */}
      <div style={{ borderTop: '1px solid #333', paddingTop: '1rem', marginTop: '1rem' }}>
        <div style={{ fontSize: '0.9rem', color: '#888', marginBottom: '0.75rem' }}>
          Comments ({comments.length})
        </div>

        {comments.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            {comments.map((comment) => (
              <div
                key={comment.id}
                style={{
                  padding: '0.5rem 0.75rem',
                  marginBottom: '0.5rem',
                  background: '#1a1a24',
                  borderRadius: '4px',
                  border: '1px solid #2a2a3a',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
                  <span style={{ fontWeight: 600, color: '#4dc3ff' }}>@{comment.author}</span>
                  <span style={{ color: '#666' }}>
                    {new Date(comment.created_at).toLocaleString()}
                  </span>
                </div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
                  <MentionText text={comment.text} />
                </div>
              </div>
            ))}
          </div>
        )}

        {commentError && <div className="error" style={{ marginBottom: '0.5rem' }}>{commentError}</div>}

        <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '0.5rem' }}>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            rows={2}
            style={{ flex: 1, fontSize: '0.9rem' }}
            disabled={commentLoading}
          />
          <button
            type="submit"
            disabled={commentLoading || !newComment.trim()}
            style={{ alignSelf: 'flex-end', fontSize: '0.8rem', padding: '0.375rem 0.75rem' }}
          >
            {commentLoading ? '...' : 'Comment'}
          </button>
        </form>
      </div>
    </div>
  )
}
