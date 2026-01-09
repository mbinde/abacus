import { useState } from 'react'
import MentionText from './MentionText'

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
}

interface Props {
  issues: Issue[]
  onIssueClick: (issue: Issue) => void
  limit?: number
}

interface ActivityItem {
  type: 'created' | 'updated' | 'closed' | 'comment'
  timestamp: string
  issue: Issue
  comment?: Comment
}

type ActivityFilter = 'all' | 'created' | 'updated' | 'closed' | 'comment'

export default function ActivityFeed({ issues, onIssueClick, limit = 50 }: Props) {
  const [filter, setFilter] = useState<ActivityFilter>('all')

  // Generate activity items from issues
  const activities: ActivityItem[] = []

  for (const issue of issues) {
    // Issue created
    activities.push({
      type: 'created',
      timestamp: issue.created_at,
      issue,
    })

    // Issue closed
    if (issue.closed_at) {
      activities.push({
        type: 'closed',
        timestamp: issue.closed_at,
        issue,
      })
    }

    // Issue updated (if different from created/closed)
    if (issue.updated_at &&
        issue.updated_at !== issue.created_at &&
        issue.updated_at !== issue.closed_at) {
      activities.push({
        type: 'updated',
        timestamp: issue.updated_at,
        issue,
      })
    }

    // Comments
    if (issue.comments) {
      for (const comment of issue.comments) {
        activities.push({
          type: 'comment',
          timestamp: comment.created_at,
          issue,
          comment,
        })
      }
    }
  }

  // Sort by timestamp descending (newest first)
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Filter by type
  const filtered = filter === 'all'
    ? activities
    : activities.filter(a => a.type === filter)

  // Limit results
  const displayActivities = filtered.slice(0, limit)

  const filterButtons: { key: ActivityFilter; label: string; icon: string }[] = [
    { key: 'all', label: 'All', icon: '' },
    { key: 'created', label: 'Created', icon: '+' },
    { key: 'updated', label: 'Updated', icon: '~' },
    { key: 'closed', label: 'Closed', icon: '✓' },
    { key: 'comment', label: 'Comments', icon: '💬' },
  ]

  // Count by type for badges
  const counts: Record<ActivityFilter, number> = {
    all: activities.length,
    created: activities.filter(a => a.type === 'created').length,
    updated: activities.filter(a => a.type === 'updated').length,
    closed: activities.filter(a => a.type === 'closed').length,
    comment: activities.filter(a => a.type === 'comment').length,
  }

  if (activities.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>
        No recent activity
      </div>
    )
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ margin: 0, color: '#aaa', fontSize: '0.875rem', fontWeight: 600 }}>
          Recent Activity
        </h3>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {filterButtons.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                background: filter === key ? '#0077cc' : '#2a2a3a',
                color: filter === key ? 'white' : '#aaa',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {icon && <span style={{ marginRight: '0.25rem' }}>{icon}</span>}
              {label}
              <span style={{ marginLeft: '0.25rem', opacity: 0.7 }}>({counts[key]})</span>
            </button>
          ))}
        </div>
      </div>
      {displayActivities.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>
          No {filter} activity
        </div>
      ) : (
        <div className="activity-feed">
          {displayActivities.map((activity, index) => (
            <ActivityItem
              key={`${activity.type}-${activity.issue.id}-${activity.timestamp}-${index}`}
              activity={activity}
              onClick={() => onIssueClick(activity.issue)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ActivityItem({ activity, onClick }: { activity: ActivityItem; onClick: () => void }) {
  const icons: Record<ActivityItem['type'], string> = {
    created: '+',
    updated: '~',
    closed: '✓',
    comment: '💬',
  }

  const iconClasses: Record<ActivityItem['type'], string> = {
    created: 'activity-icon-created',
    updated: 'activity-icon-updated',
    closed: 'activity-icon-closed',
    comment: 'activity-icon-comment',
  }

  const messages: Record<ActivityItem['type'], string> = {
    created: 'Issue created',
    updated: 'Issue updated',
    closed: 'Issue closed',
    comment: 'Comment added',
  }

  return (
    <div className="activity-item">
      <div className={`activity-icon ${iconClasses[activity.type]}`}>
        {icons[activity.type]}
      </div>
      <div className="activity-content">
        <div className="activity-title">
          {messages[activity.type]}:{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); onClick(); }}>
            {activity.issue.title}
          </a>
        </div>
        {activity.type === 'comment' && activity.comment && (
          <div className="activity-description">
            @{activity.comment.author}: <MentionText text={activity.comment.text} />
          </div>
        )}
        <div className="activity-time">
          <TimeAgo date={activity.timestamp} />
        </div>
      </div>
    </div>
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
    text = `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
  } else if (diffHours < 24) {
    text = `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  } else if (diffDays < 30) {
    text = `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  } else {
    text = then.toLocaleDateString()
  }

  return <span title={then.toLocaleString()}>{text}</span>
}
