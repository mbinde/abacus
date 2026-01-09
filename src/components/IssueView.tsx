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

interface User {
  login: string
}

interface Props {
  issue: Issue
  onEdit: () => void
  onClose: () => void
  repoOwner: string
  repoName: string
  currentUser: User | null
  onCommentAdded?: () => void
  readOnly?: boolean
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

interface PendingComment extends Comment {
  status: 'saving' | 'failed'
}

export default function IssueView({ issue, onEdit, onClose, repoOwner, repoName, currentUser, onCommentAdded, readOnly }: Props) {
  const [newComment, setNewComment] = useState('')
  const [commentLoading, setCommentLoading] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [pendingComments, setPendingComments] = useState<PendingComment[]>([])

  async function handleAddComment(e: FormEvent) {
    e.preventDefault()
    if (!newComment.trim() || !currentUser) return

    const commentText = newComment.trim()
    setCommentLoading(true)
    setCommentError(null)

    // Add comment immediately with 'saving' status
    const tempComment: PendingComment = {
      id: Date.now(),
      issue_id: issue.id,
      author: currentUser.login,
      text: commentText,
      created_at: new Date().toISOString(),
      status: 'saving',
    }
    setPendingComments(prev => [...prev, tempComment])
    setNewComment('')

    try {
      const res = await fetch(`/api/repos/${repoOwner}/${repoName}/issues/${issue.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: commentText }),
      })

      if (res.ok) {
        // Mark as no longer pending (will be cleaned up when server data arrives)
        setPendingComments(prev => prev.filter(c => c.id !== tempComment.id))
        onCommentAdded?.()
      } else {
        // Mark as failed - keep the comment visible
        setPendingComments(prev => prev.map(c =>
          c.id === tempComment.id ? { ...c, status: 'failed' as const } : c
        ))
        const data = await res.json() as { error?: string }
        setCommentError(data.error || 'Failed to add comment')
      }
    } catch (err) {
      // Mark as failed - keep the comment visible
      setPendingComments(prev => prev.map(c =>
        c.id === tempComment.id ? { ...c, status: 'failed' as const } : c
      ))
      setCommentError(err instanceof Error ? err.message : 'Failed to add comment')
    } finally {
      setCommentLoading(false)
    }
  }

  function dismissFailedComment(commentId: number) {
    setPendingComments(prev => prev.filter(c => c.id !== commentId))
  }

  // Merge server comments with pending ones, avoiding duplicates
  const serverComments = issue.comments || []
  const allComments: (Comment | PendingComment)[] = [...serverComments]
  for (const pending of pendingComments) {
    // Check if this pending comment is now in server data
    const exists = serverComments.some(
      sc => sc.author === pending.author && sc.text === pending.text
    )
    if (!exists) {
      allComments.push(pending)
    }
  }
  // Clean up pending comments that are now in server data
  if (pendingComments.length > 0 && serverComments.length > 0) {
    const stillPending = pendingComments.filter(
      p => !serverComments.some(sc => sc.author === p.author && sc.text === p.text)
    )
    if (stillPending.length !== pendingComments.length) {
      setPendingComments(stillPending)
    }
  }

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
          {!readOnly && (
            <button onClick={onEdit} style={{ fontSize: '0.8rem', padding: '0.375rem 0.75rem' }}>
              Edit
            </button>
          )}
          <button onClick={onClose} style={{ fontSize: '0.8rem', padding: '0.375rem 0.75rem', background: '#444' }}>
            Back
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

      {/* Dispatch button - only for non-read-only users */}
      {!readOnly && (
        <DispatchButton
          repoOwner={repoOwner}
          repoName={repoName}
          issueId={issue.id}
        />
      )}

      {/* Comments section */}
      <div style={{ borderTop: '1px solid #333', paddingTop: '1rem', marginTop: '1rem' }}>
        <div style={{ fontSize: '0.9rem', color: '#888', marginBottom: '0.75rem' }}>
          Comments ({allComments.length})
        </div>

        {allComments.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            {allComments.map((comment) => {
              const isPending = 'status' in comment
              const isSaving = isPending && comment.status === 'saving'
              const isFailed = isPending && comment.status === 'failed'

              return (
                <div
                  key={comment.id}
                  style={{
                    padding: '0.5rem 0.75rem',
                    marginBottom: '0.5rem',
                    background: '#1a1a24',
                    borderRadius: '4px',
                    border: isFailed ? '2px solid #dc2626' : isSaving ? '2px solid #ca8a04' : '1px solid #2a2a3a',
                  }}
                >
                  {/* Status banner for pending comments */}
                  {isSaving && (
                    <div style={{
                      background: '#854d0e',
                      color: '#fef08a',
                      padding: '0.375rem 0.5rem',
                      margin: '-0.5rem -0.75rem 0.5rem -0.75rem',
                      borderRadius: '2px 2px 0 0',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                    }}>
                      Saving to git... (comment will appear shortly)
                    </div>
                  )}
                  {isFailed && (
                    <div style={{
                      background: '#991b1b',
                      color: '#fecaca',
                      padding: '0.375rem 0.5rem',
                      margin: '-0.5rem -0.75rem 0.5rem -0.75rem',
                      borderRadius: '2px 2px 0 0',
                      fontSize: '0.8rem',
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                        Failed to save comment!
                      </div>
                      <div>Copy your comment text before dismissing, then try again.</div>
                      <button
                        onClick={() => dismissFailedComment(comment.id)}
                        style={{
                          marginTop: '0.375rem',
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.75rem',
                          background: '#7f1d1d',
                          border: '1px solid #dc2626',
                          color: '#fecaca',
                          cursor: 'pointer',
                          borderRadius: '3px',
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
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
              )
            })}
          </div>
        )}

        {commentError && <div className="error" style={{ marginBottom: '0.5rem' }}>{commentError}</div>}

        {!readOnly && currentUser && (
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
        )}
        {readOnly && (
          <div style={{ fontSize: '0.85rem', color: '#888', fontStyle: 'italic' }}>
            Log in to add comments
          </div>
        )}
      </div>
    </div>
  )
}
