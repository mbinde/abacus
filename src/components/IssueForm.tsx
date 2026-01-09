import { useState, useEffect, FormEvent } from 'react'
import GitHubLinks from './GitHubLinks'
import TextEditWarningPane from './TextEditWarningPane'
import type { GitHubLink } from '../lib/beads'

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
  links?: GitHubLink[]
}

interface Props {
  issue: Issue | null
  onSave: (issue: Partial<Issue>, backupFields?: { title?: string; description?: string }) => void
  onCancel: () => void
  onConvertToComment?: (commentText: string) => void
}

const BACKUP_PREF_KEY = 'abacus:textEditBackupEnabled'

export default function IssueForm({ issue, onSave, onCancel, onConvertToComment }: Props) {
  const [title, setTitle] = useState(issue?.title || '')
  const [description, setDescription] = useState(issue?.description || '')
  const [issueType, setIssueType] = useState<Issue['issue_type']>(issue?.issue_type || 'task')
  const [status, setStatus] = useState<Issue['status']>(issue?.status || 'open')
  const [priority, setPriority] = useState(issue?.priority || 3)
  const [assignee, setAssignee] = useState(issue?.assignee || '')
  const [links, setLinks] = useState<GitHubLink[]>(issue?.links || [])

  // Track original values to detect text field changes
  const originalTitle = issue?.title || ''
  const originalDescription = issue?.description || ''

  // Check if text fields have been modified
  const titleModified = title !== originalTitle
  const descriptionModified = description !== originalDescription
  const textFieldsModified = titleModified || descriptionModified

  // Backup preference - persisted in localStorage
  const [backupEnabled, setBackupEnabled] = useState(() => {
    const saved = localStorage.getItem(BACKUP_PREF_KEY)
    return saved !== null ? saved === 'true' : true // Default to true
  })

  // Persist backup preference
  useEffect(() => {
    localStorage.setItem(BACKUP_PREF_KEY, String(backupEnabled))
  }, [backupEnabled])

  // Build comment text from text field changes - just the raw text
  function buildCommentFromChanges(): string {
    const parts: string[] = []
    if (titleModified) {
      parts.push(title)
    }
    if (descriptionModified) {
      parts.push(description)
    }
    return parts.join('\n\n')
  }

  function handleConvertToComment() {
    if (onConvertToComment && textFieldsModified) {
      onConvertToComment(buildCommentFromChanges())
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const data: Partial<Issue> = {
      title,
      description,
      issue_type: issueType,
      status,
      priority,
      assignee: assignee || undefined,
      links: links.length > 0 ? links : undefined,
    }

    if (issue) {
      data.id = issue.id
      data.sha = issue.sha
    }

    // If editing (not creating) and text fields were modified and backup is enabled,
    // pass the new text values to be backed up as comments
    const backupFields = (issue && backupEnabled && textFieldsModified)
      ? {
          title: titleModified ? title : undefined,
          description: descriptionModified ? description : undefined,
        }
      : undefined

    onSave(data, backupFields)
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

        <div className="flex mb-2" style={{ flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 120px', minWidth: '120px' }}>
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

          <div style={{ flex: '1 1 120px', minWidth: '120px' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
              Status
            </label>
            <select value={status} onChange={(e) => setStatus(e.target.value as Issue['status'])}>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div style={{ flex: '1 1 120px', minWidth: '120px' }}>
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

          <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
              Assignee
            </label>
            <input
              type="text"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="GitHub username"
            />
          </div>
        </div>

        <div className="mb-2">
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
            Linked PRs & Commits
          </label>
          <GitHubLinks
            links={links}
            onAdd={(link) => setLinks([...links, link])}
            onRemove={(index) => setLinks(links.filter((_, i) => i !== index))}
          />
        </div>

        {/* Show warning pane when editing (not creating) and text fields have been modified */}
        {!isNew && textFieldsModified && (
          <TextEditWarningPane
            lastModified={issue?.updated_at}
            backupEnabled={backupEnabled}
            onBackupToggle={setBackupEnabled}
            onConvertToComment={onConvertToComment ? handleConvertToComment : undefined}
          />
        )}

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
