import { useState, useEffect } from 'react'

interface User {
  id: number
  github_id: number
  github_login: string
  github_name: string | null
  github_avatar_url: string
  role: 'admin' | 'premium' | 'user' | 'guest'
  created_at: string
  last_login_at: string | null
}

interface Settings {
  registration_mode?: 'open' | 'closed'
  notification_mode?: 'immediate' | 'batched'
  anonymous_access?: 'enabled' | 'disabled'
}

interface RepoWebhook {
  id: number
  owner: string
  name: string
  webhook_owner_id: number | null
  webhook_owner_login: string | null
  webhook_configured: boolean
}

interface ActionLogEntry {
  id: number
  user_id: number | null
  user_login: string | null
  action: string
  repo_owner: string
  repo_name: string
  issue_id: string | null
  request_payload: string | null
  success: number
  error_message: string | null
  retry_count: number
  conflict_detected: number
  duration_ms: number | null
  request_id: string | null
  created_at: string
}

interface Props {
  onBack: () => void
}

type Tab = 'users' | 'webhooks' | 'logs'

export default function AdminPanel({ onBack }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [webhooks, setWebhooks] = useState<RepoWebhook[]>([])
  const [settings, setSettings] = useState<Settings>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('users')

  // Action log state
  const [logEntries, setLogEntries] = useState<ActionLogEntry[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [logLoading, setLogLoading] = useState(false)
  const [logFilter, setLogFilter] = useState<'all' | 'failures'>('all')
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    await Promise.all([loadUsers(), loadSettings(), loadWebhooks()])
  }

  async function loadUsers() {
    try {
      const res = await fetch('/api/admin/users')
      if (res.ok) {
        const data = await res.json() as { users: User[] }
        setUsers(data.users)
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to load users')
      }
    } catch {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  async function loadSettings() {
    try {
      const res = await fetch('/api/admin/settings')
      if (res.ok) {
        const data = await res.json() as { settings: Settings }
        setSettings(data.settings)
      }
    } catch {
      // Settings might not exist yet, that's ok
    }
  }

  async function loadWebhooks() {
    try {
      const res = await fetch('/api/admin/webhooks')
      if (res.ok) {
        const data = await res.json() as { webhooks: RepoWebhook[] }
        setWebhooks(data.webhooks)
      }
    } catch {
      // Webhooks endpoint might not exist
    }
  }

  async function loadActionLog(filter: 'all' | 'failures' = logFilter) {
    setLogLoading(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (filter === 'failures') {
        params.set('success', 'false')
      }
      const res = await fetch(`/api/admin/action-log?${params}`)
      if (res.ok) {
        const data = await res.json() as { entries: ActionLogEntry[]; total: number }
        setLogEntries(data.entries)
        setLogTotal(data.total)
      }
    } catch {
      // Action log might not exist yet
    } finally {
      setLogLoading(false)
    }
  }

  async function handleRevokeWebhook(repoId: number) {
    if (!confirm('Revoke webhook? This will clear the secret and owner.')) return
    setError(null)
    try {
      const res = await fetch('/api/admin/webhooks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: repoId, action: 'revoke' }),
      })
      if (res.ok) {
        await loadWebhooks()
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to revoke webhook')
      }
    } catch {
      setError('Failed to revoke webhook')
    }
  }

  async function handleTransferWebhook(repoId: number, newOwnerId: number) {
    setError(null)
    try {
      const res = await fetch('/api/admin/webhooks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: repoId, action: 'transfer', new_owner_id: newOwnerId }),
      })
      if (res.ok) {
        await loadWebhooks()
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to transfer webhook')
      }
    } catch {
      setError('Failed to transfer webhook')
    }
  }

  async function handleSettingChange(key: string, value: string) {
    setError(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      if (res.ok) {
        setSettings(prev => ({ ...prev, [key]: value }))
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to update setting')
      }
    } catch {
      setError('Failed to update setting')
    }
  }

  async function handleRoleChange(userId: number, newRole: 'admin' | 'premium' | 'user' | 'guest') {
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (res.ok) {
        await loadUsers()
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to update user role')
      }
    } catch {
      setError('Failed to update user role')
    }
  }

  async function handleDelete(userId: number, login: string) {
    if (!confirm(`Delete user @${login}? This will also delete all their repositories.`)) {
      return
    }

    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
      if (res.ok) {
        await loadUsers()
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Failed to delete user')
      }
    } catch {
      setError('Failed to delete user')
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleDateString()
  }

  return (
    <div className="card">
      <div className="flex-between mb-3">
        <h2>Admin Panel</h2>
        <button onClick={onBack}>Back</button>
      </div>

      {error && <div className="error mb-2">{error}</div>}

      <div className="mb-3" style={{ padding: '1rem', background: '#1a1a24', borderRadius: '4px', border: '1px solid #2a2a3a' }}>
        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Settings</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Registration:</span>
            <select
              value={settings.registration_mode || 'open'}
              onChange={(e) => handleSettingChange('registration_mode', e.target.value)}
              style={{ padding: '0.25rem' }}
            >
              <option value="open">Open (anyone can sign up)</option>
              <option value="closed">Closed (existing users only)</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Notifications:</span>
            <select
              value={settings.notification_mode || 'immediate'}
              onChange={(e) => handleSettingChange('notification_mode', e.target.value)}
              style={{ padding: '0.25rem' }}
            >
              <option value="immediate">Send immediately</option>
              <option value="batched">Batch with backoff (1-5 min)</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Anonymous Access:</span>
            <select
              value={settings.anonymous_access || 'disabled'}
              onChange={(e) => handleSettingChange('anonymous_access', e.target.value)}
              style={{ padding: '0.25rem' }}
            >
              <option value="disabled">Disabled (login required)</option>
              <option value="enabled">Enabled (browse steveyegge/beads without login)</option>
            </select>
          </label>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '0.5rem 1rem',
            background: activeTab === 'users' ? '#0077cc' : '#2a2a3a',
            color: activeTab === 'users' ? 'white' : '#aaa',
          }}
        >
          Users ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('webhooks')}
          style={{
            padding: '0.5rem 1rem',
            background: activeTab === 'webhooks' ? '#0077cc' : '#2a2a3a',
            color: activeTab === 'webhooks' ? 'white' : '#aaa',
          }}
        >
          Webhooks ({webhooks.filter(w => w.webhook_configured).length}/{webhooks.length})
        </button>
        <button
          onClick={() => {
            setActiveTab('logs')
            if (logEntries.length === 0) loadActionLog()
          }}
          style={{
            padding: '0.5rem 1rem',
            background: activeTab === 'logs' ? '#0077cc' : '#2a2a3a',
            color: activeTab === 'logs' ? 'white' : '#aaa',
          }}
        >
          Action Log
        </button>
      </div>

      {activeTab === 'users' && (
        <>
          {loading ? (
            <div className="loading">Loading...</div>
          ) : users.length === 0 ? (
            <p>No users found.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <img
                          src={user.github_avatar_url}
                          alt={user.github_login}
                          style={{ width: 24, height: 24, borderRadius: '50%' }}
                        />
                        <div>
                          <div>{user.github_name || user.github_login}</div>
                          <div style={{ fontSize: '0.75rem', color: '#888' }}>
                            @{user.github_login}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as 'admin' | 'premium' | 'user' | 'guest')}
                        style={{ padding: '0.25rem' }}
                      >
                        <option value="admin">Admin</option>
                        <option value="premium">Premium</option>
                        <option value="user">User</option>
                        <option value="guest">Guest</option>
                      </select>
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>
                      {formatDate(user.last_login_at)}
                    </td>
                    <td>
                      <button
                        onClick={() => handleDelete(user.id, user.github_login)}
                        className="btn-danger"
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem'
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {activeTab === 'webhooks' && (
        <>
          {loading ? (
            <div className="loading">Loading...</div>
          ) : webhooks.length === 0 ? (
            <p>No repositories found.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map(webhook => (
                  <tr key={webhook.id}>
                    <td>
                      <code style={{ fontSize: '0.875rem' }}>
                        {webhook.owner}/{webhook.name}
                      </code>
                    </td>
                    <td>
                      <span
                        className={`badge ${webhook.webhook_configured ? 'badge-open' : 'badge-closed'}`}
                      >
                        {webhook.webhook_configured ? 'Configured' : 'Not configured'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>
                      {webhook.webhook_owner_login ? (
                        <span style={{ color: '#4dc3ff' }}>@{webhook.webhook_owner_login}</span>
                      ) : (
                        <span style={{ color: '#666' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {webhook.webhook_configured && (
                          <button
                            onClick={() => handleRevokeWebhook(webhook.id)}
                            className="btn-danger"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          >
                            Revoke
                          </button>
                        )}
                        {webhook.webhook_owner_id && (
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleTransferWebhook(webhook.id, Number(e.target.value))
                                e.target.value = ''
                              }
                            }}
                            style={{ padding: '0.25rem', fontSize: '0.75rem' }}
                          >
                            <option value="" disabled>Transfer to...</option>
                            {users
                              .filter(u => u.id !== webhook.webhook_owner_id)
                              .map(u => (
                                <option key={u.id} value={u.id}>
                                  @{u.github_login}
                                </option>
                              ))}
                          </select>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {activeTab === 'logs' && (
        <>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
            <select
              value={logFilter}
              onChange={(e) => {
                const filter = e.target.value as 'all' | 'failures'
                setLogFilter(filter)
                loadActionLog(filter)
              }}
              style={{ padding: '0.5rem' }}
            >
              <option value="all">All entries</option>
              <option value="failures">Failures only</option>
            </select>
            <button
              onClick={() => loadActionLog()}
              style={{ padding: '0.5rem 1rem', background: '#2a2a3a' }}
            >
              Refresh
            </button>
            <span style={{ color: '#888', fontSize: '0.875rem' }}>
              {logTotal} total entries
            </span>
          </div>

          {logLoading ? (
            <div className="loading">Loading...</div>
          ) : logEntries.length === 0 ? (
            <p style={{ color: '#888' }}>No action log entries yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {logEntries.map(entry => (
                <div
                  key={entry.id}
                  style={{
                    background: '#1a1a24',
                    border: `1px solid ${entry.success ? '#2a2a3a' : '#662222'}`,
                    borderRadius: '4px',
                    padding: '0.75rem',
                  }}
                >
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
                    onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                  >
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          padding: '0.125rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: entry.success ? '#1a3a1a' : '#3a1a1a',
                          color: entry.success ? '#4ade80' : '#f87171',
                        }}
                      >
                        {entry.success ? 'OK' : 'FAIL'}
                      </span>
                      <code style={{ fontSize: '0.875rem', color: '#4dc3ff' }}>
                        {entry.action}
                      </code>
                      <span style={{ color: '#888', fontSize: '0.875rem' }}>
                        {entry.repo_owner}/{entry.repo_name}
                        {entry.issue_id && <> → {entry.issue_id}</>}
                      </span>
                      {entry.user_login && (
                        <span style={{ color: '#888', fontSize: '0.75rem' }}>
                          by @{entry.user_login}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {entry.conflict_detected === 1 && (
                        <span
                          style={{
                            padding: '0.125rem 0.375rem',
                            borderRadius: '4px',
                            fontSize: '0.625rem',
                            background: '#3a2a1a',
                            color: '#fbbf24',
                          }}
                        >
                          CONFLICT
                        </span>
                      )}
                      {entry.retry_count > 0 && (
                        <span style={{ color: '#888', fontSize: '0.75rem' }}>
                          {entry.retry_count} retries
                        </span>
                      )}
                      <span style={{ color: '#666', fontSize: '0.75rem' }}>
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                      <span style={{ color: '#666', fontSize: '0.75rem' }}>
                        {expandedEntry === entry.id ? '▼' : '▶'}
                      </span>
                    </div>
                  </div>

                  {expandedEntry === entry.id && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #2a2a3a' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem', fontSize: '0.875rem' }}>
                        <span style={{ color: '#666' }}>Request ID:</span>
                        <code style={{ color: '#888' }}>{entry.request_id || '—'}</code>

                        <span style={{ color: '#666' }}>Duration:</span>
                        <span style={{ color: '#888' }}>{entry.duration_ms ? `${entry.duration_ms}ms` : '—'}</span>

                        {entry.error_message && (
                          <>
                            <span style={{ color: '#666' }}>Error:</span>
                            <span style={{ color: '#f87171' }}>{entry.error_message}</span>
                          </>
                        )}

                        {entry.request_payload && (
                          <>
                            <span style={{ color: '#666' }}>Payload:</span>
                            <pre style={{
                              margin: 0,
                              padding: '0.5rem',
                              background: '#0d0d12',
                              borderRadius: '4px',
                              overflow: 'auto',
                              maxHeight: '200px',
                              fontSize: '0.75rem',
                              color: '#888',
                            }}>
                              {JSON.stringify(JSON.parse(entry.request_payload), null, 2)}
                            </pre>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
