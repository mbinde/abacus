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
}

export default function Dashboard({ issues }: Props) {
  // Calculate statistics
  const total = issues.length
  const open = issues.filter(i => i.status === 'open').length
  const inProgress = issues.filter(i => i.status === 'in_progress').length
  const closed = issues.filter(i => i.status === 'closed').length

  // Count by type
  const typeCount = {
    bug: issues.filter(i => i.issue_type === 'bug').length,
    feature: issues.filter(i => i.issue_type === 'feature').length,
    task: issues.filter(i => i.issue_type === 'task').length,
    epic: issues.filter(i => i.issue_type === 'epic').length,
  }

  // Count by priority
  const priorityCount = {
    critical: issues.filter(i => i.priority === 1).length,
    high: issues.filter(i => i.priority === 2).length,
    medium: issues.filter(i => i.priority === 3).length,
    low: issues.filter(i => i.priority === 4).length,
    lowest: issues.filter(i => i.priority === 5).length,
  }

  // Calculate completion rate
  const completionRate = total > 0 ? Math.round((closed / total) * 100) : 0

  // Recent activity (last 7 days)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const recentIssues = issues.filter(i => {
    const updated = new Date(i.updated_at || i.created_at)
    return updated >= sevenDaysAgo
  }).length

  const maxTypeCount = Math.max(...Object.values(typeCount), 1)
  const maxPriorityCount = Math.max(...Object.values(priorityCount), 1)

  return (
    <div className="card">
      <h3 style={{ marginBottom: '1.5rem', color: '#e0e0e0' }}>Dashboard</h3>

      {/* Stats grid */}
      <div className="dashboard-grid">
        <div className="dashboard-stat">
          <div className="dashboard-stat-value" style={{ color: '#e0e0e0' }}>{total}</div>
          <div className="dashboard-stat-label">Total Issues</div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat-value" style={{ color: '#4ade80' }}>{open}</div>
          <div className="dashboard-stat-label">Open</div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat-value" style={{ color: '#ffb464' }}>{inProgress}</div>
          <div className="dashboard-stat-label">In Progress</div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat-value" style={{ color: '#999' }}>{closed}</div>
          <div className="dashboard-stat-label">Closed</div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat-value" style={{ color: '#4dc3ff' }}>{completionRate}%</div>
          <div className="dashboard-stat-label">Completion Rate</div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat-value" style={{ color: '#b464ff' }}>{recentIssues}</div>
          <div className="dashboard-stat-label">Active (7 days)</div>
        </div>
      </div>

      {/* Charts side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        {/* Issues by Type */}
        <div className="dashboard-chart">
          <div className="dashboard-chart-title">Issues by Type</div>
          <div className="dashboard-bar-chart">
            <BarRow label="Bugs" value={typeCount.bug} max={maxTypeCount} color="#ff6b6b" />
            <BarRow label="Features" value={typeCount.feature} max={maxTypeCount} color="#64b4ff" />
            <BarRow label="Tasks" value={typeCount.task} max={maxTypeCount} color="#aaa" />
            <BarRow label="Epics" value={typeCount.epic} max={maxTypeCount} color="#b464ff" />
          </div>
        </div>

        {/* Issues by Priority */}
        <div className="dashboard-chart">
          <div className="dashboard-chart-title">Issues by Priority</div>
          <div className="dashboard-bar-chart">
            <BarRow label="Critical" value={priorityCount.critical} max={maxPriorityCount} color="#ff6b6b" />
            <BarRow label="High" value={priorityCount.high} max={maxPriorityCount} color="#ffb464" />
            <BarRow label="Medium" value={priorityCount.medium} max={maxPriorityCount} color="#ffd93d" />
            <BarRow label="Low" value={priorityCount.low} max={maxPriorityCount} color="#4ade80" />
            <BarRow label="Lowest" value={priorityCount.lowest} max={maxPriorityCount} color="#888" />
          </div>
        </div>
      </div>

      {/* Status breakdown */}
      <div className="dashboard-chart">
        <div className="dashboard-chart-title">Status Breakdown</div>
        <div style={{ display: 'flex', height: '32px', borderRadius: '4px', overflow: 'hidden' }}>
          {open > 0 && (
            <div
              style={{
                width: `${(open / total) * 100}%`,
                background: '#4ade80',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                color: '#000',
                fontWeight: 600,
              }}
              title={`Open: ${open}`}
            >
              {open > 0 && `${Math.round((open / total) * 100)}%`}
            </div>
          )}
          {inProgress > 0 && (
            <div
              style={{
                width: `${(inProgress / total) * 100}%`,
                background: '#ffb464',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                color: '#000',
                fontWeight: 600,
              }}
              title={`In Progress: ${inProgress}`}
            >
              {inProgress > 0 && `${Math.round((inProgress / total) * 100)}%`}
            </div>
          )}
          {closed > 0 && (
            <div
              style={{
                width: `${(closed / total) * 100}%`,
                background: '#666',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                color: '#fff',
                fontWeight: 600,
              }}
              title={`Closed: ${closed}`}
            >
              {closed > 0 && `${Math.round((closed / total) * 100)}%`}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', fontSize: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <div style={{ width: 12, height: 12, background: '#4ade80', borderRadius: 2 }} />
            <span style={{ color: '#888' }}>Open</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <div style={{ width: 12, height: 12, background: '#ffb464', borderRadius: 2 }} />
            <span style={{ color: '#888' }}>In Progress</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <div style={{ width: 12, height: 12, background: '#666', borderRadius: 2 }} />
            <span style={{ color: '#888' }}>Closed</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const width = max > 0 ? (value / max) * 100 : 0

  return (
    <div className="dashboard-bar-row">
      <div className="dashboard-bar-label">{label}</div>
      <div className="dashboard-bar-container">
        <div
          className="dashboard-bar"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
      <div className="dashboard-bar-value">{value}</div>
    </div>
  )
}
